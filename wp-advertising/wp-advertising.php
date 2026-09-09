<?php

/**

 * Plugin Name: WP Advertising

 * Plugin URI: https://wp-advertising-server-production.up.railway.app

 * Description: Create embeddable house ads, rotate WooCommerce products, opt into community ads, customize ad themes, preview ads live, and optionally track performance by ad, product, origin, and zone.

 * Version: 8.3.0

 * Author: WP Advertising

 * Author URI: https://wp-advertising-server-production.up.railway.app

 * Text Domain: wp-advertising

 * Requires at least: 6.2

 * Requires PHP: 7.4

 * License: GPLv2 or later

 */



if (!defined('ABSPATH')) {

    exit;

}



define('WPA_VERSION', '8.3.0');

define('WPA_DB_VERSION', '6.1.0');

define('WPA_PLUGIN_FILE', __FILE__);

define('WPA_PLUGIN_DIR', plugin_dir_path(__FILE__));

define('WPA_PLUGIN_URL', plugin_dir_url(__FILE__));

define('WPA_DEFAULT_ZONE', 'house-ad');

define('WPA_COMMUNITY_ZONE', 'community-ad');

define('WPA_COMMUNITY_ENABLED_OPTION', 'wp_advertising_community_enabled');

define('WPA_COMMUNITY_SETTINGS_OPTION', 'wp_advertising_community_shortcode_settings');

define('WPA_TRACKING_ENABLED_OPTION', 'wp_advertising_tracking_enabled');

define('WPA_COMMUNITY_API_URL_OPTION', 'wp_advertising_community_api_url');

define('WPA_COMMUNITY_SITE_ID_OPTION', 'wp_advertising_community_site_id');

define('WPA_COMMUNITY_PUBLIC_KEY_OPTION', 'wp_advertising_community_public_key');

define('WPA_COMMUNITY_STATUS_OPTION', 'wp_advertising_community_status');

define('WPA_COMMUNITY_LAST_ERROR_OPTION', 'wp_advertising_community_last_error');

define('WPA_LICENSE_STATUS_OPTION', 'wp_advertising_license_status');

define('WPA_LICENSE_ACCESS_UNTIL_OPTION', 'wp_advertising_license_access_until');

define('WPA_LICENSE_RULES_OPTION', 'wp_advertising_license_rules');

define('WPA_LICENSE_NEXT_CHECK_OPTION', 'wp_advertising_license_next_check_at');

define('WPA_LICENSE_LAST_ERROR_OPTION', 'wp_advertising_license_last_error');

define('WPA_LICENSE_KEY_OPTION', 'wp_advertising_license_key');

define('WPA_DEFAULT_COMMUNITY_API_URL', '');

define('WPA_NONCE_ACTION', 'wp_advertising_save_ad');

define('WPA_EVENT_TOKEN_TTL', 6 * HOUR_IN_SECONDS);

define('WPA_RETENTION_DAYS_OPTION', 'wp_advertising_retention_days');

define('WPA_RETENTION_HOOK', 'wp_advertising_cleanup_events');

define('WPA_COMMUNITY_CACHE_SCHEMA', 2);
define('WPA_COMMUNITY_FRESH_TTL',    5 * MINUTE_IN_SECONDS);
define('WPA_COMMUNITY_STALE_TTL',    60 * MINUTE_IN_SECONDS);
define('WPA_COMMUNITY_LOCK_TTL',     30);

define('WPA_LATEST_VERSION_OPTION',          'wp_advertising_latest_version');
define('WPA_LATEST_DOWNLOAD_URL_OPTION',     'wp_advertising_latest_download_url');
define('WPA_HEARTBEAT_NEXT_OPTION',          'wp_advertising_heartbeat_next_at');
define('WPA_PUBLIC_RELEASE_CHECK_NEXT_OPTION', 'wp_advertising_public_release_check_next_at');



require_once WPA_PLUGIN_DIR . 'includes/class-wpa-installer.php';

require_once WPA_PLUGIN_DIR . 'includes/class-wpa-repository.php';

require_once WPA_PLUGIN_DIR . 'includes/class-wpa-license.php';

require_once WPA_PLUGIN_DIR . 'includes/class-wpa-renderer.php';

require_once WPA_PLUGIN_DIR . 'includes/class-wpa-admin-pages.php';

require_once WPA_PLUGIN_DIR . 'includes/class-wpa-public-endpoints.php';

require_once WPA_PLUGIN_DIR . 'includes/class-wpa-plugin.php';



register_activation_hook(__FILE__, ['WPA_Installer', 'activate']);

register_deactivation_hook(__FILE__, ['WPA_Installer', 'deactivate']);

WPA_Plugin::instance();

