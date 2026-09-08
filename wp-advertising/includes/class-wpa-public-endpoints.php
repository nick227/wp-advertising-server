<?php
if (!defined('ABSPATH')) {
    exit;
}

final class WPA_Public_Endpoints {
    private $repo;
    private $renderer;

    public function __construct(WPA_Repository $repo, WPA_Renderer $renderer) {
        $this->repo = $repo;
        $this->renderer = $renderer;
    }

    /**
     * Send public CORS headers for JSON responses consumed by external embeds.
     *
     * Kept intentionally narrow so WordPress admin UI, previews, layout assets,
     * and authenticated admin actions are not affected by cross-origin headers.
     */
    private function send_public_cors_headers() {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
        header('Access-Control-Max-Age: 600');
    }

    private function maybe_exit_options_request() {
        if (isset($_SERVER['REQUEST_METHOD']) && strtoupper((string) $_SERVER['REQUEST_METHOD']) === 'OPTIONS') {
            status_header(204);
            exit;
        }
    }

    public function serve_embed_js() {
        header('Content-Type: application/javascript; charset=utf-8');
        header('Cache-Control: public, max-age=300');
        $render_url = esc_url_raw(add_query_arg(['action' => 'wp_advertising_render'], admin_url('admin-post.php')));
        $render_jsonp_url = esc_url_raw(add_query_arg(['action' => 'wp_advertising_render_jsonp'], admin_url('admin-post.php')));
        ?>
(function(){
  var baseUrl = <?php echo wp_json_encode($render_url); ?>;
  var jsonpUrl = <?php echo wp_json_encode($render_jsonp_url); ?>;
  var initialized = false;

  function currentScript(){
    if(document.currentScript) return document.currentScript;
    var scripts=document.getElementsByTagName('script');
    return scripts[scripts.length-1] || null;
  }

  function appendScript(script){
    (document.head || document.body || document.documentElement).appendChild(script);
  }

  function injectStyles(){
    if(document.getElementById('wpa-embed-styles')) return;
    var css='.wpa-card{--wpa-bg:#111827;--wpa-fg:#fff;--wpa-muted:#c7cedb;--wpa-soft:#202938;--wpa-btn-bg:#fff;--wpa-btn-fg:#111827;--wpa-border:rgba(255,255,255,.12);--wpa-shadow:0 18px 45px rgba(0,0,0,.24);box-sizing:border-box;display:block;width:100%;max-width:380px;padding:18px;border-radius:24px;background:var(--wpa-bg);color:var(--wpa-fg);text-decoration:none;font-family:Inter,Arial,sans-serif;border:1px solid var(--wpa-border);box-shadow:var(--wpa-shadow);overflow:hidden}.wpa-card *{box-sizing:border-box}.wpa-theme-light{--wpa-bg:#fff;--wpa-fg:#111827;--wpa-muted:#5b6472;--wpa-soft:#f1f5f9;--wpa-btn-bg:#111827;--wpa-btn-fg:#fff;--wpa-border:#e5e7eb;--wpa-shadow:0 18px 35px rgba(15,23,42,.12)}.wpa-theme-warm{--wpa-bg:#fff7ed;--wpa-fg:#321a07;--wpa-muted:#7c4a22;--wpa-soft:#fed7aa;--wpa-btn-bg:#ea580c;--wpa-btn-fg:#fff;--wpa-border:#fdba74;--wpa-shadow:0 18px 35px rgba(234,88,12,.18)}.wpa-theme-neon{--wpa-bg:#09090b;--wpa-fg:#f5f3ff;--wpa-muted:#c4b5fd;--wpa-soft:#18181b;--wpa-btn-bg:#a3e635;--wpa-btn-fg:#101010;--wpa-border:rgba(163,230,53,.34);--wpa-shadow:0 18px 45px rgba(163,230,53,.16)}.wpa-theme-minimal{--wpa-bg:#f8fafc;--wpa-fg:#0f172a;--wpa-muted:#64748b;--wpa-soft:#e2e8f0;--wpa-btn-bg:#0f172a;--wpa-btn-fg:#f8fafc;--wpa-border:#cbd5e1;--wpa-shadow:none;border-radius:12px}.wpa-kicker{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--wpa-muted);margin-bottom:12px;font-weight:800}.wpa-image-wrap{display:block;aspect-ratio:1/1;width:100%;border-radius:18px;overflow:hidden;background:var(--wpa-soft);margin-bottom:14px}.wpa-image-wrap img{display:block;width:100%;height:100%;object-fit:cover}.wpa-image-placeholder{display:flex;align-items:center;justify-content:center;color:var(--wpa-muted);font-weight:800}.wpa-title{display:block;font-size:19px;line-height:1.12;font-weight:900;margin-bottom:8px;color:var(--wpa-fg)}.wpa-body{display:block;color:var(--wpa-muted);font-size:13px;line-height:1.45;margin-bottom:12px}.wpa-price{display:block;color:var(--wpa-fg);font-size:15px;font-weight:800;margin-bottom:14px}.wpa-cta{display:inline-flex;align-items:center;border-radius:999px;background:var(--wpa-btn-bg);color:var(--wpa-btn-fg);padding:9px 14px;font-size:13px;font-weight:900}.wpa-footer{display:block}';
    var style=document.createElement('style');
    style.id='wpa-embed-styles';
    style.textContent=css;
    (document.head || document.documentElement).appendChild(style);
  }

  function warn(el,msg){
    if(el) el.setAttribute('data-wpa-error', msg);
    if(window.console && console.warn) console.warn('WP Advertising embed: '+msg);
  }

  function isLocalPreview(value){
    return /^file:/i.test(String(value||''));
  }

  function safeReferrer(){
    var ref=document.referrer||location.href||'';
    return isLocalPreview(ref) ? '' : ref;
  }

  function trackingRequested(el){
    var value=String((el && (el.getAttribute('data-wpa-track') || el.getAttribute('data-track'))) || '').toLowerCase();
    if(value==='0' || value==='false' || value==='off' || value==='no') return false;
    return true;
  }

  function prepareInjectedImages(el){
    if(!el) return;
    var imgs=[].slice.call(el.querySelectorAll('img'));
    imgs.forEach(function(img){
      img.setAttribute('decoding','async');
      if(!img.getAttribute('loading')) img.setAttribute('loading','lazy');
      img.onerror=function(){
        var wrap=img.parentNode;
        if(wrap){
          wrap.className += ' wpa-image-placeholder';
          wrap.textContent='Ad image';
        }
      };
    });
  }

  function insertAd(el,data,ref){
    if(!el) return;
    el.removeAttribute('data-wpa-loading');
    if(!data || !data.html){ warn(el, data && data.error ? data.error : 'empty_response'); return; }
    el.innerHTML=data.html;
    prepareInjectedImages(el);
    el.setAttribute('data-wpa-loaded','1');
    el.removeAttribute('data-wpa-error');
    if(data.target_url){ el.setAttribute('data-wpa-target-url', data.target_url); }
    if(data.impression_url && trackingRequested(el) && ref){
      var img=new Image();
      img.src=data.impression_url+'&referrer='+encodeURIComponent(ref)+'&r='+(Math.random());
    }
  }

  function renderWithJsonp(el,zone,adId,ref,track){
    var cb='__wpaEmbed'+Date.now()+Math.floor(Math.random()*100000);
    var script=document.createElement('script');
    var done=false;
    var timer=window.setTimeout(function(){
      if(done) return;
      done=true;
      try{ delete window[cb]; }catch(e){ window[cb]=undefined; }
      if(script.parentNode){ script.parentNode.removeChild(script); }
      if(el){ el.removeAttribute('data-wpa-loading'); }
      warn(el,'jsonp_timeout');
    }, 8000);

    window[cb]=function(data){
      if(done) return;
      done=true;
      window.clearTimeout(timer);
      insertAd(el,data,ref);
      try{ delete window[cb]; }catch(e){ window[cb]=undefined; }
      if(script.parentNode){ script.parentNode.removeChild(script); }
    };
    script.async=true;
    script.onerror=function(){
      if(done) return;
      done=true;
      window.clearTimeout(timer);
      try{ delete window[cb]; }catch(e){ window[cb]=undefined; }
      if(el){ el.removeAttribute('data-wpa-loading'); }
      warn(el,'jsonp_load_failed');
    };
    script.src=jsonpUrl+'&zone='+encodeURIComponent(zone)+'&ad_id='+encodeURIComponent(adId)+'&track='+encodeURIComponent(track ? '1' : '0')+'&referrer='+encodeURIComponent(ref)+'&callback='+encodeURIComponent(cb)+'&r='+(Math.random());
    appendScript(script);
  }

  function render(el){
    if(!el || el.getAttribute('data-wpa-loaded')==='1' || el.getAttribute('data-wpa-loading')==='1') return;
    var zone=el.getAttribute('data-zone')||'house-ad';
    var adId=el.getAttribute('data-ad-id')||'';
    var ref=safeReferrer();
    var track=trackingRequested(el) && !!ref;
    el.setAttribute('data-wpa-loading','1');

    // JSONP is the primary path because it works reliably from static HTML,
    // file:// previews, builders, and third-party sites without CORS edge cases.
    renderWithJsonp(el,zone,adId,ref,track);
  }

  function renderAll(){
    injectStyles();
    var nodes=[].slice.call(document.querySelectorAll('.wp-advertising-zone'));
    nodes.forEach(render);
  }

  function init(){
    if(initialized) return;
    initialized=true;
    renderAll();

    if(window.MutationObserver && document.body){
      var observer=new MutationObserver(function(mutations){
        var shouldRender=false;
        mutations.forEach(function(mutation){
          [].slice.call(mutation.addedNodes || []).forEach(function(node){
            if(node.nodeType!==1) return;
            if((node.matches && node.matches('.wp-advertising-zone')) || (node.querySelector && node.querySelector('.wp-advertising-zone'))){
              shouldRender=true;
            }
          });
        });
        if(shouldRender) renderAll();
      });
      observer.observe(document.body,{childList:true,subtree:true});
    }
  }

  // Try immediately for normal pasted snippets, then again when the DOM is complete
  // for builders/CMS pages that move or inject the placeholder late.
  renderAll();
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.setTimeout(renderAll, 250);
  window.setTimeout(renderAll, 1000);
})();
        <?php
        exit;
    }

