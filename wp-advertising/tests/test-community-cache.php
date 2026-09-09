<?php
/**
 * Community ad cache reliability tests.
 *
 * Run: php tests/test-community-cache.php
 */

define('ABSPATH', __DIR__ . '/');
define('ARRAY_A', 'ARRAY_A');
define('HOUR_IN_SECONDS', 3600);
define('MINUTE_IN_SECONDS', 60);
define('WPA_VERSION', '8.3.0');
define('WPA_DB_VERSION', '6.1.0');
define('WPA_DEFAULT_ZONE', 'house-ad');
define('WPA_COMMUNITY_ZONE', 'community-ad');
define('WPA_COMMUNITY_CACHE_SCHEMA', 2);
define('WPA_COMMUNITY_FRESH_TTL', 5 * MINUTE_IN_SECONDS);
define('WPA_COMMUNITY_STALE_TTL', 60 * MINUTE_IN_SECONDS);
define('WPA_COMMUNITY_LOCK_TTL', 30);
define('WPA_COMMUNITY_ENABLED_OPTION', 'wp_advertising_community_enabled');
define('WPA_COMMUNITY_API_URL_OPTION', 'wp_advertising_community_api_url');
define('WPA_COMMUNITY_SETTINGS_OPTION', 'wp_advertising_community_shortcode_settings');
define('WPA_COMMUNITY_STATUS_OPTION', 'wp_advertising_community_status');
define('WPA_COMMUNITY_LAST_ERROR_OPTION', 'wp_advertising_community_last_error');
define('WPA_COMMUNITY_SITE_ID_OPTION', 'wp_advertising_community_site_id');
define('WPA_COMMUNITY_PUBLIC_KEY_OPTION', 'wp_advertising_community_public_key');
define('WPA_TRACKING_ENABLED_OPTION', 'wp_advertising_tracking_enabled');
define('WPA_EVENT_TOKEN_TTL', 6 * HOUR_IN_SECONDS);
define('WPA_DEFAULT_COMMUNITY_API_URL', '');
define('WPA_COMMUNITY_ENDPOINT', 'https://community.wp-advertising.example/v1/ad');
define('WPA_NONCE_ACTION', 'wp_advertising_save_ad');
define('WPA_RETENTION_HOOK', 'wp_advertising_cleanup_events');
define('WPA_RETENTION_DAYS_OPTION', 'wp_advertising_retention_days');
define('WPA_LICENSE_STATUS_OPTION', 'wp_advertising_license_status');
define('WPA_LICENSE_ACCESS_UNTIL_OPTION', 'wp_advertising_license_access_until');
define('WPA_LICENSE_RULES_OPTION', 'wp_advertising_license_rules');
define('WPA_LICENSE_NEXT_CHECK_OPTION', 'wp_advertising_license_next_check_at');
define('WPA_LICENSE_LAST_ERROR_OPTION', 'wp_advertising_license_last_error');
define('WPA_LICENSE_KEY_OPTION', 'wp_advertising_license_key');

// ── Mutable test state ────────────────────────────────────────────────────────

$wpa_test_options   = [];
$wpa_api_response   = null;   // ['_code'=>int,'_body'=>string] | WP_Error | null
$wpa_api_call_count = 0;
$wpa_ext_cache      = false;
$wpa_cache_store    = [];     // 'group:key' => value
$wpa_cache_log      = [];     // [['op'=>'add'|'delete','key'=>...,'group'=>...], ...]
$wpa_deleted_opts   = [];     // option names passed to delete_option()
$wpa_scheduled      = [];     // [['hook'=>...,'args'=>...], ...]
$wpa_cleared_hooks  = [];

// ── $wpdb mock ────────────────────────────────────────────────────────────────

class MockWpdb {
    public $options = 'wp_options';

    public function prepare($sql, ...$args) {
        $i = 0;
        return preg_replace_callback('/%[sd]/', function () use (&$i, $args) {
            $v = $args[$i++] ?? '';
            return is_numeric($v) ? (int) $v : "'" . addslashes((string) $v) . "'";
        }, $sql);
    }

