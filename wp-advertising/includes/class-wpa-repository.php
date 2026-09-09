<?php
if (!defined('ABSPATH')) {
    exit;
}

final class WPA_Repository {
    private $ads_table;
    private $events_table;
    private $community_refresh_pending_zone = null;

    // Consume-once accessor: returns the pending refresh zone set by get_community_payload()
    // and clears it so repeated calls return null (prevents double-refresh).
    public function take_pending_community_refresh_zone() {
        $zone = $this->community_refresh_pending_zone;
        $this->community_refresh_pending_zone = null;
        return $zone;
    }

    public function __construct() {
        $this->ads_table = WPA_Installer::ads_table();
        $this->events_table = WPA_Installer::events_table();
    }

    public function sanitize_zone($zone) {
        $zone = sanitize_title($zone ?: WPA_DEFAULT_ZONE);
        return $zone ?: WPA_DEFAULT_ZONE;
    }

    public function allowed_theme($theme) {
        $theme = sanitize_key($theme ?: 'dark');
        $allowed = array_keys(WPA_Renderer::themes());
        return in_array($theme, $allowed, true) ? $theme : 'dark';
    }

    public function community_enabled() {
        return (bool) get_option(WPA_COMMUNITY_ENABLED_OPTION, 0);
    }

    public function set_community_enabled($enabled) {
        update_option(WPA_COMMUNITY_ENABLED_OPTION, $enabled ? 1 : 0, false);
    }

    public function tracking_enabled() {
        return (bool) get_option(WPA_TRACKING_ENABLED_OPTION, 1);
    }

    public function set_tracking_enabled($enabled) {
        update_option(WPA_TRACKING_ENABLED_OPTION, $enabled ? 1 : 0, false);
    }


    public function sanitize_community_api_url($url) {
        $url = trim((string) $url);
        if ($url === '') {
            return '';
        }
        $url = esc_url_raw(untrailingslashit($url));
        if (!$url || !preg_match('#^https?://#i', $url)) {
            return '';
        }
        return $url;
    }

    public function get_community_api_url() {
        $url = get_option(WPA_COMMUNITY_API_URL_OPTION, WPA_DEFAULT_COMMUNITY_API_URL);
        return $this->sanitize_community_api_url(apply_filters('wp_advertising_community_api_url', $url));
    }

    public function set_community_api_url($url) {
        update_option(WPA_COMMUNITY_API_URL_OPTION, $this->sanitize_community_api_url($url), false);
    }

    public function community_api_endpoint($path = '') {
        $base = $this->get_community_api_url();
        if (!$base) {
            return '';
        }
        $path = '/' . ltrim((string) $path, '/');
        return esc_url_raw($base . $path);
    }


    public function get_community_credentials() {
        return [
            'siteId' => sanitize_text_field((string) get_option(WPA_COMMUNITY_SITE_ID_OPTION, '')),
            'publicKey' => sanitize_text_field((string) get_option(WPA_COMMUNITY_PUBLIC_KEY_OPTION, '')),
        ];
    }

    public function set_community_credentials(array $credentials) {
        if (!empty($credentials['siteId'])) {
            update_option(WPA_COMMUNITY_SITE_ID_OPTION, sanitize_text_field($credentials['siteId']), false);
        }
        // Server returns apiKey; stored internally under WPA_COMMUNITY_PUBLIC_KEY_OPTION.
        $api_key = $credentials['apiKey'] ?? '';
        if (!empty($api_key)) {
            update_option(WPA_COMMUNITY_PUBLIC_KEY_OPTION, sanitize_text_field($api_key), false);
        }
    }

    public function clear_community_credentials() {
        delete_option(WPA_COMMUNITY_SITE_ID_OPTION);
        delete_option(WPA_COMMUNITY_PUBLIC_KEY_OPTION);
    }

    public function get_community_last_error() {
        return sanitize_text_field((string) get_option(WPA_COMMUNITY_LAST_ERROR_OPTION, ''));
    }

    private function set_community_sync_status($status, $error = '') {
        update_option(WPA_COMMUNITY_STATUS_OPTION, sanitize_key($status), false);
        if ($error) {
            update_option(WPA_COMMUNITY_LAST_ERROR_OPTION, sanitize_text_field($error), false);
        } else {
            delete_option(WPA_COMMUNITY_LAST_ERROR_OPTION);
        }
    }

    public function get_community_sync_status() {
        return sanitize_key((string) get_option(WPA_COMMUNITY_STATUS_OPTION, $this->get_community_api_url() ? 'not_synced' : 'local_only'));
    }

    public function community_api_request($method, $path, array $payload = [], array $query = []) {
        $endpoint = $this->community_api_endpoint($path);
        if (!$endpoint) {
            return new WP_Error('missing_community_api_url', __('Community API URL is not configured.', 'wp-advertising'));
        }
        if ($query) {
            $endpoint = add_query_arg($query, $endpoint);
        }
        $args = [
            'timeout' => 1.25,
            'redirection' => 2,
            'user-agent' => 'WP Advertising/' . WPA_VERSION . '; ' . home_url('/'),
            'headers' => [
                'Accept' => 'application/json',
            ],
        ];
        $method = strtoupper((string) $method);
        if ($method === 'POST') {
            $args['headers']['Content-Type'] = 'application/json';
            $args['body'] = wp_json_encode($payload);
            $response = wp_remote_post($endpoint, $args);
        } else {
            $response = wp_remote_get($endpoint, $args);
        }
        if (is_wp_error($response)) {
            return $response;
        }
        $code = (int) wp_remote_retrieve_response_code($response);
        $body = trim((string) wp_remote_retrieve_body($response));
        $decoded = $body !== '' ? json_decode($body, true) : null;
        return [
            'code' => $code,
            'body' => is_array($decoded) ? $decoded : [],
            'raw' => $body,
        ];
    }

    public function community_api_error_message($result, $fallback = '') {
        if (is_wp_error($result)) {
            return $result->get_error_message();
        }
        if (is_array($result)) {
            $body = $result['body'] ?? [];
            if (isset($body['error']['message'])) {
                return sanitize_text_field($body['error']['message']);
            }
            if (isset($body['message'])) {
                return sanitize_text_field($body['message']);
            }
            if (!empty($result['code'])) {
                return sprintf(__('Community API returned HTTP %d.', 'wp-advertising'), (int) $result['code']);
            }
        }
        return $fallback ?: __('Community API request failed.', 'wp-advertising');
    }

