<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Cached Trial/Pro entitlement. Front-end paths must never call the community server
 * for license validation — only read these options.
 */
final class WPA_License {
    const STATUS_INACTIVE = 'inactive';
    const STATUS_TRIAL = 'trial';
    const STATUS_ACTIVE = 'active';
    const STATUS_EXPIRED = 'expired';
    const STATUS_REVOKED = 'revoked';
    const STATUS_SUSPENDED = 'suspended';
    const STATUS_GRACE = 'grace';

    const CHECK_INTERVAL = 86400;

    private $repo;

    public function __construct(WPA_Repository $repo) {
        $this->repo = $repo;
    }

    public function status() {
        return sanitize_key((string) get_option(WPA_LICENSE_STATUS_OPTION, self::STATUS_INACTIVE));
    }

    public function network_access_until() {
        $raw = (string) get_option(WPA_LICENSE_ACCESS_UNTIL_OPTION, '');
        return $raw !== '' ? strtotime($raw) : 0;
    }

    public function rules() {
        $rules = get_option(WPA_LICENSE_RULES_OPTION, []);
        return is_array($rules) ? $rules : [];
    }

    public function allows($rule) {
        if ($rule === 'community_network' || $rule === 'external_embeds') {
            return $this->is_network_eligible();
        }
        $rules = $this->rules();
        return $this->is_network_eligible() && !empty($rules[$rule]);
    }

    public function is_network_eligible() {
        $status = $this->status();
        if (!in_array($status, [self::STATUS_TRIAL, self::STATUS_ACTIVE, self::STATUS_GRACE], true)) {
            return false;
        }
        $until = $this->network_access_until();
        if (!$until || $until <= time()) {
            return false;
        }
        return true;
    }

    public function store_entitlement(array $payload) {
        $status = strtolower((string) ($payload['networkStatus'] ?? ''));
        $map = [
            'trial' => self::STATUS_TRIAL,
            'active' => self::STATUS_ACTIVE,
            'expired' => self::STATUS_EXPIRED,
            'revoked' => self::STATUS_REVOKED,
            'suspended' => self::STATUS_SUSPENDED,
        ];
        $local = $map[$status] ?? self::STATUS_INACTIVE;
        if (empty($payload['eligible'])) {
            $local = in_array($local, [self::STATUS_REVOKED, self::STATUS_SUSPENDED], true) ? $local : self::STATUS_EXPIRED;
        }

        update_option(WPA_LICENSE_STATUS_OPTION, $local, false);
        update_option(WPA_LICENSE_ACCESS_UNTIL_OPTION, (string) ($payload['networkAccessUntil'] ?? ''), false);
        update_option(WPA_LICENSE_RULES_OPTION, is_array($payload['rules'] ?? null) ? $payload['rules'] : [], false);
        $suggested = absint($payload['nextCheckSuggestedSec'] ?? self::CHECK_INTERVAL);
        update_option(WPA_LICENSE_NEXT_CHECK_OPTION, time() + max(3600, $suggested), false);
        update_option(WPA_LICENSE_LAST_ERROR_OPTION, '', false);
    }

    public function clear_entitlement($status = self::STATUS_INACTIVE, $error = '') {
        update_option(WPA_LICENSE_STATUS_OPTION, $status, false);
        update_option(WPA_LICENSE_ACCESS_UNTIL_OPTION, '', false);
        update_option(WPA_LICENSE_RULES_OPTION, [], false);
        update_option(WPA_LICENSE_NEXT_CHECK_OPTION, 0, false);
        update_option(WPA_LICENSE_LAST_ERROR_OPTION, sanitize_text_field($error), false);
    }

    public function license_key() {
        return (string) get_option(WPA_LICENSE_KEY_OPTION, '');
    }

    public function product_site_url() {
        $api = (string) $this->repo->get_community_api_url();
        if ($api === '') {
            return '';
        }
        return (string) preg_replace('#/v1/?$#i', '', rtrim($api, '/'));
    }

    public function checkout_url() {
        $base = $this->product_site_url();
        return $base !== '' ? $base . '/checkout' : '';
    }