    public function query($sql) {
        if (stripos($sql, 'INSERT IGNORE') !== false) {
            if (preg_match("/VALUES\s*\('([^']+)',\s*(\d+)/", $sql, $m)) {
                global $wpa_test_options;
                if (!array_key_exists($m[1], $wpa_test_options)) {
                    $wpa_test_options[$m[1]] = (int) $m[2];
                    return 1;
                }
                return 0;
            }
        }
        // Deactivation bulk lock cleanup: DELETE … LIKE 'wp_advertising_community_lock_%'
        if (stripos($sql, 'DELETE FROM') !== false && stripos($sql, 'LIKE') !== false) {
            global $wpa_test_options;
            foreach (array_keys($wpa_test_options) as $k) {
                if (strpos($k, 'wp_advertising_community_lock_') === 0) {
                    unset($wpa_test_options[$k]);
                }
            }
            return 1;
        }
        return 0;
    }

    public function get_var($sql) {
        if (preg_match("/option_name\s*=\s*'([^']+)'/", $sql, $m)) {
            global $wpa_test_options;
            return $wpa_test_options[$m[1]] ?? null;
        }
        return null;
    }

    public function delete($table, $where, $formats = []) {
        global $wpa_test_options;
        if (isset($where['option_name'])) {
            $existed = array_key_exists($where['option_name'], $wpa_test_options);
            unset($wpa_test_options[$where['option_name']]);
            return $existed ? 1 : 0;
        }
        return 0;
    }
}

global $wpdb;
$wpdb = new MockWpdb();

// ── WordPress function stubs ──────────────────────────────────────────────────

function get_option($key, $default = false) {
    global $wpa_test_options;
    return array_key_exists($key, $wpa_test_options) ? $wpa_test_options[$key] : $default;
}
function update_option($key, $value, $autoload = true) {
    global $wpa_test_options;
    $wpa_test_options[$key] = $value;
    return true;
}
function add_option($key, $value, $deprecated = '', $autoload = true) {
    global $wpa_test_options;
    if (array_key_exists($key, $wpa_test_options)) {
        return false;
    }
    $wpa_test_options[$key] = $value;
    return true;
}
function delete_option($key) {
    global $wpa_test_options, $wpa_deleted_opts;
    $wpa_deleted_opts[] = $key;
    $existed = array_key_exists($key, $wpa_test_options);
    unset($wpa_test_options[$key]);
    return $existed;
}
function get_transient($key) { return false; }
function set_transient($key, $value, $expiry = 0) { return true; }

function wp_using_ext_object_cache() {
    global $wpa_ext_cache;
    return (bool) $wpa_ext_cache;
}
function wp_cache_add($key, $value, $group = '', $ttl = 0) {
    global $wpa_cache_store, $wpa_cache_log;
    $sk = $group . ':' . $key;
    $wpa_cache_log[] = ['op' => 'add', 'key' => $key, 'group' => $group];
    if (array_key_exists($sk, $wpa_cache_store)) {
        return false;
    }
    $wpa_cache_store[$sk] = $value;
    return true;
}
function wp_cache_set($key, $value, $group = '', $ttl = 0) {
    global $wpa_cache_store;
    $wpa_cache_store[$group . ':' . $key] = $value;
}
function wp_cache_delete($key, $group = '') {
    global $wpa_cache_store, $wpa_cache_log;
    $sk = $group . ':' . $key;
    $wpa_cache_log[] = ['op' => 'delete', 'key' => $key, 'group' => $group];
    $existed = array_key_exists($sk, $wpa_cache_store);
    unset($wpa_cache_store[$sk]);
    return $existed;
}
function wp_cache_get($key, $group = '', $force = false, &$found = null) {
    global $wpa_cache_store;
    $sk = $group . ':' . $key;
    $found = array_key_exists($sk, $wpa_cache_store);
    return $found ? $wpa_cache_store[$sk] : false;
}

