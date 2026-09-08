=== WP Advertising ===
Contributors: wp-advertising
Tags: advertising, woocommerce, ads, shortcode, community ads, tracking
Requires at least: 6.2
Requires PHP: 7.4
Stable tag: 8.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Create embeddable house ads, rotate WooCommerce products, opt into community ads, customize ad themes, preview ads live, and optionally track performance by ad, origin, product, and zone.

== Description ==

WP Advertising lets site owners create trackable product and custom ads, copy external embed code, view performance, and optionally include a built-in Community Ad in the same rotation as their running ads.

V8 keeps the UI intentionally small and adds the missing Community API compatibility layer:

* One opt-in/out toggle on the Performance screen.
* Community Ad appears as its own performance row.
* Community clicks, CTR, top origin, and CSV click history are tracked.
* The main screen displays the Community shortcode directly with Copy and Edit actions.
* The Community Shortcode edit view previews the ad and lets the user adjust shortcode settings.
* Community API URL can be stored from the main screen.
* When enabled, the plugin registers this site with the Community API, syncs opt-in/out, and upserts the current House Ad creative.
* Community serve calls use /community/serve with siteUrl and tracking=0/1, matching the Node/Prisma/OpenAPI microservice.
* 204/empty/error responses skip the community slot instead of rendering fake placeholder ads.
* Remote clickUrl/impressionUrl values are ignored; community clicks use the advertiser targetUrl.
* Network impressions are counted on successful /community/serve (no browser→server tracking pixels).
* If no Community API URL is configured, the plugin stays local-only.
* External embeds use the v6.2 JSONP loader fix with a long-lived loader cache.
* Tracking can be fully disabled from the Performance screen.
* When tracking is disabled, embeds skip the impression pixel and link directly to the exact ad/product destination that was rendered.

== Installation ==

1. Upload the plugin zip through Plugins > Add New > Upload Plugin.
2. Activate WP Advertising.
3. Open WP Advertising in the WordPress admin.
4. Create ads or copy the House Ad embed code.
5. Toggle Community Ad participation on or off from the Performance screen.

== Shortcodes ==

Community ad:

[wp_advertising_community_ad]

The admin Community Shortcode screen can generate a shortcode with theme, label, headline, and CTA attributes.

== Changelog ==

= 8.2.0 =
* Added 30-day Trial entitlement for Community / external network features.
* Community serve and opt-in require cached Trial/Pro eligibility (no front-end license HTTP).
* Plugin stops community-server calls when entitlement is inactive or expired.

= 8.1.2 =
* Community creatives never embed community-server click/impression URLs in HTML.
* Community card clicks use the advertiser destination directly.
* Community network impressions are counted on /community/serve (server-side).

= 8.0.0 =
* Added Community API registration against POST /sites/register.
* Added opt-in/out sync against POST /sites/opt-in and POST /sites/opt-out.
* Added current House Ad creative sync against POST /sites/ad.
* Changed remote serve calls to GET /community/serve?siteUrl=...&tracking=0|1.
* Treats HTTP 204, API errors, and empty payloads as no community ad instead of rendering placeholder content.
* Prevents double click redirect wrapping when the microservice returns clickUrl.
* Uses network impressionUrl when provided by the microservice.
* Stores siteId/publicKey/secret returned by the Community API.
* Restored suppression of unrelated third-party WordPress optimization notices on WP Advertising pages.

= 7.6.0 =
* Added Community API URL setting for the planned microservice.
* Added canonical repository helpers for the Community API base URL and /community/serve endpoint.
* Community ad payload requests now use the configured API URL only; blank URL means local-only/no remote timeout.
* Reduced community API request timeout to keep shortcode rendering fast.
* Supports both camelCase and snake_case payload keys from the future service.

= 7.5.4 =
* Reworked the Performance screen controls into clean vertical setting cards.
* Replaced separate Community and Tracking update buttons with one Save Settings action.
* Renamed the Community opt-in label to “Add my site to Community”.
* Displayed the Community shortcode directly on the main screen with Copy and Edit actions.
* Replaced Get Shortcode wording with Edit where the shortcode already exists.

= 7.1.0 =
* Hardened external embeds for local/static previews: file:// pages no longer attempt impression pixels.
* Added per-embed tracking override via data-wpa-track="0".
* Added image error fallback for externally rendered product images.

= 7.0.0 =
* Added global Track impressions and clicks toggle.
* Disabled tracking removes impression pixel loading and click redirect logging.
* Disabled tracking makes external ads link directly to the exact rendered destination URL.
* Increased external loader cache lifetime while keeping ad render responses uncached for rotation accuracy.
* Preserved v6.2 external JSONP loader reliability fixes.

= 6.0.0 =
* Added opt-in Community Ad rotation.
* Added Community Ad row to the performance table.
* Added Community Ad origin/click CSV access through the existing click report export.
* Added Community Shortcode admin view using the existing two-column preview/copy layout.
* Added community ad shortcode rendering.
* Preserved V5.5.2 CORS fix and analytics reporting.

= 5.5.2 =
* Emergency stable CORS fix based on V5.5.
