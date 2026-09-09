<?php
if (!defined('ABSPATH')) {
    exit;
}

final class WPA_Admin_Pages {
    private $repo;
    private $renderer;
    private $license;

    public function __construct(WPA_Repository $repo, WPA_Renderer $renderer, WPA_License $license) {
        $this->repo = $repo;
        $this->renderer = $renderer;
        $this->license = $license;
    }

    public function register_menu() {
        add_menu_page(
            __('WP Advertising', 'wp-advertising'),
            __('WP Advertising', 'wp-advertising'),
            'manage_options',
            'wp-advertising',
            [$this, 'render_performance_page'],
            'dashicons-megaphone',
            56
        );
        add_submenu_page(null, __('Create Ad', 'wp-advertising'), __('Create Ad', 'wp-advertising'), 'manage_options', 'wp-advertising-edit', [$this, 'render_edit_page']);
        add_submenu_page(null, __('Community Shortcode', 'wp-advertising'), __('Community Shortcode', 'wp-advertising'), 'manage_options', 'wp-advertising-community', [$this, 'render_community_shortcode_page']);
    }

    public function suppress_unrelated_admin_notices() {
        if (!$this->is_wp_advertising_admin_page()) {
            return;
        }

        remove_all_actions('admin_notices');
        remove_all_actions('all_admin_notices');
        remove_all_actions('network_admin_notices');
        remove_all_actions('user_admin_notices');
    }

    private function is_wp_advertising_admin_page() {
        $page = isset($_GET['page']) ? sanitize_key(wp_unslash($_GET['page'])) : '';
        return 0 === strpos($page, 'wp-advertising');
    }