    private function build_render_response() {
        $ad_id = absint($_GET['ad_id'] ?? 0);
        $zone = $this->repo->sanitize_zone(wp_unslash($_GET['zone'] ?? WPA_DEFAULT_ZONE));
        $track_param = isset($_GET['track']) ? strtolower((string) wp_unslash($_GET['track'])) : '1';
        $embed_tracking_allowed = !in_array($track_param, ['0', 'false', 'off', 'no'], true);
        $tracking_enabled = $this->repo->tracking_enabled() && $embed_tracking_allowed;

        // Strict zone isolation: community-ad never falls back to house, house-ad never pulls community.
        if ($zone === WPA_COMMUNITY_ZONE) {
            $payload = $this->renderer->community_payload(false, [], $tracking_enabled);
            if (empty($payload)) {
                return ['html' => '', 'error' => 'no_ad', 'tracking_enabled' => $tracking_enabled, 'zone' => $zone];
            }
        } else {
            $ad = $this->repo->pick_ad($ad_id, $zone);
            if (!$ad) {
                return ['html' => '', 'error' => 'no_ad', 'tracking_enabled' => $tracking_enabled, 'zone' => $zone];
            }
            $payload = $this->renderer->resolve_payload($ad, false);
        }

        return [
            'html' => $this->renderer->card_html($payload, false, $tracking_enabled),
            'impression_url' => $tracking_enabled ? $this->renderer->impression_url($payload) : '',
            'target_url' => esc_url_raw($payload['target_url'] ?? ''),
            'tracking_enabled' => $tracking_enabled,
            'ad_id' => $payload['ad_id'],
            'product_id' => $payload['product_id'],
            'zone' => $payload['zone'],
        ];
    }