    public function ensure_community_registered($force = false) {
        if (!$this->get_community_api_url()) {
            $this->set_community_sync_status('local_only');
            return false;
        }
        $credentials = $this->get_community_credentials();
        if (!$force && !empty($credentials['siteId']) && !empty($credentials['publicKey'])) {
            return $credentials;
        }
        $result = $this->community_api_request('POST', '/sites/register', [
            'siteUrl' => home_url('/'),
            'siteName' => get_bloginfo('name') ?: wp_parse_url(home_url('/'), PHP_URL_HOST),
            'pluginVersion' => WPA_VERSION,
        ]);
        if (is_wp_error($result) || !is_array($result) || (int) ($result['code'] ?? 0) < 200 || (int) ($result['code'] ?? 0) >= 300) {
            $this->set_community_sync_status('error', $this->community_api_error_message($result));
            return false;
        }
        $body = $result['body'];
        if (empty($body['siteId']) || empty($body['apiKey'])) {
            $this->set_community_sync_status('error', __('Community API registration response was missing credentials.', 'wp-advertising'));
            return false;
        }
        $this->set_community_credentials($body);
        $this->set_community_sync_status(!empty($body['optedIn']) ? 'connected' : 'registered');
        return $this->get_community_credentials();
    }

    public function community_auth_payload() {
        $credentials = $this->get_community_credentials();
        if (empty($credentials['siteId']) || empty($credentials['publicKey'])) {
            return [];
        }
        return [
            'siteId' => $credentials['siteId'],
            'apiKey' => $credentials['publicKey'],
        ];
    }

    public function is_public_http_url($url) {
        $url = esc_url_raw(trim((string) $url));
        return (bool) ($url && preg_match('#^https?://#i', $url) && wp_parse_url($url, PHP_URL_HOST));
    }

