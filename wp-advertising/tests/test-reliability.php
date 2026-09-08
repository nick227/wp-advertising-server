<?php
/**
 * Reliability matrix: render-time destination is authoritative at click time.
 *
 * Run: php tests/test-reliability.php
 */

define('ABSPATH', __DIR__ . '/');
define('WPA_DEFAULT_ZONE', 'house-ad');
define('WPA_COMMUNITY_ZONE', 'community-ad');
define('WPA_EVENT_TOKEN_TTL', 6 * 3600);
define('HOUR_IN_SECONDS', 3600);
define('ARRAY_A', 'ARRAY_A');
define('WPA_COMMUNITY_API_URL_OPTION', 'wp_advertising_community_api_url');
define('WPA_DEFAULT_COMMUNITY_API_URL', '');
define('WPA_COMMUNITY_ENABLED_OPTION', 'wp_advertising_community_enabled');
define('WPA_VERSION', '8.3.0');
define('WPA_LICENSE_STATUS_OPTION', 'wp_advertising_license_status');
define('WPA_LICENSE_ACCESS_UNTIL_OPTION', 'wp_advertising_license_access_until');
define('WPA_LICENSE_RULES_OPTION', 'wp_advertising_license_rules');
define('WPA_LICENSE_NEXT_CHECK_OPTION', 'wp_advertising_license_next_check_at');
define('WPA_LICENSE_LAST_ERROR_OPTION', 'wp_advertising_license_last_error');
define('WPA_LICENSE_KEY_OPTION', 'wp_advertising_license_key');

$wpa_test_options = [];

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
function esc_html__($v) { return $v; }
function esc_html_e($v) { echo esc_html($v); }
function wp_json_encode($data) { return json_encode($data); }
function wp_salt($scheme = 'auth') { return 'test-salt-' . $scheme; }
function home_url($path = '/') { return 'https://shop.example.com' . $path; }
function admin_url($path = '') { return 'https://shop.example.com/wp-admin/' . ltrim((string) $path, '/'); }
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
function apply_filters($tag, $value) { return func_get_arg(1); }
function __($text) { return $text; }
function current_time($type) { return $type === 'mysql' ? gmdate('Y-m-d H:i:s') : time(); }
function untrailingslashit($v) { return rtrim((string) $v, '/'); }
function get_option($key, $default = false) {
    global $wpa_test_options;
    return array_key_exists($key, $wpa_test_options) ? $wpa_test_options[$key] : $default;
}
function wp_strip_all_tags($v) { return strip_tags((string) $v); }
function wp_trim_words($text, $num = 55, $more = '&hellip;') {
    $words = preg_split('/\s+/', trim(strip_tags((string) $text)));
    return implode(' ', array_slice($words, 0, max(1, (int) $num)));
}
function wp_kses_post($v) { return (string) $v; }

final class WP_Error {
    public $code;
    public function __construct($code) { $this->code = $code; }
}
final class WPA_Installer {
    public static function ads_table() { return 'wp_wpa_ads'; }
    public static function events_table() { return 'wp_wpa_events'; }
}

function wc_get_product($id) {
    $id = (int) $id;
    if ($id <= 0) {
        return null;
    }
    return new class($id) {
        private $id;
        public function __construct($id) { $this->id = $id; }
        public function get_id() { return $this->id; }
        public function is_visible() { return true; }
    };
}
function wc_get_products($args) { return [101, 102]; }
function get_permalink($id) { return 'https://shop.example.com/product/' . (int) $id . '/'; }

require_once dirname(__DIR__) . '/includes/class-wpa-repository.php';
require_once dirname(__DIR__) . '/includes/class-wpa-license.php';
require_once dirname(__DIR__) . '/includes/class-wpa-renderer.php';

$repo = new WPA_Repository();
$renderer = new WPA_Renderer($repo);
$failures = 0;
$assert = static function ($cond, $msg) use (&$failures) {
    if ($cond) {
        echo "PASS  {$msg}\n";
        return;
    }
    $failures++;
    echo "FAIL  {$msg}\n";
};

$assert($repo->should_serve_community_ad(WPA_DEFAULT_ZONE) === false, 'house-ad never selects community');
$wpa_test_options[WPA_COMMUNITY_ENABLED_OPTION] = 1;
$assert($repo->should_serve_community_ad(WPA_DEFAULT_ZONE) === false, 'house-ad never selects community even when enabled');
$assert($repo->should_serve_community_ad(WPA_COMMUNITY_ZONE) === false, 'community-ad requires entitlement even when enabled');
$wpa_test_options[WPA_LICENSE_STATUS_OPTION] = 'trial';
$wpa_test_options[WPA_LICENSE_ACCESS_UNTIL_OPTION] = gmdate('c', time() + 86400);
$assert($repo->should_serve_community_ad(WPA_COMMUNITY_ZONE) === true, 'community-ad zone selects community when entitled');
$wpa_test_options[WPA_COMMUNITY_ENABLED_OPTION] = 0;
$assert($repo->should_serve_community_ad(WPA_COMMUNITY_ZONE) === false, 'community-ad off when community disabled');

$product_a = 'https://shop.example.com/product/101/?utm_source=house-ad&utm_medium=embed_ad&utm_campaign=random_product_ad';

$token = $repo->make_event_token('click', [
    'ad_id' => 12,
    'product_id' => 101,
    'zone' => WPA_DEFAULT_ZONE,
    'target_url' => $product_a,
]);
$decoded = $repo->validate_event_token($token, 'click');
$assert(!($decoded instanceof WP_Error), 'click token validates');
$assert($repo->destination_from_click_token($decoded) === $product_a, 'track-on path uses signed product URL');

