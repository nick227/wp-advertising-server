<?php
/**
 * WP Advertising uninstall cleanup.
 *
 * By default this removes plugin options only. Tables are retained so ad history
 * is not accidentally lost during reinstall. Define WPA_REMOVE_DATA_ON_UNINSTALL
 * as true before uninstalling if you intentionally want full data removal.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('wp_advertising_db_version');
delete_option('wp_advertising_retention_days');
delete_option('wp_advertising_community_enabled');
delete_option('wp_advertising_community_shortcode_settings');
delete_option('wp_advertising_tracking_enabled');
delete_option('wp_advertising_community_api_url');
delete_option('wp_advertising_community_site_id');
delete_option('wp_advertising_community_public_key');
delete_option('wp_advertising_community_secret');
delete_option('wp_advertising_community_status');
delete_option('wp_advertising_community_last_error');
delete_option('wp_advertising_license_status');
delete_option('wp_advertising_license_access_until');
delete_option('wp_advertising_license_rules');
delete_option('wp_advertising_license_next_check_at');
delete_option('wp_advertising_license_last_error');
delete_option('wp_advertising_license_key');
delete_option('wp_advertising_latest_version');
delete_option('wp_advertising_latest_download_url');
delete_option('wp_advertising_heartbeat_next_at');
delete_option('wp_advertising_public_release_check_next_at');

if (defined('WPA_REMOVE_DATA_ON_UNINSTALL') && WPA_REMOVE_DATA_ON_UNINSTALL) {
    wp_clear_scheduled_hook('wp_advertising_refresh_entitlement');
    global $wpdb;
    $wpdb->query("DROP TABLE IF EXISTS {$wpdb->prefix}wp_advertising_events");
    $wpdb->query("DROP TABLE IF EXISTS {$wpdb->prefix}wp_advertising_ads");
}
