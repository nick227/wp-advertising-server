<?php
if (!defined('ABSPATH')) {
    exit;
}

final class WPA_Renderer {
    private $repo;

    public function __construct(WPA_Repository $repo) {
        $this->repo = $repo;
    }

    public static function themes() {
        return [
            'dark' => __('Dark Merch', 'wp-advertising'),
            'light' => __('Clean Light', 'wp-advertising'),
            'warm' => __('Warm Retail', 'wp-advertising'),
            'neon' => __('Neon Music', 'wp-advertising'),
            'minimal' => __('Minimal Editorial', 'wp-advertising'),
        ];
    }

    public function source_label($ad) {
        if (($ad['source_type'] ?? '') === 'community') {
            return __('Community Ad', 'wp-advertising');
        }
        if (($ad['source_type'] ?? '') === 'woocommerce') {
            return (($ad['product_mode'] ?? '') === 'random') ? __('Random WooCommerce Product', 'wp-advertising') : __('WooCommerce Product', 'wp-advertising');
        }
        return __('Custom Ad', 'wp-advertising');
    }

    public function resolve_payload($ad, $preview = false) {
        $settings = $this->repo->get_settings($ad);
        $product_payload = null;

        if (($ad['source_type'] ?? '') === 'woocommerce') {
            $product_payload = $this->repo->get_product_payload((int) ($ad['product_id'] ?? 0), ($ad['product_mode'] ?? '') === 'random');
        }

        $headline = $ad['headline'] ?: ($product_payload['title'] ?? ($ad['name'] ?: __('Featured Offer', 'wp-advertising')));
        $body = $ad['body'] ?: ($product_payload['body'] ?? __('Featured offer from our shop.', 'wp-advertising'));
        $image_url = $product_payload['image_url'] ?? $ad['image_url'];
        $target_url = $product_payload['target_url'] ?? $ad['target_url'];
        $product_id = $product_payload['product_id'] ?? 0;
        $campaign = $ad['campaign'] ?: 'wp_advertising';

        if ($target_url) {
            $target_url = add_query_arg([
                'utm_source' => $ad['zone'] ?: WPA_DEFAULT_ZONE,
                'utm_medium' => 'embed_ad',
                'utm_campaign' => $campaign,
            ], $target_url);
        }
        if ($target_url && !$this->repo->is_publicly_routable_url($target_url)) {
            $target_url = '';
        }

        return apply_filters('wp_advertising_resolved_payload', [
            'ad_id' => (int) ($ad['id'] ?? 0),
            'product_id' => (int) $product_id,
            'zone' => $ad['zone'] ?: WPA_DEFAULT_ZONE,
            'label' => $ad['label'] ?: 'Sponsored Drop',
            'headline' => $headline,
            'body' => wp_strip_all_tags($body),
            'image_url' => $image_url,
            'target_url' => $target_url,
            'cta' => $ad['cta'] ?: 'Shop now',
            'price_html' => $product_payload['price_html'] ?? '',
            'open_new_tab' => !empty($ad['open_new_tab']),
            'nofollow' => !empty($ad['nofollow']),
            'source_type' => $ad['source_type'] ?? 'custom',
            'product_mode' => $ad['product_mode'] ?? 'specific',
            'theme' => $this->repo->allowed_theme($settings['theme'] ?? 'dark'),
            'preview' => $preview,
        ], $ad, $preview);
    }

    public function embed_code($ad_or_zone) {
        $src = add_query_arg([
            'action' => 'wp_advertising_embed_js',
            'ver' => WPA_VERSION,
        ], admin_url('admin-post.php'));
        $track_attr = $this->repo->tracking_enabled() ? '1' : '0';
        if (is_array($ad_or_zone)) {
            return '<div class="wp-advertising-zone" data-zone="' . esc_attr($ad_or_zone['zone']) . '" data-ad-id="' . esc_attr((int) $ad_or_zone['id']) . '" data-wpa-track="' . esc_attr($track_attr) . '"></div><script async src="' . esc_url($src) . '"></script>';
        }
        return '<div class="wp-advertising-zone" data-zone="' . esc_attr($this->repo->sanitize_zone($ad_or_zone)) . '" data-wpa-track="' . esc_attr($track_attr) . '"></div><script async src="' . esc_url($src) . '"></script>';
    }