    public function serve_render() {
        $this->send_public_cors_headers();
        $this->maybe_exit_options_request();
        wp_send_json($this->build_render_response());
    }

    public function serve_render_jsonp() {
        $callback = preg_replace('/[^A-Za-z0-9_.$]/', '', (string) wp_unslash($_GET['callback'] ?? ''));
        if (!$callback) {
            $callback = 'wpAdvertisingEmbed';
        }
        header('Content-Type: application/javascript; charset=utf-8');
        header('Cache-Control: no-store, max-age=0');
        echo $callback . '(' . wp_json_encode($this->build_render_response()) . ');';
        exit;
    }

    public function track_impression() {
        $this->send_public_cors_headers();
        $this->maybe_exit_options_request();

        if (!$this->repo->tracking_enabled()) {
            nocache_headers();
            header('Content-Type: image/gif');
            echo base64_decode('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==');
            exit;
        }

        $token = $this->repo->validate_event_token(wp_unslash($_GET['token'] ?? ''), 'impression');
        if (!is_wp_error($token)) {
            $this->repo->log_event('impression', $token['ad_id'], $token['product_id'], $token['zone']);
        }
        nocache_headers();
        header('Content-Type: image/gif');
        echo base64_decode('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==');
        exit;
    }

    public function track_click_redirect() {
        $token = $this->repo->validate_event_token(wp_unslash($_GET['token'] ?? ''), 'click');
        if (is_wp_error($token)) {
            wp_safe_redirect(home_url('/'), 302);
            exit;
        }

        $target = $this->repo->destination_from_click_token($token);
        if ($this->repo->tracking_enabled()) {
            $this->repo->log_event('click', $token['ad_id'], $token['product_id'], $token['zone'], $target);
        }
        $this->repo->redirect_click($target);
    }