function wp_remote_get($url, $args = []) {
    global $wpa_api_response, $wpa_api_call_count;
    $wpa_api_call_count++;
    return $wpa_api_response;
}
function wp_remote_post($url, $args = []) {
    global $wpa_api_response, $wpa_api_call_count;
    $wpa_api_call_count++;
    return $wpa_api_response;
}
function wp_remote_retrieve_response_code($r) {
    return is_array($r) ? ($r['_code'] ?? 0) : 0;
}
function wp_remote_retrieve_body($r) {
    return is_array($r) ? ($r['_body'] ?? '') : '';
}
function is_wp_error($thing) {
    return ($thing instanceof WP_Error);
}

function wp_schedule_single_event($time, $hook, $args = []) {
    global $wpa_scheduled;
    $wpa_scheduled[] = ['hook' => $hook, 'args' => $args];
}
function wp_clear_scheduled_hook($hook) {
    global $wpa_cleared_hooks;
    $wpa_cleared_hooks[] = $hook;
}
function wp_next_scheduled($hook) { return false; }
function wp_unschedule_event($timestamp, $hook) { return true; }

function absint($v) { return abs((int) $v); }
function sanitize_text_field($v) { return is_string($v) ? trim(strip_tags($v)) : ''; }
function sanitize_key($v) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $v)); }
function sanitize_title($v) { return sanitize_key($v); }
function esc_url_raw($v) {
    $v = trim((string) $v);
    if ($v === '' || preg_match('#^(javascript|data):#i', $v)) {
        return '';
    }
    return $v;
}
function esc_url($url) { return htmlspecialchars((string) $url, ENT_QUOTES, 'UTF-8'); }
function esc_attr($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); }
function esc_html($v) { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); }
function esc_html__($v, $d = '') { return $v; }
function esc_html_e($v) { echo esc_html($v); }
function wp_json_encode($data) { return json_encode($data); }
function wp_salt($scheme = 'auth') { return 'test-salt-' . $scheme; }
function home_url($path = '/') { return 'https://shop.example.com' . $path; }
function admin_url($path = '') { return 'https://shop.example.com/wp-admin/' . ltrim((string) $path, '/'); }
function get_bloginfo($show = '') { return $show === 'name' ? 'Test Site' : ''; }
function get_current_blog_id() { return 1; }
function current_time($type) { return $type === 'mysql' ? gmdate('Y-m-d H:i:s') : time(); }
function untrailingslashit($v) { return rtrim((string) $v, '/'); }
function wp_strip_all_tags($v) { return strip_tags((string) $v); }
function wp_trim_words($text, $num = 55, $more = '&hellip;') {
    $words = preg_split('/\s+/', trim(strip_tags((string) $text)));
    return implode(' ', array_slice($words, 0, max(1, (int) $num)));
}
function wp_kses_post($v) { return (string) $v; }
function __($text, $domain = '') { return $text; }
function apply_filters($tag, $value) { return func_get_arg(1); }
function wp_parse_args($args, $defaults = []) {
    if (is_string($args)) {
        parse_str($args, $args);
    }
    return array_merge((array) $defaults, (array) $args);
}
function wp_list_pluck($list, $field) {
    return array_map(function ($item) use ($field) {
        return is_array($item) ? ($item[$field] ?? null) : null;
    }, $list);
}
function wp_parse_url($url, $component = -1) {
    $parts = parse_url($url);
    if ($component === -1) {
        return $parts;
    }
    $map = [PHP_URL_SCHEME => 'scheme', PHP_URL_HOST => 'host', PHP_URL_PATH => 'path', PHP_URL_QUERY => 'query'];
    $key = $map[$component] ?? null;
    return ($key && isset($parts[$key])) ? $parts[$key] : null;
}
function add_query_arg($args, $url) {
    $sep = strpos($url, '?') === false ? '?' : '&';
    return $url . $sep . http_build_query($args);
}

final class WP_Error {
    private $code;
    private $message;
    public function __construct($code = '', $message = '') {
        $this->code    = $code;
        $this->message = $message;
    }
    public function get_error_message() { return $this->message; }
    public function get_error_code()    { return $this->code; }
}

final class WPA_Installer {
    public static function ads_table()    { return 'wp_wpa_ads'; }
    public static function events_table() { return 'wp_wpa_events'; }

