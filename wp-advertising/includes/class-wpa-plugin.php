<?php
if (!defined('ABSPATH')) {
    exit;
}

final class WPA_Plugin {
    private static $instance = null;
    private $repo;
    private $license;
    private $renderer;
    private $admin;
    private $public;

    public static function instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->repo = new WPA_Repository();
        $this->license = new WPA_License($this->repo);
        $this->renderer = new WPA_Renderer($this->repo);
        $this->admin = new WPA_Admin_Pages($this->repo, $this->renderer, $this->license);
        $this->public = new WPA_Public_Endpoints($this->repo, $this->renderer);
        $this->hooks();
    }

    private function hooks() {
        add_filter('cron_schedules', [$this, 'register_cron_schedules']);
        add_action('plugins_loaded', ['WPA_Installer', 'maybe_upgrade']);
        add_action(WPA_RETENTION_HOOK, [$this->repo, 'cleanup_old_events']);
        add_action('wp_advertising_prefetch_community_ad', [$this->repo, 'prime_community_ad_cache']);
        add_action('admin_menu', [$this->admin, 'register_menu']);
        add_action('current_screen', [$this->admin, 'suppress_unrelated_admin_notices']);
        add_action('admin_enqueue_scripts', [$this->admin, 'enqueue_assets']);
        add_action('admin_init', [$this, 'maybe_refresh_entitlement']);
        add_action('wp_advertising_refresh_entitlement', [$this, 'scheduled_refresh_entitlement']);
        add_action('admin_post_wp_advertising_save_ad', [$this->admin, 'handle_save_ad']);
        add_action('admin_post_wp_advertising_delete_ad', [$this->admin, 'handle_delete_ad']);
        add_action('admin_post_wp_advertising_export_clicks', [$this->admin, 'handle_export_click_report']);
        add_action('admin_post_wp_advertising_toggle_community', [$this->admin, 'handle_toggle_community']);
        add_action('admin_post_wp_advertising_toggle_tracking', [$this->admin, 'handle_toggle_tracking']);
        add_action('admin_post_wp_advertising_save_main_settings', [$this->admin, 'handle_save_main_settings']);
        add_action('admin_post_wp_advertising_save_community_shortcode', [$this->admin, 'handle_save_community_shortcode']);
        add_action('admin_post_wp_advertising_refresh_license', [$this->admin, 'handle_refresh_license']);

        add_action('admin_post_wp_advertising_upgrade_pro', [$this->admin, 'handle_upgrade_pro']);

        add_action('admin_post_nopriv_wp_advertising_embed_js', [$this->public, 'serve_embed_js']);
        add_action('admin_post_wp_advertising_embed_js', [$this->public, 'serve_embed_js']);
        add_action('admin_post_nopriv_wp_advertising_render', [$this->public, 'serve_render']);
        add_action('admin_post_wp_advertising_render', [$this->public, 'serve_render']);
        add_action('admin_post_nopriv_wp_advertising_render_jsonp', [$this->public, 'serve_render_jsonp']);
        add_action('admin_post_wp_advertising_render_jsonp', [$this->public, 'serve_render_jsonp']);
        add_action('admin_post_nopriv_wp_advertising_impression', [$this->public, 'track_impression']);
        add_action('admin_post_wp_advertising_impression', [$this->public, 'track_impression']);
        add_action('admin_post_nopriv_wp_advertising_click', [$this->public, 'track_click_redirect']);
        add_action('admin_post_wp_advertising_click', [$this->public, 'track_click_redirect']);
        add_action('wp_ajax_wp_advertising_preview_random', [$this->public, 'ajax_preview_random']);
        add_action('wp_ajax_wp_advertising_search_products', [$this->public, 'ajax_search_products']);
        add_shortcode('wp_advertising_community_ad', [$this->public, 'shortcode_community_ad']);
    }

    public function register_cron_schedules($schedules) {
        if (!isset($schedules['wpa_every_4_minutes'])) {
            $schedules['wpa_every_4_minutes'] = [
                'interval' => 240,
                'display' => __('Every 4 Minutes', 'wp-advertising'),
            ];
        }
        return $schedules;
    }

    public function scheduled_refresh_entitlement() {
        if (in_array($this->license->status(), [WPA_License::STATUS_ACTIVE, WPA_License::STATUS_TRIAL, WPA_License::STATUS_GRACE, WPA_License::STATUS_EXPIRED], true)) {
            $this->license->maybe_validate(false);
        }
    }

    public function maybe_refresh_entitlement() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $this->license->maybe_validate(false);
    }
}