    /**
     * True when a URL is http(s) and its host is reachable by public visitors
     * (rejects localhost, loopback, private, and link-local hosts).
     */
    public function is_publicly_routable_url($url) {
        if (!$this->is_public_http_url($url)) {
            return false;
        }
        $host = strtolower((string) wp_parse_url($url, PHP_URL_HOST));
        if (!$host || $host === 'localhost' || $host === '0.0.0.0' || substr($host, -6) === '.local' || substr($host, -5) === '.test') {
            return false;
        }
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return (bool) filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
        }
        return true;
    }

    /**
     * Prefer a public network tracking URL; if the host is local/private, try
     * rewriting it onto the configured public Community API base.
     */
    public function normalize_community_tracking_url($url) {
        $url = esc_url_raw((string) $url);
        if (!$url) {
            return '';
        }
        if ($this->is_publicly_routable_url($url)) {
            return $url;
        }

        $base = $this->get_community_api_url();
        if (!$base || !$this->is_publicly_routable_url($base)) {
            return '';
        }

        $parts = wp_parse_url($url);
        $path = isset($parts['path']) ? $parts['path'] : '';
        $query = isset($parts['query']) && $parts['query'] !== '' ? '?' . $parts['query'] : '';
        $rewritten = untrailingslashit($base) . $path . $query;
        return $this->is_publicly_routable_url($rewritten) ? esc_url_raw($rewritten) : '';
    }

    private function community_ad_from_payload(array $payload) {
        $title = sanitize_text_field($payload['headline'] ?? get_bloginfo('name'));
        $image_url = esc_url_raw($payload['image_url'] ?? '');
        $target_url = esc_url_raw($payload['target_url'] ?? home_url('/'));
        if (!$title || !$this->is_public_http_url($image_url) || !$this->is_public_http_url($target_url)) {
            return [];
        }
        return [
            'title' => wp_trim_words($title, 18, ''),
            'imageUrl' => $image_url,
            'targetUrl' => $target_url,
            'status' => 'ACTIVE',
            'weight' => 1,
        ];
    }

    public function sync_community_network($enabled, array $ad_payload = []) {
        if (!$this->get_community_api_url()) {
            $this->set_community_sync_status($enabled ? 'local_only' : 'disabled');
            return false;
        }
        if ($enabled) {
            $license = new WPA_License($this);
            if (!$license->is_network_eligible()) {
                $trial = $license->start_trial();
                if (is_wp_error($trial) || !$license->is_network_eligible()) {
                    $this->set_community_enabled(false);
                    $message = is_wp_error($trial)
                        ? $trial->get_error_message()
                        : __('Active Trial or Pro is required for Community.', 'wp-advertising');
                    $this->set_community_sync_status('error', $message);
                    return false;
                }
            }
        }
        $existing_credentials = $this->get_community_credentials();
        if (!$enabled && (empty($existing_credentials['siteId']) || empty($existing_credentials['publicKey']))) {
            $this->set_community_sync_status('disabled');
            return true;
        }
        $credentials = $enabled ? $this->ensure_community_registered(false) : $existing_credentials;
        if (!$credentials || empty($credentials['siteId']) || empty($credentials['publicKey'])) {
            return false;
        }
        $auth = $this->community_auth_payload();
        $path = $enabled ? '/sites/opt-in' : '/sites/opt-out';
        $result = $this->community_api_request('POST', $path, $auth);
        if (is_array($result) && (int) ($result['code'] ?? 0) === 403) {
            $this->clear_community_credentials();
            if (!$enabled) {
                $this->set_community_sync_status('disabled');
                return true;
            }
            $credentials = $this->ensure_community_registered(true);
            $auth = $this->community_auth_payload();
            $result = $credentials ? $this->community_api_request('POST', $path, $auth) : $result;
        }
        if (is_wp_error($result) || !is_array($result) || (int) ($result['code'] ?? 0) < 200 || (int) ($result['code'] ?? 0) >= 300) {
            $this->set_community_sync_status('error', $this->community_api_error_message($result));
            return false;
        }
        if (!$enabled) {
            $this->set_community_sync_status('disabled');
            return true;
        }
        $ad = $this->community_ad_from_payload($ad_payload);
        if ($ad) {
            $ad_result = $this->community_api_request('POST', '/sites/ad', array_merge($auth, $ad));
            if (is_wp_error($ad_result) || !is_array($ad_result) || (int) ($ad_result['code'] ?? 0) < 200 || (int) ($ad_result['code'] ?? 0) >= 300) {
                $this->set_community_sync_status('connected_no_ad', $this->community_api_error_message($ad_result, __('Connected, but community ad sync failed.', 'wp-advertising')));
                return true;
            }
        } else {
            $this->set_community_sync_status('connected_no_ad', __('Connected, but the current house ad is missing a public image or destination URL.', 'wp-advertising'));
            return true;
        }
        $this->set_community_sync_status('connected');
        return true;
    }

    public function get_community_shortcode_settings() {
        $settings = get_option(WPA_COMMUNITY_SETTINGS_OPTION, []);
        return wp_parse_args(is_array($settings) ? $settings : [], [
            'label' => __('Community Ad', 'wp-advertising'),
            'headline' => __('Featured from the community', 'wp-advertising'),
            'body' => __('A promoted offer from another opt-in WP Advertising member.', 'wp-advertising'),
            'cta' => __('Visit now', 'wp-advertising'),
            'theme' => 'dark',
        ]);
    }

    public function save_community_shortcode_settings($input) {
        $settings = [
            'label' => sanitize_text_field($input['label'] ?? __('Community Ad', 'wp-advertising')),
            'headline' => sanitize_text_field($input['headline'] ?? __('Featured from the community', 'wp-advertising')),
            'body' => wp_kses_post($input['body'] ?? __('A promoted offer from another opt-in WP Advertising member.', 'wp-advertising')),
            'cta' => sanitize_text_field($input['cta'] ?? __('Visit now', 'wp-advertising')),
            'theme' => $this->allowed_theme($input['theme'] ?? 'dark'),
        ];
        update_option(WPA_COMMUNITY_SETTINGS_OPTION, $settings, false);
        return $settings;
    }

    public function community_shortcode($settings = []) {
        $settings = wp_parse_args($settings, $this->get_community_shortcode_settings());
        return sprintf(
            '[wp_advertising_community_ad theme="%s" label="%s" headline="%s" cta="%s"]',
            esc_attr($this->allowed_theme($settings['theme'] ?? 'dark')),
            esc_attr($settings['label'] ?? ''),
            esc_attr($settings['headline'] ?? ''),
            esc_attr($settings['cta'] ?? '')
        );
    }

    public function should_serve_community_ad($zone = '') {
        // Strict isolation: community inventory only for the community zone.
        return $this->community_enabled()
            && $this->sanitize_zone($zone) === WPA_COMMUNITY_ZONE
            && (new WPA_License($this))->is_network_eligible();
    }

    public function base64url_encode($value) {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    public function base64url_decode($value) {
        $value = strtr((string) $value, '-_', '+/');
        $pad = strlen($value) % 4;
        if ($pad) {
            $value .= str_repeat('=', 4 - $pad);
        }
        return base64_decode($value, true);
    }

    public function make_event_token($event_type, array $payload) {
        $event_type = in_array($event_type, ['impression', 'click'], true) ? $event_type : 'impression';
        $body = [
            'type' => $event_type,
            'ad_id' => absint($payload['ad_id'] ?? 0),
            'product_id' => absint($payload['product_id'] ?? 0),
            'zone' => $this->sanitize_zone($payload['zone'] ?? WPA_DEFAULT_ZONE),
            'exp' => time() + WPA_EVENT_TOKEN_TTL,
        ];
        // Click tokens carry the exact rendered destination so redirects never re-query ads.
        if ($event_type === 'click') {
            $body['target'] = esc_url_raw($payload['target_url'] ?? '');
        }
        $encoded = $this->base64url_encode(wp_json_encode($body));
        $signature = hash_hmac('sha256', $encoded, wp_salt('auth'));
        return $encoded . '.' . $signature;
    }

    public function validate_event_token($token, $expected_type = '') {
        $token = sanitize_text_field((string) $token);
        if (!$token || false === strpos($token, '.')) {
            return new WP_Error('missing_token', __('Missing tracking token.', 'wp-advertising'));
        }
        list($encoded, $signature) = explode('.', $token, 2);
        $expected_signature = hash_hmac('sha256', $encoded, wp_salt('auth'));
        if (!hash_equals($expected_signature, $signature)) {
            return new WP_Error('invalid_token', __('Invalid tracking token.', 'wp-advertising'));
        }
        $decoded = json_decode($this->base64url_decode($encoded), true);
        if (!is_array($decoded) || empty($decoded['exp']) || (int) $decoded['exp'] < time()) {
            return new WP_Error('expired_token', __('Expired tracking token.', 'wp-advertising'));
        }
        if ($expected_type && ($decoded['type'] ?? '') !== $expected_type) {
            return new WP_Error('wrong_token_type', __('Wrong tracking token type.', 'wp-advertising'));
        }
        return [
            'type' => in_array(($decoded['type'] ?? ''), ['impression', 'click'], true) ? $decoded['type'] : 'impression',
            'ad_id' => absint($decoded['ad_id'] ?? 0),
            'product_id' => absint($decoded['product_id'] ?? 0),
            'zone' => $this->sanitize_zone($decoded['zone'] ?? WPA_DEFAULT_ZONE),
            'target' => esc_url_raw($decoded['target'] ?? ''),
        ];
    }

    public function get_settings($ad) {
        $settings = [];
        if (!empty($ad['settings_json'])) {
            $decoded = json_decode($ad['settings_json'], true);
            if (is_array($decoded)) {
                $settings = $decoded;
            }
        }
        return wp_parse_args($settings, [
            'layout' => 'card',
            'theme' => 'dark',
        ]);
    }

    public function sanitize_ad_data($input) {
        $source_type = sanitize_key($input['source_type'] ?? 'custom');
        if (!in_array($source_type, ['custom', 'woocommerce'], true)) {
            $source_type = 'custom';
        }

        $product_mode = sanitize_key($input['product_mode'] ?? 'specific');
        if (!in_array($product_mode, ['specific', 'random'], true)) {
            $product_mode = 'specific';
        }
        if ($source_type !== 'woocommerce') {
            $product_mode = 'specific';
        }

        $headline = sanitize_text_field($input['headline'] ?? '');
        $label = sanitize_text_field($input['label'] ?? 'Sponsored Drop');

        $data = [
            'name' => sanitize_text_field($input['name'] ?? ''),
            'status' => in_array(($input['status'] ?? 'active'), ['active', 'paused'], true) ? $input['status'] : 'active',
            'source_type' => $source_type,
            'product_mode' => $product_mode,
            'product_id' => ($source_type === 'woocommerce' && $product_mode === 'specific') ? absint($input['product_id'] ?? 0) : 0,
            'headline' => $headline,
            'body' => wp_kses_post($input['body'] ?? ''),
            'image_url' => esc_url_raw($input['image_url'] ?? ''),
            'target_url' => esc_url_raw($input['target_url'] ?? ''),
            'cta' => sanitize_text_field($input['cta'] ?? 'Shop now'),
            'label' => $label,
            'campaign' => sanitize_key($input['campaign'] ?? 'wp_advertising'),
            'zone' => $this->sanitize_zone($input['zone'] ?? WPA_DEFAULT_ZONE),
            'weight' => max(1, min(100, absint($input['weight'] ?? 1))),
            'open_new_tab' => !empty($input['open_new_tab']) ? 1 : 0,
            'nofollow' => !empty($input['nofollow']) ? 1 : 0,
            'settings_json' => wp_json_encode([
                'layout' => sanitize_key($input['layout'] ?? 'card'),
                'theme' => $this->allowed_theme($input['theme'] ?? 'dark'),
            ]),
        ];

        if (!$data['name']) {
            $data['name'] = $headline ?: $label ?: __('Untitled Ad', 'wp-advertising');
        }

        return apply_filters('wp_advertising_sanitized_ad_data', $data, $input);
    }

    public function save_ad($id, array $data) {
        global $wpdb;
        $now = current_time('mysql');
        $data['updated_at'] = $now;

        if ($id) {
            $wpdb->update($this->ads_table, $data, ['id' => absint($id)]);
            return absint($id);
        }

        $data['created_at'] = $now;
        $wpdb->insert($this->ads_table, $data);
        return (int) $wpdb->insert_id;
    }

    public function delete_ad($id) {
        global $wpdb;
        return $wpdb->delete($this->ads_table, ['id' => absint($id)], ['%d']);
    }

    public function get_ad($id) {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->ads_table} WHERE id = %d", absint($id)), ARRAY_A);
    }

    public function get_ads($args = []) {
        global $wpdb;
        $where = '1=1';
        $params = [];

        if (!empty($args['active_only'])) {
            $where .= ' AND status = %s';
            $params[] = 'active';
        }
        if (!empty($args['zone'])) {
            $where .= ' AND zone = %s';
            $params[] = $this->sanitize_zone($args['zone']);
        }

        $sql = "SELECT * FROM {$this->ads_table} WHERE {$where} ORDER BY updated_at DESC";
        if ($params) {
            $sql = $wpdb->prepare($sql, $params);
        }
        return $wpdb->get_results($sql, ARRAY_A);
    }

    public function pick_ad($id = 0, $zone = '') {
        if ($id) {
            $ad = $this->get_ad($id);
            return ($ad && $ad['status'] === 'active') ? $ad : null;
        }

        // Zones are authoritative: never leak ads from other placements.
        $ads = $this->get_ads(['active_only' => true, 'zone' => $zone ?: WPA_DEFAULT_ZONE]);
        if (!$ads) {
            return null;
        }

        $total = array_sum(array_map(static function ($ad) {
            return max(1, (int) $ad['weight']);
        }, $ads));

        $pick = random_int(1, max(1, $total));
        foreach ($ads as $ad) {
            $pick -= max(1, (int) $ad['weight']);
            if ($pick <= 0) {
                return $ad;
            }
        }
        return $ads[0];
    }

    public function wc_active() {
        return function_exists('wc_get_product') && function_exists('wc_get_products');
    }

    public function get_product_payload($product_id = 0, $random = false) {
        if (!$this->wc_active()) {
            return null;
        }

        if ($random) {
            $ids = $this->get_random_product_pool();
            if (!$ids) {
                return null;
            }
            $product_id = (int) $ids[array_rand($ids)];
        }

        $product = wc_get_product(absint($product_id));
        if (!$product || !$product->is_visible()) {
            return null;
        }

        $image_id = $product->get_image_id();
        return [
            'product_id' => $product->get_id(),
            'title' => $product->get_name(),
            'body' => wp_strip_all_tags($product->get_short_description()) ?: __('Featured merch from our shop.', 'wp-advertising'),
            'price_html' => $product->get_price_html(),
            'image_url' => $image_id ? wp_get_attachment_image_url($image_id, 'large') : wc_placeholder_img_src('woocommerce_single'),
            'target_url' => get_permalink($product->get_id()),
        ];
    }

    private function get_random_product_pool() {
        $cache_key = 'wp_advertising_random_products_' . get_current_blog_id();
        $ids = get_transient($cache_key);
        if (is_array($ids) && $ids) {
            return $ids;
        }

        $ids = wc_get_products([
            'status' => 'publish',
            'stock_status' => 'instock',
            'limit' => 100,
            'return' => 'ids',
            'orderby' => 'date',
            'order' => 'DESC',
        ]);
        set_transient($cache_key, $ids, 15 * MINUTE_IN_SECONDS);
        return is_array($ids) ? $ids : [];
    }

    // ── Community ad cache helpers ───────────────────────────────────────────

    private function community_zone_hash($zone) {
        return md5($zone . '|' . home_url('/'));
    }

    private function read_community_cache($zone_hash) {
        $record = get_option('wp_advertising_community_ad_' . $zone_hash, null);
        if (!is_array($record)) {
            return null;
        }

        // Decision table:
        //   schema mismatch      → unusable (format changed in this plugin version)
        //   plugin-version diff  → unusable (forces cold fetch after plugin update)
        //   past not_after       → unusable (server-stamped hard expiry, clock-independent)
        //   network_epoch diff   → cannot check without a network call; Railway must use
        //                          not_after for forced invalidation; epoch is stored for
        //                          diagnostics and future server-push invalidation support
        //   past stale_until     → callers check this; record is returned so cold path can
        //                          distinguish "expired but valid shape" from "no record"
        //   past fresh_until     → callers check this; stale-while-revalidate trigger
        //   all checks pass      → return record

        if ((int)($record['schema'] ?? 0) !== WPA_COMMUNITY_CACHE_SCHEMA) {
            return null;
        }
        if (($record['wpa_version'] ?? '') !== WPA_VERSION) {
            return null;
        }
        $not_after = (int)($record['not_after'] ?? 0);
        if ($not_after > 0 && time() >= $not_after) {
            return null;
        }
        return $record;
    }

    private function write_community_cache($zone_hash, array $payload, $not_after = 0, $net_epoch = 0, array $extra = []) {
        $now = time();
        $record = array_merge([
            'schema'      => WPA_COMMUNITY_CACHE_SCHEMA,
            'wpa_version' => WPA_VERSION,
            'payload'     => $payload,
            'fetched_at'  => $now,
            'fresh_until' => $now + WPA_COMMUNITY_FRESH_TTL,
            'stale_until' => $now + WPA_COMMUNITY_STALE_TTL,
            'not_after'   => (int)$not_after,
            'net_epoch'   => (int)$net_epoch,
            'last_fail'   => 0,
            'next_retry'  => 0,
            'fail_count'  => 0,
        ], $extra);
        update_option('wp_advertising_community_ad_' . $zone_hash, $record, false);
    }

    // Atomic lock: INSERT IGNORE guarantees exactly one process gets rows=1 at the DB level.
    // Falls back to wp_cache_add (SETNX semantics) when a persistent object cache is present.
    private function try_acquire_refresh_lock($zone_hash) {
        $lock_name = 'wp_advertising_community_lock_' . $zone_hash;
        if (wp_using_ext_object_cache()) {
            return (bool) wp_cache_add($lock_name, time(), 'wp_advertising', WPA_COMMUNITY_LOCK_TTL);
        }
        global $wpdb;
        $rows = (int) $wpdb->query($wpdb->prepare(
            "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %d, 'no')",
            $lock_name, time()
        ));
        if ($rows === 1) {
            wp_cache_set($lock_name, time(), 'options');
            return true;
        }
        // Steal a stale lock left by a process that died without releasing it.
        $lock_time = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s LIMIT 1",
            $lock_name
        ));
        if ($lock_time > 0 && time() - $lock_time > WPA_COMMUNITY_LOCK_TTL) {
            $wpdb->delete($wpdb->options, ['option_name' => $lock_name], ['%s']);
            wp_cache_delete($lock_name, 'options');
            $rows = (int) $wpdb->query($wpdb->prepare(
                "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %d, 'no')",
                $lock_name, time()
            ));
            return $rows === 1;
        }
        return false;
    }

    private function release_refresh_lock($zone_hash) {
        $lock_name = 'wp_advertising_community_lock_' . $zone_hash;
        // Mirror the acquisition path: ext object cache → cache delete only;
        // DB fallback → option delete only. Avoids spurious queries on the wrong backend.
        if (wp_using_ext_object_cache()) {
            wp_cache_delete($lock_name, 'wp_advertising');
        } else {
            delete_option($lock_name);
        }
    }

    // Persist failure info; next_retry uses exponential backoff + ±10% jitter to prevent
    // synchronized retry storms when the ad-server is unhealthy.
    private function record_refresh_failure($zone_hash, array $record) {
        $now = time();
        $fail_count = (int)($record['fail_count'] ?? 0) + 1;
        $base = min(600, 30 * (1 << min($fail_count - 1, 4)));
        $jitter = (int)($base * 0.1 * (mt_rand(0, 100) / 50.0 - 1.0));
        update_option('wp_advertising_community_ad_' . $zone_hash, array_merge($record, [
            'last_fail'  => $now,
            'next_retry' => $now + $base + $jitter,
            'fail_count' => $fail_count,
        ]), false);
    }

    // Builds a structured result from the raw remote response. Returns null if the
    // destination is missing or not publicly routable (ghost-traffic invariant).
    private function build_payload_from_remote($zone, array $remote, array $settings) {
        $community_id = sanitize_key($remote['adId'] ?? $remote['community_ad_id'] ?? $remote['id'] ?? 'community');
        $destination  = esc_url_raw($remote['targetUrl'] ?? $remote['target_url'] ?? '');
        if (!$community_id || !$this->is_publicly_routable_url($destination)) {
            return null;
        }
        return [
            'payload' => [
                'ad_id'                    => 0,
                'product_id'               => 0,
                'community_id'             => $community_id,
                'zone'                     => WPA_COMMUNITY_ZONE,
                'label'                    => sanitize_text_field($remote['label'] ?? $settings['label']),
                'headline'                 => sanitize_text_field($remote['headline'] ?? $remote['title'] ?? $settings['headline']),
                'body'                     => wp_strip_all_tags($remote['body'] ?? $remote['description'] ?? $settings['body']),
                'image_url'                => esc_url_raw($remote['imageUrl'] ?? $remote['image_url'] ?? $remote['image'] ?? ''),
                'target_url'               => $destination,
                'cta'                      => sanitize_text_field($remote['cta'] ?? $settings['cta']),
                'price_html'               => '',
                'open_new_tab'             => true,
                'nofollow'                 => true,
                'source_type'              => 'community',
                'product_mode'             => 'network',
                'theme'                    => $this->allowed_theme($settings['theme'] ?? 'dark'),
                'preview'                  => false,
                'network_click_url'        => '',
                'skip_local_click_tracking' => true,
                'network_impression_url'   => '',
            ],
            'not_after' => (int)($remote['notAfter'] ?? $remote['not_after'] ?? 0),
            'net_epoch'  => (int)($remote['networkEpoch'] ?? $remote['network_epoch'] ?? 0),
        ];
    }

    // Called post-response (after fastcgi_finish_request) or from cron. Caller MUST hold the
    // refresh lock; this method releases it on every exit path.
    public function execute_background_community_refresh($zone) {
        $zone_hash = $this->community_zone_hash($zone);
        $record    = $this->read_community_cache($zone_hash);
        $settings  = $this->get_community_shortcode_settings();
        $tracking  = $this->tracking_enabled();

        $result = $this->community_api_request('GET', '/community/serve', [], [
            'siteUrl'       => home_url('/'),
            'zone'          => $this->sanitize_zone($zone ?: WPA_COMMUNITY_ZONE),
            'pluginVersion' => WPA_VERSION,
            'tracking'      => $tracking ? '1' : '0',
        ]);

        if (!is_array($result)) {
            if ($record) {
                $this->record_refresh_failure($zone_hash, $record);
            }
            $this->release_refresh_lock($zone_hash);
            return;
        }
        $code = (int)($result['code'] ?? 0);
        if ($code === 204) {
            // No ad available — not a failure, just nothing to serve right now.
            $this->release_refresh_lock($zone_hash);
            return;
        }
        if ($code < 200 || $code >= 300 || !is_array($result['body'])) {
            if ($record) {
                $this->record_refresh_failure($zone_hash, $record);
            }
            $this->release_refresh_lock($zone_hash);
            return;
        }
        $built = $this->build_payload_from_remote($zone, $result['body'], $settings);
        if (!$built) {
            if ($record) {
                $this->record_refresh_failure($zone_hash, $record);
            }
            $this->release_refresh_lock($zone_hash);
            return;
        }
        $this->write_community_cache($zone_hash, $built['payload'], $built['not_after'], $built['net_epoch']);
        $this->release_refresh_lock($zone_hash);
    }

    // Release the refresh lock and schedule a one-shot cron event so the refresh
    // happens on the next WP-Cron tick (used when fastcgi_finish_request is unavailable).
    public function defer_community_refresh_to_cron($zone) {
        $this->release_refresh_lock($this->community_zone_hash($zone));
        wp_schedule_single_event(time(), 'wp_advertising_prefetch_community_ad', [$zone]);
    }

    // ─────────────────────────────────────────────────────────────────────────

    public function get_community_payload($zone = WPA_COMMUNITY_ZONE, $settings = [], $preview = false, $track = null) {
        $settings = wp_parse_args($settings, $this->get_community_shortcode_settings());
        $fallback = [
            'ad_id'                    => 0,
            'product_id'               => 0,
            'community_id'             => 'preview',
            'zone'                     => WPA_COMMUNITY_ZONE,
            'label'                    => sanitize_text_field($settings['label']),
            'headline'                 => sanitize_text_field($settings['headline']),
            'body'                     => wp_strip_all_tags($settings['body']),
            'image_url'                => '',
            'target_url'               => home_url('/'),
            'cta'                      => sanitize_text_field($settings['cta']),
            'price_html'               => '',
            'open_new_tab'             => true,
            'nofollow'                 => true,
            'source_type'              => 'community',
            'product_mode'             => 'network',
            'theme'                    => $this->allowed_theme($settings['theme'] ?? 'dark'),
            'preview'                  => (bool) $preview,
            'skip_local_click_tracking' => false,
            'network_impression_url'   => '',
        ];

        $endpoint = $this->community_api_endpoint('/community/serve');
        $endpoint = esc_url_raw(apply_filters('wp_advertising_community_endpoint', $endpoint));
        if (!$this->community_enabled() || !$endpoint) {
            return $preview ? $fallback : null;
        }
        if (!(new WPA_License($this))->is_network_eligible()) {
            return $preview ? $fallback : null;
        }

        // Three-path server-side cache:
        //   fresh  (0–5 min)   – return immediately, no network call
        //   stale  (5–60 min)  – return cached creative instantly; one process refreshes
        //                        post-response via fastcgi_finish_request or cron
        //   cold   (>60 min)   – blocking fetch; visitor waits up to the API timeout
        $zone_hash = $this->community_zone_hash($zone);
        $record    = $preview ? null : $this->read_community_cache($zone_hash);
        $now       = time();

        // read_community_cache() returns null when not_after has elapsed (server-stamped
        // hard expiry), on schema mismatch, or on plugin-version mismatch. In every null
        // case $is_stale stays false below, so the old payload is unreachable — the cold
        // path is the ONLY path. If the cold fetch also fails, we return null. This is
        // intentional: not_after expiry is not equivalent to ordinary staleness and must
        // never fall back to the invalidated creative.
        $is_fresh = $record && $now < (int)($record['fresh_until'] ?? 0);
        $is_stale = $record && $now < (int)($record['stale_until'] ?? 0);

        // ── Fresh ─────────────────────────────────────────────────────────────
        if ($is_fresh) {
            return $record['payload'];
        }

        // ── Stale: serve immediately, signal deferred post-response refresh ───
        if ($is_stale) {
            $next_retry = (int)($record['next_retry'] ?? 0);
            if ($now >= $next_retry && $this->try_acquire_refresh_lock($zone_hash)) {
                $this->community_refresh_pending_zone = $zone;
            }
            return $record['payload'];
        }

        // ── Cold: blocking fetch (no usable cache) ────────────────────────────
        $tracking = null === $track ? $this->tracking_enabled() : (bool)$track;
        $result = $this->community_api_request('GET', '/community/serve', [], [
            'siteUrl'       => home_url('/'),
            'zone'          => $this->sanitize_zone($zone ?: WPA_COMMUNITY_ZONE),
            'pluginVersion' => WPA_VERSION,
            'tracking'      => $tracking ? '1' : '0',
        ]);

        if (!is_array($result)) {
            return $preview ? $fallback : null;
        }
        $code = (int)($result['code'] ?? 0);
        if ($code === 204) {
            return $preview ? $fallback : null;
        }
        if ($code < 200 || $code >= 300 || !is_array($result['body'])) {
            return $preview ? $fallback : null;
        }
        $built = $this->build_payload_from_remote($zone, $result['body'], $settings);
        if (!$built) {
            return $preview ? $fallback : null;
        }
        if (!$preview) {
            $this->write_community_cache($zone_hash, $built['payload'], $built['not_after'], $built['net_epoch']);
        }
        $built['payload']['preview'] = (bool)$preview;
        return $built['payload'];
    }

    // Opportunistic prewarm from WP-Cron. Skips idle sites that have no active cache.
    // Correctness does not depend on this running — the render path is safe without it.
    public function prime_community_ad_cache($zone = WPA_COMMUNITY_ZONE) {
        if (!$this->community_enabled() || !(new WPA_License($this))->is_network_eligible()) {
            return;
        }
        $zone_hash = $this->community_zone_hash($zone);
        if (!$this->read_community_cache($zone_hash)) {
            return; // No active cache — site has been idle, nothing to prewarm.
        }
        if (!$this->try_acquire_refresh_lock($zone_hash)) {
            return; // Another process is already refreshing.
        }
        $this->execute_background_community_refresh($zone);
    }

    /**
     * Seed/template factory for a new house ad. Not a runtime creative — never render this.
     * Use ensure_default_house_ad() / pick_ad() for live inventory.
     */
    public function default_ad() {
        return [
            'id' => 0,
            'name' => __('House Ad', 'wp-advertising'),
            'status' => 'active',
            'source_type' => 'woocommerce',
            'product_mode' => 'random',
            'product_id' => 0,
            'headline' => 'Random merch for music people',
            'body' => 'Funny shirts, hats & weird merch.',
            'image_url' => '',
            'target_url' => '',
            'cta' => 'Shop now',
            'label' => 'Sponsored Drop',
            'campaign' => 'random_product_ad',
            'zone' => WPA_DEFAULT_ZONE,
            'weight' => 10,
            'open_new_tab' => 1,
            'nofollow' => 1,
            'settings_json' => wp_json_encode(['layout' => 'card', 'theme' => 'dark']),
        ];
    }

    public function house_inventory_exists() {
        return !empty($this->get_ads(['zone' => WPA_DEFAULT_ZONE]));
    }

    /**
     * Idempotent: create the default persisted house ad only when the house zone has no rows.
     * Never overwrites existing inventory.
     */
    public function ensure_default_house_ad() {
        $existing = $this->get_ads(['zone' => WPA_DEFAULT_ZONE]);
        if ($existing) {
            foreach ($existing as $ad) {
                if (($ad['status'] ?? '') === 'active') {
                    return $ad;
                }
            }
            return $existing[0];
        }

        $template = $this->default_ad();
        $data = $this->sanitize_ad_data($template);
        $data['name'] = sanitize_text_field($template['name']);
        $data['weight'] = max(1, (int) ($template['weight'] ?? 10));
        $id = $this->save_ad(0, $data);
        return $this->get_ad($id);
    }

    public function aggregate_stats($start = 30, $end = null) {
        global $wpdb;
        list($start_mysql, $end_mysql) = $this->normalize_report_range($start, $end);
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT ad_id, product_id, zone,
                SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END) AS impressions,
                SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
             FROM {$this->events_table}
             WHERE created_at >= %s AND created_at <= %s
             GROUP BY ad_id, product_id, zone",
            $start_mysql,
            $end_mysql
        ), ARRAY_A);

        $stats = ['ads' => [], 'zones' => [], 'products' => []];
        foreach ($rows as $row) {
            $ad_id = (int) $row['ad_id'];
            $product_id = (int) $row['product_id'];
            $zone = $row['zone'] ?: WPA_DEFAULT_ZONE;
            $this->add_stat_bucket($stats['zones'], $zone, $row);
            if ($ad_id) {
                $this->add_stat_bucket($stats['ads'], $ad_id, $row);
            }
            if ($product_id) {
                $this->add_stat_bucket($stats['products'], $product_id, $row);
            }
        }
        return $stats;
    }

    public function normalize_report_range($start = 30, $end = null) {
        if (is_numeric($start) && null === $end) {
            $days = max(1, absint($start));
            return [
                gmdate('Y-m-d H:i:s', time() - ($days * DAY_IN_SECONDS)),
                gmdate('Y-m-d H:i:s', time()),
            ];
        }

        $site_now = current_time('timestamp');
        $default_start = gmdate('Y-m-d', $site_now - (29 * DAY_IN_SECONDS));
        $default_end = gmdate('Y-m-d', $site_now);
        $start_date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $start) ? (string) $start : $default_start;
        $end_date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $end) ? (string) $end : $default_end;

        if (strtotime($start_date) > strtotime($end_date)) {
            $tmp = $start_date;
            $start_date = $end_date;
            $end_date = $tmp;
        }

        return [$start_date . ' 00:00:00', $end_date . ' 23:59:59'];
    }

    private function add_stat_bucket(&$bucket, $key, $row) {
        if (!isset($bucket[$key])) {
            $bucket[$key] = ['impressions' => 0, 'clicks' => 0];
        }
        $bucket[$key]['impressions'] += (int) $row['impressions'];
        $bucket[$key]['clicks'] += (int) $row['clicks'];
    }

    public function stat_value($stats, $bucket, $key) {
        $data = $stats[$bucket][$key] ?? ['impressions' => 0, 'clicks' => 0];
        $data['ctr'] = $data['impressions'] > 0 ? (($data['clicks'] / $data['impressions']) * 100) : 0;
        return $data;
    }

    public function log_event($type, $ad_id, $product_id, $zone, $target_url = '') {
        if (!$this->tracking_enabled()) {
            return false;
        }

        global $wpdb;
        $type = in_array($type, ['impression', 'click'], true) ? $type : 'impression';
        $zone = $this->sanitize_zone($zone);
        $referrer = esc_url_raw(wp_unslash($_REQUEST['referrer'] ?? ($_SERVER['HTTP_REFERER'] ?? '')));
        $referrer_host = $this->extract_host($referrer);
        $ua = sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'] ?? ''));
        $ip = sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'] ?? ''));
        $user_agent_hash = hash('sha256', $ua);
        $ip_hash = hash('sha256', $ip . wp_salt('nonce'));
        $utm = $this->extract_utm_values($target_url);
        $device_type = $this->detect_device_type($ua);
        $browser_family = $this->detect_browser_family($ua);
        $location = $this->coarse_location_from_request($ip, $ua);

        if ($this->is_probable_bot($ua)) {
            return false;
        }

        if ($this->is_duplicate_event($type, absint($ad_id), absint($product_id), $zone, $ip_hash, $user_agent_hash)) {
            return false;
        }

        do_action('wp_advertising_before_log_event', $type, $ad_id, $product_id, $zone, $target_url);

        $inserted = $wpdb->insert($this->events_table, [
            'event_uuid' => wp_generate_uuid4(),
            'ad_id' => absint($ad_id),
            'product_id' => absint($product_id),
            'zone' => $zone,
            'event_type' => $type,
            'target_url' => esc_url_raw($target_url),
            'referrer' => $referrer,
            'referrer_host' => $referrer_host,
            'utm_source' => $utm['utm_source'],
            'utm_medium' => $utm['utm_medium'],
            'utm_campaign' => $utm['utm_campaign'],
            'device_type' => $device_type,
            'browser_family' => $browser_family,
            'country_code' => $location['country_code'],
            'region' => $location['region'],
            'local_event_hour' => (int) current_time('H'),
            'user_agent_hash' => $user_agent_hash,
            'ip_hash' => $ip_hash,
            'created_at' => current_time('mysql'),
        ]);

        return (bool) $inserted;
    }

    private function is_probable_bot($user_agent) {
        if (!$user_agent) {
            return false;
        }
        return (bool) preg_match('/bot|crawl|spider|slurp|facebookexternalhit|preview|scanner|monitor|headless/i', $user_agent);
    }

    private function is_duplicate_event($type, $ad_id, $product_id, $zone, $ip_hash, $user_agent_hash) {
        global $wpdb;
        // 30s for impressions: prevents double-fires from page reloads without collapsing
        // legitimate separate page views by the same visitor within a session.
        // 10s for clicks: unchanged — protects against redirect double-clicks.
        $window = ('click' === $type) ? 10 : 30;
        $since = gmdate('Y-m-d H:i:s', time() - $window);
        $count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$this->events_table}
             WHERE event_type = %s AND ad_id = %d AND product_id = %d AND zone = %s
               AND ip_hash = %s AND user_agent_hash = %s AND created_at >= %s",
            $type,
            $ad_id,
            $product_id,
            $zone,
            $ip_hash,
            $user_agent_hash,
            $since
        ));
        return $count > 0;
    }

    public function top_origin($ad_id = 0, $zone = '', $start = 30, $end = null) {
        global $wpdb;
        list($start_mysql, $end_mysql) = $this->normalize_report_range($start, $end);
        $where = "event_type = 'click' AND created_at >= %s AND created_at <= %s";
        $params = [$start_mysql, $end_mysql];
        if ($ad_id) {
            $where .= ' AND ad_id = %d';
            $params[] = absint($ad_id);
        } elseif ($zone) {
            $where .= ' AND zone = %s';
            $params[] = $this->sanitize_zone($zone);
        }
        $sql = "SELECT COALESCE(NULLIF(referrer_host, ''), 'Direct / unknown') AS origin, COUNT(*) AS clicks
                FROM {$this->events_table}
                WHERE {$where}
                GROUP BY origin
                ORDER BY clicks DESC
                LIMIT 1";
        $row = $wpdb->get_row($wpdb->prepare($sql, $params), ARRAY_A);
        return $row ? ['origin' => $row['origin'], 'clicks' => (int) $row['clicks']] : ['origin' => '—', 'clicks' => 0];
    }

    public function click_report_rows($ad_id = 0, $zone = '', $start = 30, $end = null, $limit = 5000) {
        global $wpdb;
        list($start_mysql, $end_mysql) = $this->normalize_report_range($start, $end);
        $where = "event_type = 'click' AND created_at >= %s AND created_at <= %s";
        $params = [$start_mysql, $end_mysql];
        if ($ad_id) {
            $where .= ' AND ad_id = %d';
            $params[] = absint($ad_id);
        } elseif ($zone) {
            $where .= ' AND zone = %s';
            $params[] = $this->sanitize_zone($zone);
        }
        $params[] = max(1, min(50000, absint($limit)));
        $sql = "SELECT created_at, ad_id, product_id, zone, COALESCE(NULLIF(referrer_host, ''), 'Direct / unknown') AS referrer_host,
                       referrer, utm_source, utm_medium, utm_campaign, device_type, browser_family,
                       country_code, region, local_event_hour, target_url
                FROM {$this->events_table}
                WHERE {$where}
                ORDER BY created_at DESC
                LIMIT %d";
        return $wpdb->get_results($wpdb->prepare($sql, $params), ARRAY_A);
    }

    private function extract_host($url) {
        $host = wp_parse_url($url, PHP_URL_HOST);
        return $host ? sanitize_text_field(strtolower($host)) : '';
    }

    private function extract_utm_values($url) {
        $values = ['utm_source' => '', 'utm_medium' => '', 'utm_campaign' => ''];
        $query = wp_parse_url($url, PHP_URL_QUERY);
        if (!$query) {
            return $values;
        }
        parse_str($query, $parts);
        foreach ($values as $key => $unused) {
            $values[$key] = sanitize_text_field($parts[$key] ?? '');
        }
        return $values;
    }

    private function detect_device_type($user_agent) {
        if (!$user_agent) {
            return 'unknown';
        }
        if (preg_match('/tablet|ipad|playbook|silk/i', $user_agent)) {
            return 'tablet';
        }
        if (preg_match('/mobile|iphone|ipod|android.*mobile|windows phone/i', $user_agent)) {
            return 'mobile';
        }
        return 'desktop';
    }

    private function detect_browser_family($user_agent) {
        if (!$user_agent) {
            return 'unknown';
        }
        $map = [
            'Edge' => '/Edg\//i',
            'Chrome' => '/Chrome\//i',
            'Safari' => '/Safari\//i',
            'Firefox' => '/Firefox\//i',
            'Opera' => '/OPR\//i',
            'Internet Explorer' => '/MSIE|Trident/i',
        ];
        foreach ($map as $name => $pattern) {
            if (preg_match($pattern, $user_agent)) {
                return $name;
            }
        }
        return 'other';
    }

    private function coarse_location_from_request($ip, $user_agent) {
        $country = strtoupper(sanitize_text_field(wp_unslash($_SERVER['HTTP_CF_IPCOUNTRY'] ?? ($_SERVER['HTTP_X_APPENGINE_COUNTRY'] ?? ($_SERVER['HTTP_X_COUNTRY_CODE'] ?? '')))));
        $country = preg_match('/^[A-Z]{2}$/', $country) ? $country : '';
        $region = sanitize_text_field(wp_unslash($_SERVER['HTTP_X_REGION'] ?? ''));
        $location = ['country_code' => $country, 'region' => $region];
        return apply_filters('wp_advertising_event_location', $location, $ip, $user_agent);
    }

    public function cleanup_old_events($days = null) {
        global $wpdb;
        $days = null === $days ? absint(get_option(WPA_RETENTION_DAYS_OPTION, 90)) : absint($days);
        $days = max(7, min(730, $days));
        $before = gmdate('Y-m-d H:i:s', time() - ($days * DAY_IN_SECONDS));
        return $wpdb->query($wpdb->prepare("DELETE FROM {$this->events_table} WHERE created_at < %s", $before));
    }

    /**
     * All advertising destinations must be publicly routable HTTP(S).
     * $trust is retained for callers but no longer weakens the policy.
     */
    public function is_allowed_target_url($url, $trust = 'host_allowlist') {
        unset($trust);
        return $this->is_publicly_routable_url($url);
    }

    /**
     * Prefer the immutable destination from a validated click token.
     * Falls back to legacy reconstruction for tokens issued before target signing
     * (including ad_id=0 creatives during one release window).
     */
    public function destination_from_click_token(array $token) {
        if (!empty($token['target'])) {
            return $this->is_allowed_target_url($token['target']) ? $token['target'] : home_url('/');
        }

        // Legacy path (pre-signed-target / virtual ad_id=0). Remove after one release window.
        $resolved = $this->resolve_click_target(
            $token['ad_id'] ?? 0,
            $token['product_id'] ?? 0,
            $token['zone'] ?? WPA_DEFAULT_ZONE
        );
        return $this->is_allowed_target_url($resolved) ? $resolved : home_url('/');
    }

    public function redirect_click($url) {
        $url = $this->is_publicly_routable_url($url) ? esc_url_raw($url) : home_url('/');
        $host = wp_parse_url($url, PHP_URL_HOST);
        if ($host) {
            add_filter('allowed_redirect_hosts', static function ($hosts) use ($host) {
                $hosts[] = $host;
                return array_values(array_unique($hosts));
            });
        }
        wp_safe_redirect($url, 302);
        exit;
    }

    /**
     * Legacy click destination reconstruction for tokens without a signed target.
     * Signed product_id is authoritative for WooCommerce creatives, including ad_id=0.
     */
    public function resolve_click_target($ad_id, $product_id, $zone) {
        $zone = $this->sanitize_zone($zone);

        // Snapshot product from the rendered creative (covers default/random ads with ad_id=0).
        if ($product_id && $this->wc_active()) {
            $product = wc_get_product(absint($product_id));
            if ($product && $product->is_visible()) {
                return add_query_arg([
                    'utm_source' => $zone,
                    'utm_medium' => 'embed_ad',
                    'utm_campaign' => 'wp_advertising',
                ], get_permalink($product->get_id()));
            }
        }

        $ad = $ad_id ? $this->get_ad($ad_id) : null;
        if (!$ad || $ad['status'] !== 'active') {
            return home_url('/');
        }

        $target_url = '';
        if (($ad['source_type'] ?? '') === 'custom') {
            $target_url = $ad['target_url'];
        }

        if (!$target_url) {
            $payload = $this->get_product_payload(absint($ad['product_id'] ?? 0), false);
            $target_url = $payload['target_url'] ?? '';
        }

        if (!$target_url) {
            return home_url('/');
        }

        return add_query_arg([
            'utm_source' => $zone ?: ($ad['zone'] ?? WPA_DEFAULT_ZONE),
            'utm_medium' => 'embed_ad',
            'utm_campaign' => sanitize_key($ad['campaign'] ?: 'wp_advertising'),
        ], $target_url);
    }

    public function search_products($term, $limit = 10) {
        if (!$this->wc_active()) {
            return [];
        }
        $term = sanitize_text_field($term);
        $ids = wc_get_products([
            'status' => 'publish',
            'limit' => max(1, min(20, absint($limit))),
            'return' => 'ids',
            's' => $term,
            'orderby' => 'title',
            'order' => 'ASC',
        ]);
        $results = [];
        foreach ((array) $ids as $id) {
            $product = wc_get_product($id);
            if (!$product || !$product->is_visible()) {
                continue;
            }
            $results[] = [
                'id' => $product->get_id(),
                'text' => sprintf('%s (#%d)', $product->get_name(), $product->get_id()),
                'image' => wp_get_attachment_image_url($product->get_image_id(), 'thumbnail') ?: '',
            ];
        }
        return $results;
    }
}