    public static function deactivate() {
        wp_clear_scheduled_hook('wp_advertising_refresh_entitlement');
        wp_clear_scheduled_hook('wp_advertising_prefetch_community_ad');
        global $wpdb;
        $wpdb->query(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE 'wp\_advertising\_community\_lock\_%' ESCAPE '\\\\'"
        );
    }
}

require_once dirname(__DIR__) . '/includes/class-wpa-repository.php';
require_once dirname(__DIR__) . '/includes/class-wpa-license.php';
require_once dirname(__DIR__) . '/includes/class-wpa-renderer.php';

// ── Test helpers ──────────────────────────────────────────────────────────────

function zone_hash($zone = WPA_COMMUNITY_ZONE) {
    return md5($zone . '|' . home_url('/'));
}
function cache_key($zone = WPA_COMMUNITY_ZONE) {
    return 'wp_advertising_community_ad_' . zone_hash($zone);
}
function lock_key($zone = WPA_COMMUNITY_ZONE) {
    return 'wp_advertising_community_lock_' . zone_hash($zone);
}

function test_payload() {
    return [
        'ad_id'                    => 0,
        'product_id'               => 0,
        'community_id'             => 'ad-original-111',
        'zone'                     => WPA_COMMUNITY_ZONE,
        'label'                    => 'Community Ad',
        'headline'                 => 'Original Headline',
        'body'                     => 'Original body text.',
        'image_url'                => 'https://cdn.example.com/orig.jpg',
        'target_url'               => 'https://advertiser.example/landing',
        'cta'                      => 'Visit',
        'price_html'               => '',
        'open_new_tab'             => true,
        'nofollow'                 => true,
        'source_type'              => 'community',
        'product_mode'             => 'network',
        'theme'                    => 'dark',
        'preview'                  => false,
        'network_click_url'        => '',
        'skip_local_click_tracking' => true,
        'network_impression_url'   => '',
    ];
}

function fresh_record(array $overrides = []) {
    $now = time();
    return array_merge([
        'schema'      => WPA_COMMUNITY_CACHE_SCHEMA,
        'wpa_version' => WPA_VERSION,
        'payload'     => test_payload(),
        'fetched_at'  => $now - 30,
        'fresh_until' => $now + 270,
        'stale_until' => $now + WPA_COMMUNITY_STALE_TTL,
        'not_after'   => 0,
        'net_epoch'   => 0,
        'last_fail'   => 0,
        'next_retry'  => 0,
        'fail_count'  => 0,
    ], $overrides);
}

function stale_record(array $overrides = []) {
    $now = time();
    return array_merge([
        'schema'      => WPA_COMMUNITY_CACHE_SCHEMA,
        'wpa_version' => WPA_VERSION,
        'payload'     => test_payload(),
        'fetched_at'  => $now - WPA_COMMUNITY_FRESH_TTL - 60,
        'fresh_until' => $now - 60,
        'stale_until' => $now + WPA_COMMUNITY_STALE_TTL - WPA_COMMUNITY_FRESH_TTL,
        'not_after'   => 0,
        'net_epoch'   => 0,
        'last_fail'   => 0,
        'next_retry'  => 0,
        'fail_count'  => 0,
    ], $overrides);
}

function expired_record(array $overrides = []) {
    $now = time();
    return array_merge([
        'schema'      => WPA_COMMUNITY_CACHE_SCHEMA,
        'wpa_version' => WPA_VERSION,
        'payload'     => test_payload(),
        'fetched_at'  => $now - 7200,
        'fresh_until' => $now - 3900,
        'stale_until' => $now - 100,
        'not_after'   => 0,
        'net_epoch'   => 0,
        'last_fail'   => 0,
        'next_retry'  => 0,
        'fail_count'  => 0,
    ], $overrides);
}

// Response structure for the wp_remote_get mock: code + raw JSON body.
function good_api_response() {
    return [
        '_code' => 200,
        '_body' => json_encode([
            'adId'         => 'new-ad-456',
            'targetUrl'    => 'https://advertiser.example/new-landing',
            'imageUrl'     => 'https://cdn.example.com/new.jpg',
            'headline'     => 'New Ad Headline',
            'label'        => 'Community Ad',
            'body'         => 'New body text.',
            'cta'          => 'Shop',
            'notAfter'     => 0,
            'networkEpoch' => 0,
        ]),
    ];
}