    public function shortcode_community_ad($atts = []) {
        $atts = shortcode_atts([
            'theme' => '',
            'label' => '',
            'headline' => '',
            'body' => '',
            'cta' => '',
        ], $atts, 'wp_advertising_community_ad');
        $settings = array_filter([
            'theme' => $atts['theme'] ? $this->repo->allowed_theme($atts['theme']) : '',
            'label' => sanitize_text_field($atts['label']),
            'headline' => sanitize_text_field($atts['headline']),
            'body' => wp_kses_post($atts['body']),
            'cta' => sanitize_text_field($atts['cta']),
        ]);
        $payload = $this->renderer->community_payload(false, $settings, $this->repo->tracking_enabled());
        if (!$payload) {
            return '';
        }
        $html = '<div class="wp-advertising-shortcode-ad">' . $this->renderer->card_html($payload, false, $this->repo->tracking_enabled()) . '</div>';
        $impression_url = $this->renderer->impression_url($payload);
        if ($impression_url) {
            $html .= '<img alt="" width="1" height="1" style="position:absolute;left:-9999px;width:1px;height:1px;" src="' . esc_url($impression_url) . '" />';
        }
        return $html;
    }

    public function ajax_preview_random() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'permission_denied'], 403);
        }
        check_ajax_referer('wp_advertising_preview_random', 'nonce');

        $ad_id = absint($_POST['ad_id'] ?? 0);
        $ad = $ad_id ? $this->repo->get_ad($ad_id) : $this->repo->default_ad();
        if (!$ad) {
            wp_send_json_error(['message' => 'missing_ad'], 404);
        }

        $posted = wp_unslash($_POST);
        foreach (['label', 'headline', 'body', 'cta', 'image_url', 'theme'] as $key) {
            if (!isset($posted[$key])) {
                continue;
            }
            if ($key === 'theme') {
                $ad['settings_json'] = wp_json_encode(['layout' => 'card', 'theme' => $this->repo->allowed_theme($posted[$key])]);
            } elseif ($key === 'body') {
                $ad[$key] = wp_kses_post($posted[$key]);
            } elseif ($key === 'image_url') {
                $ad[$key] = esc_url_raw($posted[$key]);
            } else {
                $ad[$key] = sanitize_text_field($posted[$key]);
            }
        }
        $ad['source_type'] = 'woocommerce';
        $ad['product_mode'] = 'random';
        $payload = $this->renderer->resolve_payload($ad, true);
        wp_send_json_success(['html' => $this->renderer->card_html($payload, true)]);
    }

    public function ajax_search_products() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'permission_denied'], 403);
        }
        check_ajax_referer('wp_advertising_product_search', 'nonce');
        $term = sanitize_text_field(wp_unslash($_GET['term'] ?? $_POST['term'] ?? ''));
        wp_send_json_success(['results' => $this->repo->search_products($term, 10)]);
    }
}
