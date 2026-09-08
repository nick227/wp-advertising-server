<?php
if (!defined('ABSPATH')) {
    exit;
}

final class WPA_Installer {
    const OPTION_DB_VERSION = 'wp_advertising_db_version';

    public static function activate() {
        self::install_tables();
        self::ensure_options();
        self::schedule_retention_cleanup();
        self::seed_default_house_ad();
    }

    public static function deactivate() {
        self::clear_retention_cleanup();
    }

    public static function maybe_upgrade() {
        if (get_option(self::OPTION_DB_VERSION) !== WPA_DB_VERSION) {
            self::install_tables();
        }
        self::ensure_options();
        self::schedule_retention_cleanup();
        self::seed_default_house_ad();
    }

    private static function seed_default_house_ad() {
        if (!class_exists('WPA_Repository')) {
            return;
        }
        (new WPA_Repository())->ensure_default_house_ad();
    }

    public static function ensure_options() {
        if (false === get_option(WPA_RETENTION_DAYS_OPTION, false)) {
            add_option(WPA_RETENTION_DAYS_OPTION, 90, '', false);
        }
    }

    public static function schedule_retention_cleanup() {
        if (!wp_next_scheduled(WPA_RETENTION_HOOK)) {
            wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', WPA_RETENTION_HOOK);
        }
    }

    public static function clear_retention_cleanup() {
        $timestamp = wp_next_scheduled(WPA_RETENTION_HOOK);
        if ($timestamp) {
            wp_unschedule_event($timestamp, WPA_RETENTION_HOOK);
        }
    }

    public static function ads_table() {
        global $wpdb;
        return $wpdb->prefix . 'wp_advertising_ads';
    }

    public static function events_table() {
        global $wpdb;
        return $wpdb->prefix . 'wp_advertising_events';
    }

    private static function install_tables() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset_collate = $wpdb->get_charset_collate();
        $ads_table = self::ads_table();
        $events_table = self::events_table();

        $ads_sql = "CREATE TABLE {$ads_table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            name varchar(190) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'active',
            source_type varchar(30) NOT NULL DEFAULT 'custom',
            product_mode varchar(30) NOT NULL DEFAULT 'specific',
            product_id bigint(20) unsigned DEFAULT 0,
            headline varchar(255) DEFAULT '',
            body text NULL,
            image_url text NULL,
            target_url text NULL,
            cta varchar(80) DEFAULT 'Shop now',
            label varchar(80) DEFAULT 'Sponsored Drop',
            campaign varchar(120) DEFAULT '',
            zone varchar(120) DEFAULT 'house-ad',
            weight int(10) unsigned NOT NULL DEFAULT 1,
            open_new_tab tinyint(1) NOT NULL DEFAULT 1,
            nofollow tinyint(1) NOT NULL DEFAULT 1,
            settings_json longtext NULL,
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            PRIMARY KEY  (id),
            KEY status (status),
            KEY zone (zone),
            KEY source_type (source_type),
            KEY product_mode (product_mode),
            KEY product_id (product_id)
        ) {$charset_collate};";

        $events_sql = "CREATE TABLE {$events_table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            event_uuid varchar(64) NOT NULL,
            ad_id bigint(20) unsigned DEFAULT 0,
            product_id bigint(20) unsigned DEFAULT 0,
            zone varchar(120) DEFAULT 'house-ad',
            event_type varchar(20) NOT NULL,
            target_url text NULL,
            referrer text NULL,
            referrer_host varchar(191) DEFAULT '',
            utm_source varchar(100) DEFAULT '',
            utm_medium varchar(100) DEFAULT '',
            utm_campaign varchar(120) DEFAULT '',
            device_type varchar(40) DEFAULT '',
            browser_family varchar(80) DEFAULT '',
            country_code char(2) DEFAULT '',
            region varchar(100) DEFAULT '',
            local_event_hour tinyint(3) unsigned DEFAULT 0,
            user_agent_hash varchar(64) DEFAULT '',
            ip_hash varchar(64) DEFAULT '',
            created_at datetime NOT NULL,
            PRIMARY KEY  (id),
            KEY event_uuid (event_uuid),
            KEY event_type (event_type),
            KEY ad_id (ad_id),
            KEY product_id (product_id),
            KEY zone (zone),
            KEY referrer_host (referrer_host),
            KEY country_code (country_code),
            KEY local_event_hour (local_event_hour),
            KEY created_at (created_at)
        ) {$charset_collate};";

        dbDelta($ads_sql);
        dbDelta($events_sql);
        self::migrate_existing_rows();
        update_option(self::OPTION_DB_VERSION, WPA_DB_VERSION);
    }

    private static function migrate_existing_rows() {
        global $wpdb;
        $ads_table = self::ads_table();
        $columns = $wpdb->get_results("SHOW COLUMNS FROM {$ads_table}", ARRAY_A);
        if (!$columns) {
            return;
        }
        $names = wp_list_pluck($columns, 'Field');
        if (in_array('ad_type', $names, true) && in_array('source_type', $names, true)) {
            $wpdb->query("UPDATE {$ads_table} SET source_type = CASE WHEN ad_type = 'woocommerce_product' THEN 'woocommerce' ELSE 'custom' END WHERE source_type = '' OR source_type IS NULL");
        }
        if (in_array('product_mode', $names, true)) {
            $wpdb->query("UPDATE {$ads_table} SET product_mode = 'specific' WHERE product_mode = '' OR product_mode IS NULL");
        }
        if (in_array('zone', $names, true)) {
            $wpdb->query($wpdb->prepare("UPDATE {$ads_table} SET zone = %s WHERE zone = '' OR zone IS NULL", WPA_DEFAULT_ZONE));
        }
        if (in_array('settings_json', $names, true)) {
            $wpdb->query("UPDATE {$ads_table} SET settings_json = '{\"layout\":\"card\",\"theme\":\"dark\"}' WHERE settings_json = '' OR settings_json IS NULL");
        }
    }
}