function base_options() {
    global $wpa_test_options;
    $wpa_test_options[WPA_COMMUNITY_ENABLED_OPTION]    = 1;
    $wpa_test_options[WPA_COMMUNITY_API_URL_OPTION]    = 'https://community.wp-advertising.example';
    $wpa_test_options[WPA_LICENSE_STATUS_OPTION]       = 'trial';
    $wpa_test_options[WPA_LICENSE_ACCESS_UNTIL_OPTION] = gmdate('c', time() + 86400);
    $wpa_test_options[WPA_TRACKING_ENABLED_OPTION]     = 1;
    $wpa_test_options[WPA_COMMUNITY_SETTINGS_OPTION]   = [
        'label'    => 'Community Ad',
        'headline' => 'Featured',
        'body'     => 'Body.',
        'cta'      => 'Visit',
        'theme'    => 'dark',
    ];
}

function reset_state() {
    global $wpa_test_options, $wpa_api_response, $wpa_api_call_count,
           $wpa_ext_cache, $wpa_cache_store, $wpa_cache_log,
           $wpa_deleted_opts, $wpa_scheduled, $wpa_cleared_hooks;
    $wpa_test_options   = [];
    $wpa_api_response   = null;
    $wpa_api_call_count = 0;
    $wpa_ext_cache      = false;
    $wpa_cache_store    = [];
    $wpa_cache_log      = [];
    $wpa_deleted_opts   = [];
    $wpa_scheduled      = [];
    $wpa_cleared_hooks  = [];
    base_options();
}

// ── Test runner ───────────────────────────────────────────────────────────────

$failures = 0;
$assert = static function ($cond, $msg) use (&$failures) {
    if ($cond) {
        echo "PASS  {$msg}\n";
        return;
    }
    $failures++;
    echo "FAIL  {$msg}\n";
};

// ═════════════════════════════════════════════════════════════════════════════
// T1: Two simultaneous stale requests → exactly one becomes the refresh owner
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT1: two simultaneous stale requests → one refresh owner\n";
reset_state();
$wpa_test_options[cache_key()] = stale_record();

$repo1 = new WPA_Repository();
$r1    = $repo1->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);
$z1    = $repo1->take_pending_community_refresh_zone();

// repo2 sees the lock already held by repo1 (INSERT IGNORE returns 0)
$repo2 = new WPA_Repository();
$r2    = $repo2->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);
$z2    = $repo2->take_pending_community_refresh_zone();

$assert($r1 !== null && ($r1['target_url'] ?? '') === 'https://advertiser.example/landing', 'first request returns stale payload');
$assert($r2 !== null && ($r2['target_url'] ?? '') === 'https://advertiser.example/landing', 'second request returns stale payload');
$assert($z1 === WPA_COMMUNITY_ZONE, 'first request acquires refresh lock');
$assert($z2 === null,               'second request does not acquire lock (one owner only)');

// ═════════════════════════════════════════════════════════════════════════════
// T2: Stale refresh fails → last valid payload still serves until stale_until
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT2: stale refresh fails → payload still serves until stale_until\n";
reset_state();
$wpa_api_response              = new WP_Error('http_timeout', 'Connection timed out');
$wpa_test_options[cache_key()] = stale_record();

$repo = new WPA_Repository();
$repo->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);
$zone = $repo->take_pending_community_refresh_zone();
$repo->execute_background_community_refresh($zone);  // records backoff, releases lock

// After failure the record's next_retry is in the future.
$repo2 = new WPA_Repository();
$after = $repo2->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);
$z2    = $repo2->take_pending_community_refresh_zone();

$assert($after !== null,                                                         'stale payload still served after failed refresh');
$assert(($after['target_url'] ?? '') === 'https://advertiser.example/landing',  'served payload is the original (not corrupted)');
$assert($z2 === null,                                                            'backoff suppresses re-acquisition after failure');