    public function activate_license($license_key) {
        $license_key = sanitize_text_field((string) $license_key);
        if ($license_key === '') {
            return new WP_Error('missing_key', __('Enter a license key from Checkout.', 'wp-advertising'));
        }
        if (!$this->repo->get_community_api_url()) {
            return new WP_Error('missing_api', __('Set the Community API URL before activating Pro.', 'wp-advertising'));
        }

        $registered = $this->repo->ensure_community_registered(false);
        if (!$registered) {
            return new WP_Error('not_registered', __('Could not register this site with the Community API.', 'wp-advertising'));
        }

        $auth = $this->repo->community_auth_payload();
        $result = $this->repo->community_api_request('POST', '/entitlements/activate-license', array_merge($auth, [
            'licenseKey' => $license_key,
            'pluginVersion' => WPA_VERSION,
        ]));

        if (is_wp_error($result) || !is_array($result) || (int) ($result['code'] ?? 0) < 200 || (int) ($result['code'] ?? 0) >= 300) {
            $message = $this->repo->community_api_error_message($result, __('Could not activate license.', 'wp-advertising'));
            update_option(WPA_LICENSE_LAST_ERROR_OPTION, $message, false);
            return new WP_Error('activate_failed', $message);
        }

        $body = is_array($result['body'] ?? null) ? $result['body'] : [];
        update_option(WPA_LICENSE_KEY_OPTION, $license_key, false);
        $this->store_entitlement($body);
        return $body;
    }

    public function start_trial() {
        $auth = $this->repo->community_auth_payload();
        if (empty($auth['siteId']) || empty($auth['apiKey'])) {
            $registered = $this->repo->ensure_community_registered(false);
            if (!$registered) {
                return new WP_Error('not_registered', __('Register the site with the Community API before starting a trial.', 'wp-advertising'));
            }
            $auth = $this->repo->community_auth_payload();
        }

        $result = $this->repo->community_api_request('POST', '/entitlements/start-trial', $auth);
        if (is_wp_error($result) || !is_array($result) || (int) ($result['code'] ?? 0) < 200 || (int) ($result['code'] ?? 0) >= 300) {
            $message = $this->repo->community_api_error_message($result, __('Could not start Trial.', 'wp-advertising'));
            update_option(WPA_LICENSE_LAST_ERROR_OPTION, $message, false);
            return new WP_Error('trial_failed', $message);
        }

        $body = is_array($result['body'] ?? null) ? $result['body'] : [];
        $this->store_entitlement($body);
        return $body;
    }

    public function maybe_validate($force = false) {
        if (!$force) {
            $next = absint(get_option(WPA_LICENSE_NEXT_CHECK_OPTION, 0));
            if ($next > time()) {
                return true;
            }
        }
        if (!$this->repo->get_community_api_url()) {
            return true;
        }
        $auth = $this->repo->community_auth_payload();
        if (empty($auth['siteId']) || empty($auth['apiKey'])) {
            return true;
        }

        $result = $this->repo->community_api_request('POST', '/entitlements/validate', $auth);
        if (is_wp_error($result) || !is_array($result) || (int) ($result['code'] ?? 0) < 200 || (int) ($result['code'] ?? 0) >= 300) {
            if ($this->is_network_eligible()) {
                update_option(WPA_LICENSE_STATUS_OPTION, self::STATUS_GRACE, false);
                update_option(WPA_LICENSE_NEXT_CHECK_OPTION, time() + HOUR_IN_SECONDS, false);
                update_option(WPA_LICENSE_LAST_ERROR_OPTION, $this->repo->community_api_error_message($result), false);
                return false;
            }
            $this->clear_entitlement(self::STATUS_EXPIRED, $this->repo->community_api_error_message($result));
            update_option(WPA_LICENSE_NEXT_CHECK_OPTION, time() + HOUR_IN_SECONDS, false);
            return false;
        }

        $body = is_array($result['body'] ?? null) ? $result['body'] : [];
        $this->store_entitlement($body);
        if (empty($body['eligible']) && $this->repo->community_enabled()) {
            $this->repo->set_community_enabled(false);
            $this->repo->sync_community_network(false);
        }
        return true;
    }
}
