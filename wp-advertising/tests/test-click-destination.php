<?php
/**
 * Regression: click destinations must come from the signed token (or product snapshot),
 * never fail open to home because ad_id=0 is not a DB row.
 *
 * Run: php tests/test-click-destination.php
 */

define('ABSPATH', __DIR__ . '/');
define('WPA_DEFAULT_ZONE', 'house-ad');
define('WPA_COMMUNITY_ZONE', 'community-ad');
define('WPA_EVENT_TOKEN_TTL', 6 * 3600);
define('HOUR_IN_SECONDS', 3600);
define('ARRAY_A', 'ARRAY_A');
define('WPA_COMMUNITY_API_URL_OPTION', 'wp_advertising_community_api_url');
define('WPA_DEFAULT_COMMUNITY_API_URL', '');

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
function wp_json_encode($data) { return json_encode($data); }
function wp_salt($scheme = 'auth') { return 'test-salt-' . $scheme; }
function home_url($path = '/') { return 'https://shop.example.com' . $path; }
function wp_parse_url($url, $component = -1) {
    $parts = parse_url($url);
    if ($component === -1) {
        return $parts;
    }
    $map = [
        PHP_URL_SCHEME => 'scheme',
        PHP_URL_HOST => 'host',
        PHP_URL_PATH => 'path',
        PHP_URL_QUERY => 'query',
    ];
    $key = $map[$component] ?? null;
    return ($key && isset($parts[$key])) ? $parts[$key] : null;
}
function add_query_arg($args, $url) {
    $sep = strpos($url, '?') === false ? '?' : '&';
    return $url . $sep . http_build_query($args);
}
function apply_filters($tag, $value) {
    $args = func_get_args();
    return $args[1];
}
function __($text) { return $text; }
function current_time($type) { return $type === 'mysql' ? gmdate('Y-m-d H:i:s') : time(); }
function untrailingslashit($v) { return rtrim((string) $v, '/'); }
function get_option($key, $default = false) { return $default; }

final class WP_Error {
    public $code;
    public function __construct($code) { $this->code = $code; }
}

final class WPA_Installer {
    public static function ads_table() { return 'wp_wpa_ads'; }
    public static function events_table() { return 'wp_wpa_events'; }
}

function wc_get_product($id) {
    return new class((int) $id) {
        private $id;
        public function __construct($id) { $this->id = $id; }
        public function get_id() { return $this->id; }
        public function is_visible() { return true; }
    };
}
function wc_get_products($args) { return []; }
function get_permalink($id) { return 'https://shop.example.com/product/' . (int) $id . '/'; }

require_once dirname(__DIR__) . '/includes/class-wpa-repository.php';

$repo = new WPA_Repository();
$failures = 0;
$assert = static function ($cond, $msg) use (&$failures) {
    if ($cond) {
        echo "PASS  {$msg}\n";
        return;
    }
    $failures++;
    echo "FAIL  {$msg}\n";
};

$product_url = 'https://shop.example.com/product/cool-hat/?utm_source=house-ad&utm_medium=embed_ad&utm_campaign=wp_advertising';
$token = $repo->make_event_token('click', [
    'ad_id' => 0,
    'product_id' => 123,
    'zone' => WPA_DEFAULT_ZONE,
    'target_url' => $product_url,
]);
$decoded = $repo->validate_event_token($token, 'click');
$assert(!($decoded instanceof WP_Error), 'click token validates');
$assert(($decoded['ad_id'] ?? null) === 0, 'token preserves ad_id=0');
$assert(($decoded['product_id'] ?? null) === 123, 'token preserves product_id');
$assert(($decoded['target'] ?? '') === $product_url, 'token signs immutable target_url');

$dest = $repo->destination_from_click_token($decoded);
$assert($dest === $product_url, 'destination_from_click_token uses signed target for ad_id=0');

$parts = explode('.', $token, 2);
$raw = json_decode($repo->base64url_decode($parts[0]), true);
$raw['target'] = 'https://evil.example.com/phish';
$tampered = $repo->base64url_encode(wp_json_encode($raw)) . '.' . $parts[1];
$assert($repo->validate_event_token($tampered, 'click') instanceof WP_Error, 'tampered target rejects token');

$assert($repo->is_allowed_target_url($product_url, 'signed') === true, 'signed trust accepts product URL');
$assert($repo->is_allowed_target_url('javascript:alert(1)', 'signed') === false, 'signed trust rejects non-http URL');
$assert($repo->is_allowed_target_url('http://localhost/x', 'signed') === false, 'signed trust rejects localhost');
$assert($repo->is_allowed_target_url('https://partner.example.com/x', 'host_allowlist') === true, 'public destinations allowed for all trusts');
$assert($repo->is_publicly_routable_url('https://hatsyshirtsy.com/product/x/') === true, 'public shop URL is routable');
$assert($repo->is_publicly_routable_url('http://localhost:4100/v1/community/events/click?t=1') === false, 'localhost tracking URL is not routable');
$assert($repo->normalize_community_tracking_url('http://localhost:4100/v1/c?t=1') === '', 'localhost network click is dropped without public API base');

$legacy = $repo->destination_from_click_token([
    'ad_id' => 0,
    'product_id' => 123,
    'zone' => WPA_DEFAULT_ZONE,
    'community_target_key' => '',
    'target' => '',
]);
$assert(strpos($legacy, 'https://shop.example.com/product/123/') === 0, 'legacy resolve uses product_id when ad_id=0');
$assert(strpos($legacy, 'utm_source=house-ad') !== false, 'legacy resolve appends UTM params');

$imp = $repo->validate_event_token($repo->make_event_token('impression', [
    'ad_id' => 0,
    'product_id' => 123,
    'zone' => WPA_DEFAULT_ZONE,
    'target_url' => $product_url,
]), 'impression');
$assert(($imp['target'] ?? '') === '', 'impression tokens do not carry target');

echo $failures ? "\n{$failures} failure(s)\n" : "\nAll checks passed.\n";
exit($failures ? 1 : 0);