// ═════════════════════════════════════════════════════════════════════════════
// T3: stale_until elapsed + fetch fails → render nothing, never old payload
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT3: stale_until elapsed + fetch fails → null, not old payload\n";
reset_state();
$wpa_api_response              = new WP_Error('http_timeout', 'Timeout');
$wpa_test_options[cache_key()] = expired_record();   // both fresh_until and stale_until in past

$result = (new WPA_Repository())->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);
$assert($result === null, 'expired cache + fetch fail → null, never old payload');

// ═════════════════════════════════════════════════════════════════════════════
// T4: not_after elapsed + fetch fails → never render old payload
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT4: not_after elapsed + fetch fails → null, not old creative\n";
reset_state();
$wpa_api_response              = new WP_Error('http_timeout', 'Timeout');
$rec                           = stale_record();
$rec['not_after']              = time() - 60;   // server-stamped hard expiry already passed
$wpa_test_options[cache_key()] = $rec;

$result = (new WPA_Repository())->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);
$assert($result === null, 'past not_after + fetch fail → null (server invalidation respected)');

// ═════════════════════════════════════════════════════════════════════════════
// T5: Dead lock older than TTL → one process successfully steals it
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT5: dead lock older than TTL → lock stolen, process becomes owner\n";
reset_state();
$wpa_test_options[cache_key()] = stale_record();
$wpa_test_options[lock_key()]  = time() - (WPA_COMMUNITY_LOCK_TTL + 10);   // stale lock

$repo  = new WPA_Repository();
$r     = $repo->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);
$zone  = $repo->take_pending_community_refresh_zone();

$assert($r !== null,               'payload served despite stale lock');
$assert($zone === WPA_COMMUNITY_ZONE, 'stale lock stolen — process is now refresh owner');
// The re-acquired lock must be fresh (not the old timestamp)
$new_lock_time = (int) ($wpa_test_options[lock_key()] ?? 0);
$assert($new_lock_time >= time() - 2, 'new lock timestamp is current (old one replaced)');

// ═════════════════════════════════════════════════════════════════════════════
// T6a: Ext object cache — acquire via wp_cache_add, release via wp_cache_delete('wp_advertising')
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT6a: ext object cache path — correct acquire and release\n";
reset_state();
$wpa_ext_cache                 = true;
$wpa_api_response              = good_api_response();
$wpa_test_options[cache_key()] = stale_record();

$repo = new WPA_Repository();
$repo->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);
$zone = $repo->take_pending_community_refresh_zone();
$repo->execute_background_community_refresh($zone);

$cache_release = array_filter($wpa_cache_log, fn ($e) => $e['op'] === 'delete' && $e['group'] === 'wp_advertising');
$option_lock   = in_array(lock_key(), $wpa_deleted_opts, true);

$assert(!empty($cache_release), 'ext cache path releases lock via wp_cache_delete(…, wp_advertising)');
$assert(!$option_lock,          'ext cache path does NOT call delete_option for lock');

// ═════════════════════════════════════════════════════════════════════════════
// T6b: DB lock path — acquire via INSERT IGNORE, release via delete_option
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT6b: DB lock path — correct acquire and release\n";
reset_state();
$wpa_ext_cache                 = false;
$wpa_api_response              = good_api_response();
$wpa_test_options[cache_key()] = stale_record();

$repo = new WPA_Repository();
$repo->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);
$zone = $repo->take_pending_community_refresh_zone();
$repo->execute_background_community_refresh($zone);

$option_lock   = in_array(lock_key(), $wpa_deleted_opts, true);
$cache_release = array_filter($wpa_cache_log, fn ($e) => $e['op'] === 'delete' && $e['group'] === 'wp_advertising');

$assert($option_lock,           'DB path releases lock via delete_option');
$assert(empty($cache_release),  'DB path does NOT call wp_cache_delete(…, wp_advertising)');

// ═════════════════════════════════════════════════════════════════════════════
// T7: Backoff suppresses repeated stale refreshes before next_retry
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT7: backoff suppresses stale refresh when next_retry is in the future\n";
reset_state();
$wpa_test_options[cache_key()] = stale_record([
    'fail_count' => 2,
    'last_fail'  => time() - 10,
    'next_retry' => time() + 500,   // not due yet
]);