$decoded['product_id'] = 999;
$assert($repo->destination_from_click_token($decoded) === $product_a, 'signed target authoritative after product change');

$payload = [
    'ad_id' => 12,
    'product_id' => 101,
    'zone' => WPA_DEFAULT_ZONE,
    'target_url' => $product_a,
    'label' => 'Ad',
    'headline' => 'Hat',
    'body' => 'Body',
    'image_url' => '',
    'cta' => 'Shop',
    'price_html' => '',
    'open_new_tab' => 1,
    'nofollow' => 1,
    'theme' => 'dark',
];
$html_off = $renderer->card_html($payload, false, false);
$assert(strpos($html_off, esc_url($product_a)) !== false, 'track-off href is exact product URL');

$html_on = $renderer->card_html($payload, false, true);
$assert(strpos($html_on, 'action=wp_advertising_click') !== false, 'track-on href uses local click endpoint');
$assert(strpos($html_on, 'localhost') === false, 'track-on href is not localhost');

$custom = 'https://partner.example.com/landing/?ref=wpa';
$custom_token = $repo->validate_event_token($repo->make_event_token('click', [
    'ad_id' => 5,
    'product_id' => 0,
    'zone' => WPA_DEFAULT_ZONE,
    'target_url' => $custom,
]), 'click');
$assert($repo->destination_from_click_token($custom_token) === $custom, 'custom ad signed destination honored');

$local_token = $repo->validate_event_token($repo->make_event_token('click', [
    'ad_id' => 5,
    'product_id' => 0,
    'zone' => WPA_DEFAULT_ZONE,
    'target_url' => 'http://localhost:8080/private',
]), 'click');
$assert($repo->destination_from_click_token($local_token) === home_url('/'), 'signed localhost destination rejected');

$assert($repo->is_publicly_routable_url('http://localhost:4100/v1/click') === false, 'localhost community click rejected');
$assert($repo->normalize_community_tracking_url('http://localhost:4100/v1/click') === '', 'localhost network click dropped');
$assert($repo->is_publicly_routable_url($product_a) === true, 'public product destination accepted');

$legacy = $repo->destination_from_click_token([
    'ad_id' => 0,
    'product_id' => 101,
    'zone' => WPA_DEFAULT_ZONE,
    'community_target_key' => '',
    'target' => '',
]);
$assert(strpos($legacy, 'https://shop.example.com/product/101/') === 0, 'legacy ad_id=0 uses product_id snapshot');

$assert($repo->destination_from_click_token([
    'ad_id' => 12,
    'product_id' => 101,
    'zone' => WPA_DEFAULT_ZONE,
    'target' => $product_a,
]) === $product_a, 'paused/deleted ad does not invalidate signed destination');

$random_shown = $repo->destination_from_click_token($repo->validate_event_token($repo->make_event_token('click', [
    'ad_id' => 3,
    'product_id' => 102,
    'zone' => WPA_DEFAULT_ZONE,
    'target_url' => 'https://shop.example.com/product/102/?utm_source=house-ad&utm_medium=embed_ad&utm_campaign=random_product_ad',
]), 'click'));
$assert(strpos($random_shown, '/product/102/') !== false, 'random render snapshots exact product 102');

$assert($repo->destination_from_click_token($repo->validate_event_token($repo->make_event_token('click', [
    'ad_id' => 4,
    'product_id' => 101,
    'zone' => WPA_DEFAULT_ZONE,
    'target_url' => $product_a,
]), 'click')) === $product_a, 'specific product signed destination exact');

$template = $repo->default_ad();
$assert((int) $template['id'] === 0, 'default_ad template keeps id 0');
$assert(($template['zone'] ?? '') === WPA_DEFAULT_ZONE, 'default_ad template is house zone');

// Empty house zone must not substitute community (delivery helper invariant).
$wpa_test_options[WPA_COMMUNITY_ENABLED_OPTION] = 1;
$assert($repo->should_serve_community_ad(WPA_DEFAULT_ZONE) === false, 'empty house zone does not substitute community');

// P-1: community cards never embed community-server tracking URLs; clicks use advertiser target.
$community_payload = [
    'ad_id' => 0,
    'product_id' => 0,
    'zone' => WPA_COMMUNITY_ZONE,
    'label' => 'Community',
    'headline' => 'Partner offer',
    'body' => 'Try this product from the network.',
    'image_url' => 'https://cdn.example.com/ad.jpg',
    'target_url' => 'https://advertiser.example/landing',
    'cta' => 'Shop',
    'price_html' => '',
    'open_new_tab' => true,
    'nofollow' => true,
    'source_type' => 'community',
    'theme' => 'dark',
    'network_click_url' => 'https://community.wp-advertising.example/v1/community/events/click?token=abc',
    'network_impression_url' => 'https://community.wp-advertising.example/v1/community/events/impression?token=abc',
    'skip_local_click_tracking' => true,
];
$html = $renderer->card_html($community_payload, false, true);
$assert(strpos($html, 'https://advertiser.example/landing') !== false, 'community card href is advertiser target');
$assert(strpos($html, '/community/events/') === false, 'community card HTML has no community event URLs');
$assert($renderer->impression_url($community_payload) === '', 'community impression URL stays empty (no Railway pixel)');

$wpa_test_options[WPA_COMMUNITY_API_URL_OPTION] = '';
$assert($repo->get_community_api_url() === '', 'blank community API URL means local-only');

echo $failures ? "\n{$failures} failure(s)\n" : "\nAll reliability checks passed.\n";
exit($failures ? 1 : 0);