    public function enqueue_assets($hook) {
        if (false === strpos($hook, 'wp-advertising')) {
            return;
        }
        wp_enqueue_media();
        wp_enqueue_style('wp-advertising-admin', WPA_PLUGIN_URL . 'assets/admin.css', [], WPA_VERSION);
        wp_enqueue_script('wp-advertising-admin', WPA_PLUGIN_URL . 'assets/admin.js', ['jquery'], WPA_VERSION, true);
        wp_localize_script('wp-advertising-admin', 'WPAdvertisingAdmin', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('wp_advertising_preview_random'),
            'productSearchNonce' => wp_create_nonce('wp_advertising_product_search'),
            'themeClassPrefix' => 'wpa-theme-',
        ]);
    }

    public function handle_save_ad() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Permission denied.', 'wp-advertising'));
        }
        check_admin_referer(WPA_NONCE_ACTION);

        $id = absint($_POST['id'] ?? 0);
        $data = $this->repo->sanitize_ad_data(wp_unslash($_POST));
        $this->repo->save_ad($id, $data);

        wp_safe_redirect(add_query_arg(['page' => 'wp-advertising', 'updated' => 1], admin_url('admin.php')));
        exit;
    }

    public function handle_delete_ad() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Permission denied.', 'wp-advertising'));
        }
        $id = absint($_GET['ad_id'] ?? 0);
        check_admin_referer('wp_advertising_delete_ad_' . $id);
        $this->repo->delete_ad($id);
        wp_safe_redirect(add_query_arg(['page' => 'wp-advertising', 'deleted' => 1], admin_url('admin.php')));
        exit;
    }

    public function handle_toggle_community() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Permission denied.', 'wp-advertising'));
        }
        check_admin_referer('wp_advertising_toggle_community');
        $enabled = !empty($_POST['community_enabled']);
        $this->repo->set_community_enabled($enabled);
        $this->repo->sync_community_network($enabled, $this->renderer->house_payload() ?: []);
        wp_safe_redirect(add_query_arg(['page' => 'wp-advertising', 'community_updated' => 1], admin_url('admin.php')));
        exit;
    }

    public function handle_toggle_tracking() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Permission denied.', 'wp-advertising'));
        }
        check_admin_referer('wp_advertising_toggle_tracking');
        $this->repo->set_tracking_enabled(!empty($_POST['tracking_enabled']));
        wp_safe_redirect(add_query_arg(['page' => 'wp-advertising', 'tracking_updated' => 1], admin_url('admin.php')));
        exit;
    }

    public function handle_save_main_settings() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Permission denied.', 'wp-advertising'));
        }
        check_admin_referer('wp_advertising_save_main_settings');
        $community_enabled = !empty($_POST['community_enabled']);
        $this->repo->set_community_enabled($community_enabled);
        $this->repo->set_tracking_enabled(!empty($_POST['tracking_enabled']));
        $this->repo->set_community_api_url(wp_unslash($_POST['community_api_url'] ?? ''));
        $this->repo->sync_community_network($community_enabled, $this->renderer->house_payload() ?: []);

        $redirect_args = [
            'page' => 'wp-advertising',
            'start_date' => sanitize_text_field(wp_unslash($_POST['start_date'] ?? '')),
            'end_date' => sanitize_text_field(wp_unslash($_POST['end_date'] ?? '')),
            'per_page' => absint($_POST['per_page'] ?? 10),
        ];

        wp_safe_redirect(add_query_arg($redirect_args, admin_url('admin.php')));
        exit;
    }

    public function handle_refresh_license() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Permission denied.', 'wp-advertising'));
        }
        check_admin_referer('wp_advertising_refresh_license');
        $this->license->maybe_validate(true);
        wp_safe_redirect(add_query_arg(['page' => 'wp-advertising', 'license_refreshed' => 1], admin_url('admin.php')));
        exit;
    }



    public function handle_upgrade_pro() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Permission denied.', 'wp-advertising'));
        }
        check_admin_referer('wp_advertising_upgrade_pro');
        $current_user = wp_get_current_user();
        $admin_email = $current_user->user_email;
        $checkout_url = $this->license->get_checkout_session('monthly', $admin_email);
        
        if (is_wp_error($checkout_url)) {
            wp_safe_redirect(add_query_arg(['page' => 'wp-advertising', 'checkout_error' => urlencode($checkout_url->get_error_message())], admin_url('admin.php')));
            exit;
        }

        if ($checkout_url === 'already_active') {
            wp_safe_redirect(add_query_arg(['page' => 'wp-advertising', 'license_activated' => 1], admin_url('admin.php')));
            exit;
        }
        
        wp_redirect($checkout_url);
        exit;
    }

    public function handle_save_community_shortcode() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Permission denied.', 'wp-advertising'));
        }
        check_admin_referer('wp_advertising_save_community_shortcode');
        $this->repo->save_community_shortcode_settings(wp_unslash($_POST));
        if ($this->repo->community_enabled()) {
            $this->repo->sync_community_network(true, $this->renderer->house_payload() ?: []);
        }
        wp_safe_redirect(add_query_arg(['page' => 'wp-advertising-community', 'updated' => 1], admin_url('admin.php')));
        exit;
    }

    public function handle_export_click_report() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('Permission denied.', 'wp-advertising'));
        }
        check_admin_referer('wp_advertising_export_clicks');

        $ad_id = absint($_GET['ad_id'] ?? 0);
        $zone = $this->repo->sanitize_zone(wp_unslash($_GET['zone'] ?? ''));
        $start_date = sanitize_text_field(wp_unslash($_GET['start_date'] ?? ''));
        $end_date = sanitize_text_field(wp_unslash($_GET['end_date'] ?? ''));
        $rows = $this->repo->click_report_rows($ad_id, $zone, $start_date, $end_date, 50000);

        $filename = sprintf('wp-advertising-clicks-%s-%s.csv', $ad_id ? 'ad-' . $ad_id : $zone, gmdate('Ymd-His'));
        nocache_headers();
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename=' . sanitize_file_name($filename));

        $out = fopen('php://output', 'w');
        fputcsv($out, ['clicked_at', 'ad_id', 'product_id', 'zone', 'origin', 'referrer_url', 'utm_source', 'utm_medium', 'utm_campaign', 'device_type', 'browser', 'country', 'region', 'local_hour', 'target_url']);
        foreach ($rows as $row) {
            fputcsv($out, [
                $row['created_at'],
                $row['ad_id'],
                $row['product_id'],
                $row['zone'],
                $row['referrer_host'],
                $row['referrer'],
                $row['utm_source'],
                $row['utm_medium'],
                $row['utm_campaign'],
                $row['device_type'],
                $row['browser_family'],
                $row['country_code'],
                $row['region'],
                $row['local_event_hour'],
                $row['target_url'],
            ]);
        }
        fclose($out);
        exit;
    }

    public function render_performance_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        if (!empty($_GET['stripe_success'])) {
            $session_id = sanitize_text_field(wp_unslash($_GET['session_id'] ?? ''));
            $this->license->maybe_validate(true, $session_id);
            wp_safe_redirect(add_query_arg(['page' => 'wp-advertising', 'license_activated' => 1], admin_url('admin.php')));
            exit;
        }

        if (!empty($_GET['stripe_canceled'])) {
            wp_safe_redirect(add_query_arg(['page' => 'wp-advertising', 'checkout_canceled' => 1], admin_url('admin.php')));
            exit;
        }

        $default_start = '2000-01-01';
        $default_end = gmdate('Y-m-d', current_time('timestamp'));
        $start_date = sanitize_text_field(wp_unslash($_GET['start_date'] ?? ''));
        if (empty($start_date)) {
            $start_date = $default_start;
        }
        $end_date = sanitize_text_field(wp_unslash($_GET['end_date'] ?? ''));
        if (empty($end_date)) {
            $end_date = $default_end;
        }
        list($start_mysql, $end_mysql) = $this->repo->normalize_report_range($start_date, $end_date);
        $start_date = substr($start_mysql, 0, 10);
        $end_date = substr($end_mysql, 0, 10);

        $orderby = sanitize_key(wp_unslash($_GET['orderby'] ?? 'clicks'));
        $order = strtolower(sanitize_key(wp_unslash($_GET['order'] ?? 'desc'))) === 'asc' ? 'asc' : 'desc';
        $paged = max(1, absint($_GET['paged'] ?? 1));
        $per_page = max(5, min(50, absint($_GET['per_page'] ?? 10)));

        $ads = $this->repo->get_ads();
        $stats = $this->repo->aggregate_stats($start_date, $end_date);
        $house_stat = $this->repo->stat_value($stats, 'zones', WPA_DEFAULT_ZONE);
        $house_embed = $this->renderer->embed_code(WPA_DEFAULT_ZONE);
        $house_payload = $this->renderer->house_payload();
        $community_enabled = $this->repo->community_enabled();
        $tracking_enabled = $this->repo->tracking_enabled();
        $community_api_url = $this->repo->get_community_api_url();
        $community_sync_status = $this->repo->get_community_sync_status();
        $community_last_error = $this->repo->get_community_last_error();
        $community_stat = $this->repo->stat_value($stats, 'zones', WPA_COMMUNITY_ZONE);
        $community_payload = $this->renderer->community_payload(true);
        $community_shortcode_url = add_query_arg(['page' => 'wp-advertising-community'], admin_url('admin.php'));
        $community_shortcode = $this->renderer->community_shortcode($this->repo->get_community_shortcode_settings());
        $rows = $this->build_performance_rows($ads, $stats, $start_date, $end_date);
        $top_origin = $this->repo->top_origin(0, '', $start_date, $end_date);

        $allowed_orderby = ['name', 'type', 'zone', 'status', 'impressions', 'clicks', 'ctr', 'top_origin'];
        if (!in_array($orderby, $allowed_orderby, true)) {
            $orderby = 'clicks';
        }
        usort($rows, function ($a, $b) use ($orderby, $order) {
            $left = $a[$orderby] ?? '';
            $right = $b[$orderby] ?? '';
            if (in_array($orderby, ['impressions', 'clicks', 'ctr'], true)) {
                $result = $left <=> $right;
            } else {
                $result = strcasecmp((string) $left, (string) $right);
            }
            return $order === 'asc' ? $result : -$result;
        });
        $total_items = count($rows);
        $total_pages = max(1, (int) ceil($total_items / $per_page));
        $paged = min($paged, $total_pages);
        $visible_rows = array_slice($rows, ($paged - 1) * $per_page, $per_page);
        ?>
        <div class="wrap wpa-wrap">
            <div class="wpa-hero compact">
                <div>
                    <h1><?php esc_html_e('WP Advertising', 'wp-advertising'); ?></h1>
                    <p><?php esc_html_e('Performance, click origin, preview, and embed copy in one place.', 'wp-advertising'); ?></p>
                    <?php $this->render_build_meta(); ?>
                </div>
            </div>

            <?php $this->render_notices(); ?>


            <div class="wpa-builder-grid wpa-performance-grid">
                <div class="wpa-performance-stack">
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="wpa-panel wpa-main-controls">
                        <?php wp_nonce_field('wp_advertising_save_main_settings'); ?>
                        <input type="hidden" name="action" value="wp_advertising_save_main_settings">

                        <input type="hidden" name="start_date" value="<?php echo esc_attr($start_date); ?>">
                        <input type="hidden" name="end_date" value="<?php echo esc_attr($end_date); ?>">
                        <input type="hidden" name="per_page" value="<?php echo esc_attr($per_page); ?>">

                        <div class="wpa-main-row">
                            <div class="wpa-row-title"><?php esc_html_e('License', 'wp-advertising'); ?></div>
                            <div class="wpa-row-body">
                                <p style="margin:0 0 0.5rem">
                                    <?php
                                    echo esc_html(sprintf(
                                        /* translators: 1: status, 2: access until timestamp or dash */
                                        __('Status: %1$s · Access until: %2$s', 'wp-advertising'),
                                        $this->license->status(),
                                        $this->license->network_access_until() ? gmdate('Y-m-d H:i', $this->license->network_access_until()) . ' UTC' : '—'
                                    ));
                                    ?>
                                </p>
                                <p style="margin:0 0 0.75rem;color:#646970">
                                    <?php esc_html_e('Trial starts when you enable Community. Upgrade to Pro to continue network access after the trial.', 'wp-advertising'); ?>
                                </p>
                                <?php
                                $license_error = (string) get_option(WPA_LICENSE_LAST_ERROR_OPTION, '');
                                if ($license_error) :
                                    ?>
                                    <p style="margin:0 0 0.75rem;color:#b32d2e"><small><?php echo esc_html($license_error); ?></small></p>
                                <?php endif; ?>
                                <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center">
                                    <a class="button button-primary" href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=wp_advertising_upgrade_pro'), 'wp_advertising_upgrade_pro')); ?>">
                                        <?php esc_html_e('Upgrade to Pro', 'wp-advertising'); ?>
                                    </a>
                                    <a class="button" href="<?php echo esc_url(wp_nonce_url(admin_url('admin-post.php?action=wp_advertising_refresh_license'), 'wp_advertising_refresh_license')); ?>">
                                        <?php esc_html_e('Refresh', 'wp-advertising'); ?>
                                    </a>
                                </div>
                            </div>
                            <div class="wpa-row-actions"></div>
                        </div>

                        <div class="wpa-main-row">
                            <div class="wpa-row-title"><?php esc_html_e('Community Ads', 'wp-advertising'); ?></div>
                            <div class="wpa-row-body">
                                <label class="wpa-toggle-line"><input type="checkbox" name="community_enabled" value="1" <?php checked($community_enabled); ?>> <?php esc_html_e('Add my site to Community', 'wp-advertising'); ?></label>
                            </div>
                            <div class="wpa-row-actions"><small><?php echo esc_html($community_api_url ? ucwords(str_replace('_', ' ', $community_sync_status)) : __('Local only', 'wp-advertising')); ?></small></div>
                        </div>

                        <div class="wpa-main-row">
                            <div class="wpa-row-title"><?php esc_html_e('Community API URL', 'wp-advertising'); ?></div>
                            <div class="wpa-row-body">
                                <input type="url" name="community_api_url" value="<?php echo esc_attr($community_api_url); ?>" placeholder="https://…/v1" class="regular-text">
                                <p class="description"><?php esc_html_e('Leave blank for local-only (no network). Use http://localhost:4100/v1 for local dev.', 'wp-advertising'); ?></p>
                            </div>
                            <div class="wpa-row-actions"></div>
                        </div>

                        <?php if ($community_last_error) : ?>
                            <div class="wpa-main-row wpa-api-error-row">
                                <div class="wpa-row-title"><?php esc_html_e('Network Status', 'wp-advertising'); ?></div>
                                <div class="wpa-row-body"><small><?php echo esc_html($community_last_error); ?></small></div>
                                <div class="wpa-row-actions"></div>
                            </div>
                        <?php endif; ?>

                        <input type="hidden" name="tracking_enabled" value="1">

                        <div class="wpa-main-row wpa-origin-row">
                            <div class="wpa-row-title"><?php esc_html_e('Top Click Origin', 'wp-advertising'); ?></div>
                            <div class="wpa-row-body"><strong><?php echo esc_html($top_origin['origin']); ?></strong></div>
                            <div class="wpa-row-actions"><small><?php echo esc_html(sprintf(_n('%s click', '%s clicks', $top_origin['clicks'], 'wp-advertising'), number_format_i18n($top_origin['clicks']))); ?></small></div>
                        </div>

                        <div class="wpa-main-row wpa-apply-row">
                            <div class="wpa-row-title"></div>
                            <div class="wpa-row-body"></div>
                            <div class="wpa-row-actions"><button type="submit" class="button button-primary"><?php esc_html_e('Apply', 'wp-advertising'); ?></button></div>
                        </div>
                    </form>

                    <section class="wpa-panel wpa-performance-main">
                    <div class="wpa-panel-header">
                        <div>
                            <h2><?php esc_html_e('All Ads', 'wp-advertising'); ?></h2>
                            <p><?php esc_html_e('Showing all-time performance. Sort columns and export click reports per row.', 'wp-advertising'); ?></p>
                        </div>
                    </div>
                    <div class="wpa-table-scroll">
                    <table class="wpa-performance-table">
                        <thead>
                            <tr>
                                <?php $this->sortable_th('name', __('Ad', 'wp-advertising'), $orderby, $order, $start_date, $end_date, $per_page); ?>
                                <?php $this->sortable_th('type', __('Type', 'wp-advertising'), $orderby, $order, $start_date, $end_date, $per_page); ?>
                                <?php $this->sortable_th('zone', __('Zone', 'wp-advertising'), $orderby, $order, $start_date, $end_date, $per_page); ?>
                                <?php $this->sortable_th('status', __('Status', 'wp-advertising'), $orderby, $order, $start_date, $end_date, $per_page); ?>
                                <?php $this->sortable_th('impressions', __('Impressions', 'wp-advertising'), $orderby, $order, $start_date, $end_date, $per_page); ?>
                                <?php $this->sortable_th('clicks', __('Clicks', 'wp-advertising'), $orderby, $order, $start_date, $end_date, $per_page); ?>
                                <?php $this->sortable_th('ctr', __('CTR', 'wp-advertising'), $orderby, $order, $start_date, $end_date, $per_page); ?>
                                <?php $this->sortable_th('top_origin', __('Top Origin', 'wp-advertising'), $orderby, $order, $start_date, $end_date, $per_page); ?>
                                <th><?php esc_html_e('Actions', 'wp-advertising'); ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($visible_rows as $row) : $this->render_performance_row($row); endforeach; ?>
                        </tbody>
                    </table>
                    </div>
                    <?php $this->render_pagination($paged, $total_pages, $total_items, $per_page, $orderby, $order, $start_date, $end_date); ?>
                    <div class="wpa-under-table-actions">
                        <a class="button button-primary button-hero" href="<?php echo esc_url(add_query_arg(['page' => 'wp-advertising-edit'], admin_url('admin.php'))); ?>"><?php esc_html_e('Add Ad', 'wp-advertising'); ?></a>
                    </div>
                    </section>
                </div>

                <aside class="wpa-live-stack">
                    <section class="wpa-panel wpa-live-panel wpa-preview-panel">
                        <div class="wpa-preview-header" style="align-items: flex-start;">
                            <div>
                                <h2><?php esc_html_e('House Ad', 'wp-advertising'); ?></h2>
                                <p style="margin: 0.25rem 0 0; font-size: 0.85em; color: #646970; line-height: 1.3; font-weight: normal;"><?php esc_html_e('The URL you post around the internet and is always only your website.', 'wp-advertising'); ?></p>
                            </div>
                            <a class="button" style="margin-top:0.25rem;" href="<?php echo esc_url(add_query_arg(['page' => 'wp-advertising-edit', 'zone' => WPA_DEFAULT_ZONE], admin_url('admin.php'))); ?>"><?php esc_html_e('Edit', 'wp-advertising'); ?></a>
                        </div>
                        <div class="wpa-preview-stage">
                            <?php
                            if ($house_payload) {
                                echo $this->renderer->card_html($house_payload, true); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
                            } else {
                                echo '<p>' . esc_html__('No active house ad.', 'wp-advertising') . '</p>';
                            }
                            ?>
                        </div>
                        <div class="wpa-embed-box">
                            <h3><?php esc_html_e('Embed', 'wp-advertising'); ?></h3>
                            <textarea readonly onclick="this.select();"><?php echo esc_textarea($house_embed); ?></textarea>
                            <button type="button" class="button wpa-copy" data-copy="<?php echo esc_attr($house_embed); ?>"><?php esc_html_e('Copy', 'wp-advertising'); ?></button>
                        </div>
                    </section>

                    <section class="wpa-panel wpa-live-panel wpa-preview-panel">
                        <div class="wpa-preview-header" style="align-items: flex-start;">
                            <div>
                                <h2><?php esc_html_e('Community Ad', 'wp-advertising'); ?></h2>
                                <p style="margin: 0.25rem 0 0; font-size: 0.85em; color: #646970; line-height: 1.3; font-weight: normal;"><?php esc_html_e('The dynamic output from community and user should put this on their own website somewhere.', 'wp-advertising'); ?></p>
                            </div>
                            <a class="button" style="margin-top:0.25rem;" href="<?php echo esc_url($community_shortcode_url); ?>"><?php esc_html_e('Edit', 'wp-advertising'); ?></a>
                        </div>
                        <div class="wpa-preview-stage compact-preview">
                            <?php
                            if ($community_payload) {
                                echo $this->renderer->card_html($community_payload, true); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
                            } else {
                                echo '<p>' . esc_html__('No community creative available.', 'wp-advertising') . '</p>';
                            }
                            ?>
                        </div>
                        <div class="wpa-embed-box">
                            <h3><?php esc_html_e('Shortcode', 'wp-advertising'); ?></h3>
                            <textarea readonly onclick="this.select();"><?php echo esc_textarea($community_shortcode); ?></textarea>
                            <button type="button" class="button wpa-copy" data-copy="<?php echo esc_attr($community_shortcode); ?>"><?php esc_html_e('Copy', 'wp-advertising'); ?></button>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
        <?php
    }

    private function build_performance_rows($ads, $stats, $start_date, $end_date) {
        $rows = [];

        foreach ($ads as $ad) {
            $ad_id = (int) $ad['id'];
            $ad_stat = $this->repo->stat_value($stats, 'ads', $ad_id);
            $origin = $this->repo->top_origin($ad_id, '', $start_date, $end_date);
            $rows[] = [
                'name' => sprintf('%s #%d', $ad['name'] ?: __('Untitled Ad', 'wp-advertising'), $ad_id),
                'description' => $ad['headline'] ?: $ad['label'],
                'type' => $this->renderer->source_label($ad),
                'zone' => $ad['zone'],
                'status' => $ad['status'],
                'impressions' => (int) $ad_stat['impressions'],
                'clicks' => (int) $ad_stat['clicks'],
                'ctr' => (float) $ad_stat['ctr'],
                'top_origin' => $origin['origin'],
                'top_origin_clicks' => (int) $origin['clicks'],
                'is_community' => false,
                'csv_url' => $this->csv_url($ad_id, '', $start_date, $end_date),
                'edit_url' => add_query_arg(['page' => 'wp-advertising-edit', 'ad_id' => $ad_id], admin_url('admin.php')),
                'delete_url' => wp_nonce_url(add_query_arg(['action' => 'wp_advertising_delete_ad', 'ad_id' => $ad_id], admin_url('admin-post.php')), 'wp_advertising_delete_ad_' . $ad_id),
            ];
        }

        $community_origin = $this->repo->top_origin(0, WPA_COMMUNITY_ZONE, $start_date, $end_date);
        $community_stat = $this->repo->stat_value($stats, 'zones', WPA_COMMUNITY_ZONE);
        $rows[] = [
            'name' => __('Community Network', 'wp-advertising'),
            'description' => __('Aggregate for community-ad zone inventory', 'wp-advertising'),
            'type' => __('Community', 'wp-advertising'),
            'zone' => WPA_COMMUNITY_ZONE,
            'status' => $this->repo->community_enabled() ? 'active' : 'paused',
            'impressions' => (int) $community_stat['impressions'],
            'clicks' => (int) $community_stat['clicks'],
            'ctr' => (float) $community_stat['ctr'],
            'top_origin' => $community_origin['origin'],
            'top_origin_clicks' => (int) $community_origin['clicks'],
            'is_community' => true,
            'csv_url' => $this->csv_url(0, WPA_COMMUNITY_ZONE, $start_date, $end_date),
            'edit_url' => add_query_arg(['page' => 'wp-advertising-community'], admin_url('admin.php')),
            'delete_url' => '',
        ];

        return $rows;
    }

    private function sortable_th($key, $label, $orderby, $order, $start_date, $end_date, $per_page) {
        $next_order = ($orderby === $key && $order === 'asc') ? 'desc' : 'asc';
        $url = add_query_arg([
            'page' => 'wp-advertising',
            'start_date' => $start_date,
            'end_date' => $end_date,
            'per_page' => $per_page,
            'orderby' => $key,
            'order' => $next_order,
            'paged' => 1,
        ], admin_url('admin.php'));
        $indicator = $orderby === $key ? ($order === 'asc' ? ' ↑' : ' ↓') : '';
        echo '<th><a href="' . esc_url($url) . '">' . esc_html($label . $indicator) . '</a></th>';
    }

    private function render_performance_row($row) {
        ?>
        <tr class="<?php echo !empty($row['is_community']) ? 'wpa-community-row' : ''; ?>">
            <td><strong><?php echo esc_html($row['name']); ?></strong><small><?php echo esc_html($row['description']); ?></small></td>
            <td><?php echo esc_html($row['type']); ?></td>
            <td><?php echo esc_html($row['zone']); ?></td>
            <td><span class="wpa-status wpa-status-<?php echo esc_attr($row['status']); ?>"><?php echo esc_html(ucfirst($row['status'])); ?></span></td>
            <td><?php echo esc_html(number_format_i18n($row['impressions'])); ?></td>
            <td><?php echo esc_html(number_format_i18n($row['clicks'])); ?></td>
            <td><?php echo esc_html(number_format_i18n($row['ctr'], 2)); ?>%</td>
            <td><strong><?php echo esc_html($row['top_origin']); ?></strong><small><?php echo esc_html(sprintf(_n('%s click', '%s clicks', $row['top_origin_clicks'], 'wp-advertising'), number_format_i18n($row['top_origin_clicks']))); ?></small></td>
            <td class="wpa-row-actions">
                <?php if (!empty($row['is_community'])) : ?>
                    <a class="button" href="<?php echo esc_url($row['edit_url']); ?>"><?php esc_html_e('Edit', 'wp-advertising'); ?></a>
                <?php else : ?>
                    <a class="button" href="<?php echo esc_url($row['edit_url']); ?>"><?php esc_html_e('Edit', 'wp-advertising'); ?></a>
                    <a class="button button-link-delete" href="<?php echo esc_url($row['delete_url']); ?>" onclick="return confirm('<?php echo esc_js(__('Delete this ad?', 'wp-advertising')); ?>');"><?php esc_html_e('Delete', 'wp-advertising'); ?></a>
                <?php endif; ?>
                <a class="button" href="<?php echo esc_url($row['csv_url']); ?>"><?php esc_html_e('CSV', 'wp-advertising'); ?></a>
            </td>
        </tr>
        <?php
    }

    private function render_pagination($paged, $total_pages, $total_items, $per_page, $orderby, $order, $start_date, $end_date) {
        if ($total_pages <= 1 && $total_items <= $per_page) {
            return;
        }
        $base_args = [
            'page' => 'wp-advertising',
            'start_date' => $start_date,
            'end_date' => $end_date,
            'per_page' => $per_page,
            'orderby' => $orderby,
            'order' => $order,
        ];
        ?>
        <div class="wpa-pagination">
            <span><?php echo esc_html(sprintf(_n('%s row', '%s rows', $total_items, 'wp-advertising'), number_format_i18n($total_items))); ?></span>
            <?php if ($paged > 1) : ?>
                <a class="button" href="<?php echo esc_url(add_query_arg($base_args + ['paged' => $paged - 1], admin_url('admin.php'))); ?>"><?php esc_html_e('Previous', 'wp-advertising'); ?></a>
            <?php endif; ?>
            <span><?php echo esc_html(sprintf(__('Page %1$s of %2$s', 'wp-advertising'), number_format_i18n($paged), number_format_i18n($total_pages))); ?></span>
            <?php if ($paged < $total_pages) : ?>
                <a class="button" href="<?php echo esc_url(add_query_arg($base_args + ['paged' => $paged + 1], admin_url('admin.php'))); ?>"><?php esc_html_e('Next', 'wp-advertising'); ?></a>
            <?php endif; ?>
        </div>
        <?php
    }

    private function csv_url($ad_id, $zone, $start_date, $end_date) {
        return wp_nonce_url(add_query_arg([
            'action' => 'wp_advertising_export_clicks',
            'ad_id' => absint($ad_id),
            'zone' => $this->repo->sanitize_zone($zone),
            'start_date' => $start_date,
            'end_date' => $end_date,
        ], admin_url('admin-post.php')), 'wp_advertising_export_clicks');
    }

    private function render_build_meta() {
        $installed_db = (string) get_option(WPA_Installer::OPTION_DB_VERSION, '');
        $label = sprintf('v%s · DB %s', WPA_VERSION, WPA_DB_VERSION);
        if ($installed_db !== '' && $installed_db !== WPA_DB_VERSION) {
            $label .= sprintf(' (installed %s)', $installed_db);
        }
        echo '<p class="wpa-build-meta"><small>' . esc_html($label) . '</small></p>';
    }

    private function render_notices() {
        if (!empty($_GET['updated'])) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Ad saved.', 'wp-advertising') . '</p></div>';
        }
        if (!empty($_GET['deleted'])) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Ad deleted.', 'wp-advertising') . '</p></div>';
        }
        if (!empty($_GET['community_updated'])) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Community ad setting updated.', 'wp-advertising') . '</p></div>';
        }
        if (!empty($_GET['tracking_updated'])) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Tracking setting updated.', 'wp-advertising') . '</p></div>';
        }
        if (!empty($_GET['license_refreshed'])) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Entitlement refreshed.', 'wp-advertising') . '</p></div>';
        }
        if (!empty($_GET['license_activated'])) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Payment received. If your Pro features are not instantly available, the activation is still syncing in the background.', 'wp-advertising') . '</p></div>';
        }
        if (!empty($_GET['checkout_canceled'])) {
            echo '<div class="notice notice-warning is-dismissible"><p>' . esc_html__('Checkout was canceled.', 'wp-advertising') . '</p></div>';
        }
        if (!empty($_GET['checkout_error'])) {
            $msg = sanitize_text_field(wp_unslash($_GET['checkout_error']));
            echo '<div class="notice notice-error is-dismissible"><p>' . esc_html(sprintf(__('Checkout error: %s', 'wp-advertising'), $msg)) . '</p></div>';
        }
        if (!empty($_GET['license_error'])) {
            echo '<div class="notice notice-error is-dismissible"><p style="color: black;">' . esc_html__('License activation failed. Check the entitlement error message below.', 'wp-advertising') . '</p></div>';
        }
        if (!$this->repo->wc_active()) {
            echo '<div class="notice notice-warning"><p>' . esc_html__('WooCommerce is not active. Custom ads still work, but WooCommerce product and random product ads require WooCommerce.', 'wp-advertising') . '</p></div>';
        }
    }

    public function render_edit_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $id = absint($_GET['ad_id'] ?? 0);
        $ad = $id ? $this->repo->get_ad($id) : null;
        if (!$ad) {
            $ad = $this->repo->default_ad();
            $requested_zone = $this->repo->sanitize_zone(wp_unslash($_GET['zone'] ?? ''));
            if ($requested_zone) {
                $ad['zone'] = $requested_zone;
                if ($requested_zone === WPA_DEFAULT_ZONE) {
                    $ad['name'] = __('House Ad', 'wp-advertising');
                }
            }
        }
        $settings = $this->repo->get_settings($ad);
        $payload = $this->renderer->resolve_payload($ad, true);
        $embed = !empty($ad['id']) ? $this->renderer->embed_code($ad) : __('Save the ad to generate embed code.', 'wp-advertising');
        ?>
        <div class="wrap wpa-wrap">
            <div class="wpa-hero compact">
                <div>
                    <h1><?php echo $id ? esc_html__('Edit Ad', 'wp-advertising') : esc_html__('Create Ad', 'wp-advertising'); ?></h1>
                    <p><?php esc_html_e('Customize text, theme, colors, and source. The preview updates while you type.', 'wp-advertising'); ?></p>
                    <?php $this->render_build_meta(); ?>
                </div>
                <a class="button" href="<?php echo esc_url(add_query_arg(['page' => 'wp-advertising'], admin_url('admin.php'))); ?>"><?php esc_html_e('Back to Performance', 'wp-advertising'); ?></a>
            </div>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="wpa-builder-form">
                <?php wp_nonce_field(WPA_NONCE_ACTION); ?>
                <input type="hidden" name="action" value="wp_advertising_save_ad">
                <input type="hidden" name="id" value="<?php echo esc_attr((int) ($ad['id'] ?? 0)); ?>">

                <div class="wpa-builder-grid">
                    <section class="wpa-panel">
                        <div class="wpa-panel-header">
                            <div>
                                <h2><?php esc_html_e('Ad Settings', 'wp-advertising'); ?></h2>
                                <p><?php esc_html_e('Random WooCommerce products can be used without exposing product IDs in the form.', 'wp-advertising'); ?></p>
                            </div>
                        </div>

                        <div class="wpa-form-grid">
                            <?php $this->field_text('name', __('Internal Name', 'wp-advertising'), $ad['name'], true); ?>
                            <?php $this->field_text('zone', __('Zone', 'wp-advertising'), $ad['zone'] ?: WPA_DEFAULT_ZONE, true); ?>
                            <?php $this->field_text('label', __('Small Label', 'wp-advertising'), $ad['label'], false, 'label'); ?>
                            <?php $this->field_text('headline', __('Headline', 'wp-advertising'), $ad['headline'], false, 'headline'); ?>
                            <?php $this->field_textarea('body', __('Body Text', 'wp-advertising'), $ad['body'], 'body'); ?>
                            <?php $this->field_text('cta', __('Button Text', 'wp-advertising'), $ad['cta'], false, 'cta'); ?>
                            <?php $this->field_text('image_url', __('Custom Image URL', 'wp-advertising'), $ad['image_url'], false, 'image'); ?>
                            <?php $this->field_text('target_url', __('Custom Target URL', 'wp-advertising'), $ad['target_url']); ?>
                        </div>

                        <div class="wpa-field-row">
                            <label class="wpa-field"><span><?php esc_html_e('Ad Source', 'wp-advertising'); ?></span>
                                <select name="source_type" id="wpa-source-type">
                                    <option value="custom" <?php selected($ad['source_type'], 'custom'); ?>><?php esc_html_e('Custom Ad', 'wp-advertising'); ?></option>
                                    <option value="woocommerce" <?php selected($ad['source_type'], 'woocommerce'); ?>><?php esc_html_e('WooCommerce Product', 'wp-advertising'); ?></option>
                                </select>
                            </label>
                            <label class="wpa-field wpa-product-mode-field"><span><?php esc_html_e('Product Mode', 'wp-advertising'); ?></span>
                                <select name="product_mode" id="wpa-product-mode">
                                    <option value="random" <?php selected($ad['product_mode'], 'random'); ?>><?php esc_html_e('Random product', 'wp-advertising'); ?></option>
                                    <option value="specific" <?php selected($ad['product_mode'], 'specific'); ?>><?php esc_html_e('Specific product', 'wp-advertising'); ?></option>
                                </select>
                            </label>
                            <label class="wpa-field wpa-product-id-field"><span><?php esc_html_e('Specific Product', 'wp-advertising'); ?></span>
                                <input type="search" class="wpa-product-search" placeholder="<?php esc_attr_e('Search products by name...', 'wp-advertising'); ?>" autocomplete="off">
                                <input type="hidden" name="product_id" value="<?php echo esc_attr((int) $ad['product_id']); ?>">
                                <small class="wpa-selected-product"><?php echo $ad['product_id'] ? esc_html(sprintf(__('Selected product ID: %d', 'wp-advertising'), (int) $ad['product_id'])) : esc_html__('No product selected.', 'wp-advertising'); ?></small>
                                <div class="wpa-product-results" hidden></div>
                            </label>
                        </div>

                        <div class="wpa-theme-picker" role="radiogroup" aria-label="<?php esc_attr_e('Theme picker', 'wp-advertising'); ?>">
                            <h3><?php esc_html_e('Theme', 'wp-advertising'); ?></h3>
                            <?php foreach (WPA_Renderer::themes() as $theme_key => $theme_label) : ?>
                                <label class="wpa-theme-option wpa-theme-swatch-<?php echo esc_attr($theme_key); ?>">
                                    <input type="radio" name="theme" value="<?php echo esc_attr($theme_key); ?>" <?php checked($this->repo->allowed_theme($settings['theme'] ?? 'dark'), $theme_key); ?> data-theme-picker>
                                    <span><?php echo esc_html($theme_label); ?></span>
                                </label>
                            <?php endforeach; ?>
                        </div>

                        <div class="wpa-field-row">
                            <label class="wpa-field"><span><?php esc_html_e('Status', 'wp-advertising'); ?></span>
                                <select name="status">
                                    <option value="active" <?php selected($ad['status'], 'active'); ?>><?php esc_html_e('Active', 'wp-advertising'); ?></option>
                                    <option value="paused" <?php selected($ad['status'], 'paused'); ?>><?php esc_html_e('Paused', 'wp-advertising'); ?></option>
                                </select>
                            </label>
                            <label class="wpa-field"><span><?php esc_html_e('Weight', 'wp-advertising'); ?></span>
                                <input type="number" name="weight" min="1" max="100" value="<?php echo esc_attr((int) $ad['weight']); ?>">
                            </label>
                            <?php $this->field_text('campaign', __('UTM Campaign', 'wp-advertising'), $ad['campaign']); ?>
                        </div>

                        <div class="wpa-checks">
                            <label><input type="checkbox" name="open_new_tab" value="1" <?php checked(!empty($ad['open_new_tab'])); ?>> <?php esc_html_e('Open in new tab', 'wp-advertising'); ?></label>
                            <label><input type="checkbox" name="nofollow" value="1" <?php checked(!empty($ad['nofollow'])); ?>> <?php esc_html_e('Use nofollow sponsored link rel', 'wp-advertising'); ?></label>
                        </div>

                        <div class="wpa-actions">
                            <button type="submit" class="button button-primary button-hero"><?php esc_html_e('Save Ad', 'wp-advertising'); ?></button>
                            <a class="button button-hero" href="<?php echo esc_url(add_query_arg(['page' => 'wp-advertising'], admin_url('admin.php'))); ?>"><?php esc_html_e('Cancel', 'wp-advertising'); ?></a>
                        </div>
                    </section>

                    <aside class="wpa-panel wpa-live-panel">
                        <h2><?php esc_html_e('Live Preview', 'wp-advertising'); ?></h2>
                        <p><?php esc_html_e('Text and theme changes update here in real time.', 'wp-advertising'); ?></p>
                        <div class="wpa-preview-stage" id="wpa-preview-stage" data-ad-id="<?php echo esc_attr((int) ($ad['id'] ?? 0)); ?>">
                            <?php echo $this->renderer->card_html($payload, true); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                        </div>
                        <button type="button" class="button wpa-refresh-random" data-ad-id="<?php echo esc_attr((int) ($ad['id'] ?? 0)); ?>"><?php esc_html_e('Show another random product', 'wp-advertising'); ?></button>
                        <div class="wpa-embed-box">
                            <h3><?php esc_html_e('Embed Code', 'wp-advertising'); ?></h3>
                            <textarea readonly onclick="this.select();"><?php echo esc_textarea($embed); ?></textarea>
                            <?php if (!empty($ad['id'])) : ?><button type="button" class="button wpa-copy" data-copy="<?php echo esc_attr($embed); ?>"><?php esc_html_e('Copy Embed', 'wp-advertising'); ?></button><?php endif; ?>
                        </div>
                    </aside>
                </div>
            </form>
        </div>
        <?php
    }

    public function render_community_shortcode_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $settings = $this->repo->get_community_shortcode_settings();
        $payload = $this->renderer->community_payload(true, $settings);
        $shortcode = $this->renderer->community_shortcode($settings);
        ?>
        <div class="wrap wpa-wrap">
            <div class="wpa-hero compact">
                <div>
                    <h1><?php esc_html_e('Community Ad Shortcode', 'wp-advertising'); ?></h1>
                    <p><?php esc_html_e('Preview the community ad styling and copy a shortcode for WordPress content areas.', 'wp-advertising'); ?></p>
                    <?php $this->render_build_meta(); ?>
                </div>
                <a class="button" href="<?php echo esc_url(add_query_arg(['page' => 'wp-advertising'], admin_url('admin.php'))); ?>"><?php esc_html_e('Back to Performance', 'wp-advertising'); ?></a>
            </div>

            <?php $this->render_notices(); ?>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="wpa-builder-form">
                <?php wp_nonce_field('wp_advertising_save_community_shortcode'); ?>
                <input type="hidden" name="action" value="wp_advertising_save_community_shortcode">
                <div class="wpa-builder-grid">
                    <section class="wpa-panel">
                        <div class="wpa-panel-header">
                            <div>
                                <h2><?php esc_html_e('Shortcode Settings', 'wp-advertising'); ?></h2>
                                <p><?php esc_html_e('These settings style your local shortcode preview. The served creative still comes from the community network.', 'wp-advertising'); ?></p>
                            </div>
                        </div>
                        <div class="wpa-form-grid">
                            <?php $this->field_text('label', __('Small Label', 'wp-advertising'), $settings['label'], false, 'label'); ?>
                            <?php $this->field_text('headline', __('Fallback Headline', 'wp-advertising'), $settings['headline'], false, 'headline'); ?>
                            <?php $this->field_textarea('body', __('Fallback Body Text', 'wp-advertising'), $settings['body'], 'body'); ?>
                            <?php $this->field_text('cta', __('Button Text', 'wp-advertising'), $settings['cta'], false, 'cta'); ?>
                        </div>
                        <div class="wpa-theme-picker" role="radiogroup" aria-label="<?php esc_attr_e('Theme picker', 'wp-advertising'); ?>">
                            <h3><?php esc_html_e('Theme', 'wp-advertising'); ?></h3>
                            <?php foreach (WPA_Renderer::themes() as $theme_key => $theme_label) : ?>
                                <label class="wpa-theme-option wpa-theme-swatch-<?php echo esc_attr($theme_key); ?>">
                                    <input type="radio" name="theme" value="<?php echo esc_attr($theme_key); ?>" <?php checked($this->repo->allowed_theme($settings['theme'] ?? 'dark'), $theme_key); ?> data-theme-picker>
                                    <span><?php echo esc_html($theme_label); ?></span>
                                </label>
                            <?php endforeach; ?>
                        </div>
                        <div class="wpa-actions">
                            <button type="submit" class="button button-primary button-hero"><?php esc_html_e('Save Shortcode Settings', 'wp-advertising'); ?></button>
                            <a class="button button-hero" href="<?php echo esc_url(add_query_arg(['page' => 'wp-advertising'], admin_url('admin.php'))); ?>"><?php esc_html_e('Cancel', 'wp-advertising'); ?></a>
                        </div>
                    </section>

                    <aside class="wpa-panel wpa-live-panel">
                        <h2><?php esc_html_e('Community Ad Preview', 'wp-advertising'); ?></h2>
                        <p><?php esc_html_e('This mirrors the create screen preview layout and uses the selected theme.', 'wp-advertising'); ?></p>
                        <div class="wpa-preview-stage" id="wpa-preview-stage">
                            <?php echo $this->renderer->card_html($payload, true); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                        </div>
                        <div class="wpa-embed-box">
                            <h3><?php esc_html_e('Shortcode', 'wp-advertising'); ?></h3>
                            <textarea readonly onclick="this.select();"><?php echo esc_textarea($shortcode); ?></textarea>
                            <button type="button" class="button wpa-copy" data-copy="<?php echo esc_attr($shortcode); ?>"><?php esc_html_e('Copy Shortcode', 'wp-advertising'); ?></button>
                        </div>
                    </aside>
                </div>
            </form>
        </div>
        <?php
    }

    private function field_text($name, $label, $value, $required = false, $live = '') {
        ?>
        <label class="wpa-field"><span><?php echo esc_html($label); ?></span>
            <input type="text" name="<?php echo esc_attr($name); ?>" value="<?php echo esc_attr($value); ?>" <?php echo $required ? 'required' : ''; ?> <?php echo $live ? 'data-live-field="' . esc_attr($live) . '"' : ''; ?>>
        </label>
        <?php
    }

    private function field_textarea($name, $label, $value, $live = '') {
        ?>
        <label class="wpa-field"><span><?php echo esc_html($label); ?></span>
            <textarea name="<?php echo esc_attr($name); ?>" rows="4" <?php echo $live ? 'data-live-field="' . esc_attr($live) . '"' : ''; ?>><?php echo esc_textarea($value); ?></textarea>
        </label>
        <?php
    }
}