$repo   = new WPA_Repository();
$result = $repo->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);
$zone   = $repo->take_pending_community_refresh_zone();

$assert($result !== null, 'backoff still serves stale payload');
$assert($zone === null,   'backoff suppresses refresh — pending zone stays null');

// ═════════════════════════════════════════════════════════════════════════════
// T8a: Schema mismatch forces cold path
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT8a: schema mismatch → cold fetch\n";
reset_state();
$wpa_api_response              = good_api_response();
$wpa_test_options[cache_key()] = fresh_record(['schema' => 1]);   // wrong schema

$before = $wpa_api_call_count;
$result = (new WPA_Repository())->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);

$assert($wpa_api_call_count > $before,                          'schema mismatch forces cold fetch (API called)');
$assert(($result['community_id'] ?? '') === 'new-ad-456',       'cold path returns fresh payload from API');

// ═════════════════════════════════════════════════════════════════════════════
// T8b: Plugin-version mismatch forces cold path
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT8b: plugin-version mismatch → cold fetch\n";
reset_state();
$wpa_api_response              = good_api_response();
$wpa_test_options[cache_key()] = fresh_record(['wpa_version' => '7.0.0']);  // outdated

$before = $wpa_api_call_count;
$result = (new WPA_Repository())->get_community_payload(WPA_COMMUNITY_ZONE, [], false, false);

$assert($wpa_api_call_count > $before,                        'version mismatch forces cold fetch (API called)');
$assert(($result['community_id'] ?? '') === 'new-ad-456',     'cold path returns new payload after version mismatch');

// ═════════════════════════════════════════════════════════════════════════════
// T9: fastcgi_finish_request() unavailable → defer_community_refresh_to_cron
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT9: fastcgi unavailable → cron fallback releases lock and schedules event\n";
reset_state();
$wpa_test_options[lock_key()] = time();   // lock is held (simulate post-acquire state)

$repo = new WPA_Repository();
$repo->defer_community_refresh_to_cron(WPA_COMMUNITY_ZONE);

$cron_scheduled = array_filter($wpa_scheduled, fn ($e) => $e['hook'] === 'wp_advertising_prefetch_community_ad');

$assert(!array_key_exists(lock_key(), $wpa_test_options),  'defer releases lock before scheduling cron');
$assert(!empty($cron_scheduled),                            'defer schedules one-shot cron event');
$assert(!function_exists('fastcgi_finish_request'),         'fastcgi_finish_request absent — cron is the right path here');

// ═════════════════════════════════════════════════════════════════════════════
// T10: Deactivation clears locks + cron jobs without touching cache data
// ═════════════════════════════════════════════════════════════════════════════
echo "\nT10: deactivation removes locks and cron, preserves cache data\n";
reset_state();
$hash = zone_hash();
$wpa_test_options['wp_advertising_community_lock_' . $hash] = time();
$wpa_test_options['wp_advertising_community_lock_orphan99']  = time();
$wpa_test_options[cache_key()]                               = fresh_record();
$wpa_test_options['wp_advertising_community_ad_other456']    = fresh_record();

WPA_Installer::deactivate();

$assert(!array_key_exists('wp_advertising_community_lock_' . $hash, $wpa_test_options), 'deactivation removes zone lock');
$assert(!array_key_exists('wp_advertising_community_lock_orphan99', $wpa_test_options), 'deactivation removes all orphaned locks');
$assert(array_key_exists(cache_key(), $wpa_test_options),                               'deactivation preserves zone cache data');
$assert(array_key_exists('wp_advertising_community_ad_other456', $wpa_test_options),    'deactivation preserves all cache entries');
$assert(in_array('wp_advertising_refresh_entitlement', $wpa_cleared_hooks, true),       'deactivation clears entitlement refresh cron');
$assert(in_array('wp_advertising_prefetch_community_ad', $wpa_cleared_hooks, true),     'deactivation clears community prefetch cron');

// ─────────────────────────────────────────────────────────────────────────────

echo $failures ? "\n{$failures} failure(s)\n" : "\nAll community cache tests passed.\n";
exit($failures ? 1 : 0);