    public function click_url($payload) {
        return add_query_arg([
            'action' => 'wp_advertising_click',
            'token' => rawurlencode($this->repo->make_event_token('click', $payload)),
        ], admin_url('admin-post.php'));
    }

    public function impression_url($payload) {
        // Community creatives must never point browsers at the community server.
        if (($payload['source_type'] ?? '') === 'community') {
            return '';
        }
        if (!$this->repo->tracking_enabled()) {
            return '';
        }
        return add_query_arg([
            'action' => 'wp_advertising_impression',
            'token' => rawurlencode($this->repo->make_event_token('impression', $payload)),
        ], admin_url('admin-post.php'));
    }

    public function community_payload($preview = false, $settings = [], $track = null) {
        $payload = $this->repo->get_community_payload(WPA_COMMUNITY_ZONE, $settings, $preview, $track);
        if (!$payload) {
            return null;
        }
        $payload['preview'] = (bool) $preview;
        return $payload;
    }

    public function community_shortcode($settings = []) {
        return $this->repo->community_shortcode($settings);
    }

    public function house_payload() {
        $ad = $this->repo->pick_ad(0, WPA_DEFAULT_ZONE);
        if (!$ad) {
            $ad = $this->repo->ensure_default_house_ad();
        }
        if (!$ad || ($ad['status'] ?? '') !== 'active') {
            return null;
        }
        return $this->resolve_payload($ad, true);
    }

    public function card_html($payload, $admin_preview = false, $track = null) {
        if (null === $track) {
            $track = $this->repo->tracking_enabled();
        }
        $target = '#';
        if (!empty($payload['target_url'])) {
            if (($payload['source_type'] ?? '') === 'community') {
                $target = $payload['target_url'];
            } elseif ($track && !$admin_preview && empty($payload['skip_local_click_tracking'])) {
                $target = $this->click_url($payload);
            } else {
                $target = $payload['target_url'];
            }
        }
        $rel = ['noopener'];
        if ($payload['nofollow']) {
            $rel[] = 'nofollow';
            $rel[] = 'sponsored';
        }
        $target_attr = $payload['open_new_tab'] ? ' target="_blank"' : '';
        $classes = 'wpa-card wpa-theme-' . $this->repo->allowed_theme($payload['theme'] ?? 'dark') . ($admin_preview ? ' wpa-admin-preview-card' : '');

        ob_start();
        ?>
        <a class="<?php echo esc_attr($classes); ?>" href="<?php echo esc_url($admin_preview ? ($payload['target_url'] ?: '#') : $target); ?>"<?php echo $admin_preview ? '' : $target_attr; ?> rel="<?php echo esc_attr(implode(' ', array_unique($rel))); ?>" data-wpa-ad-id="<?php echo esc_attr($payload['ad_id']); ?>" data-wpa-product-id="<?php echo esc_attr($payload['product_id']); ?>" data-wpa-zone="<?php echo esc_attr($payload['zone']); ?>">
            <span class="wpa-kicker" data-preview-field="label"><?php echo esc_html($payload['label']); ?></span>
            <?php if (!empty($payload['image_url'])) : ?>
                <span class="wpa-image-wrap"><img data-preview-field="image" src="<?php echo esc_url($payload['image_url']); ?>" alt="<?php echo esc_attr($payload['headline']); ?>" loading="lazy" decoding="async"></span>
            <?php else : ?>
                <span class="wpa-image-wrap wpa-image-placeholder" data-preview-field="image"><?php esc_html_e('Ad image', 'wp-advertising'); ?></span>
            <?php endif; ?>
            <span class="wpa-title" data-preview-field="headline"><?php echo esc_html($payload['headline']); ?></span>
            <span class="wpa-body" data-preview-field="body"><?php echo esc_html(wp_trim_words($payload['body'], 16)); ?></span>
            <?php if (!empty($payload['price_html'])) : ?>
                <span class="wpa-price"><?php echo wp_kses_post($payload['price_html']); ?></span>
            <?php endif; ?>
            <span class="wpa-footer"><span class="wpa-cta" data-preview-field="cta"><?php echo esc_html($payload['cta']); ?> <span aria-hidden="true">→</span></span></span>
        </a>
        <?php
        return trim(ob_get_clean());
    }
}
