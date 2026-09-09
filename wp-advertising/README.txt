=== WP Advertising ===
Contributors: wp-advertising
Tags: advertising, ads, woocommerce, shortcode, community ads
Requires at least: 6.2
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 8.3.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Create local house ads and WooCommerce product ads. Optionally join a community ad network.

== Description ==

WP Advertising lets you create and display ads on your WordPress site without any external service. You can:

* Create custom image ads or automatically rotate WooCommerce products.
* Display ads with a shortcode, embed code, or directly in templates.
* Copy embed code for ads displayed on other sites via a JSONP loader.
* Choose from five card themes: Dark, Light, Warm, Neon, and Minimal.
* Track impressions and clicks locally, entirely within your WordPress database.
* Export click data as a CSV from the Performance screen.
* Preview ads live while editing.

**Free local mode requires no account, no external server, and no payment.**

= Community Ad Network (optional, requires account) =

The Community Ad Network is an optional paid feature. When enabled, your site exchanges ad space with other participating sites on the WP Advertising network.

* Opt in or out at any time from the Performance screen.
* Your site's house ad is shared with the network; ads from other sites appear in a dedicated shortcode slot.
* Community ad display requires an active Trial or Pro subscription.
* A 30-day free trial is available directly from the plugin.
* All community network traffic goes through the WP Advertising service. See the External Services section below.
* Disabling community participation or cancelling a subscription has no effect on your local house ads.

= Tracking =

Impression and click tracking is enabled by default but can be turned off at any time from the Performance screen. All tracking data is stored locally in your WordPress database. No tracking data is sent to any external server. Community ad impressions are counted server-side by the WP Advertising service when a community creative is served.

== Installation ==

1. Upload the plugin ZIP through **Plugins > Add New > Upload Plugin**.
2. Activate WP Advertising.
3. Go to **WP Advertising** in the admin menu.
4. Create an ad, or copy the embed code for external display.
5. To join the Community Ad Network, enter your WP Advertising API URL on the main screen and toggle opt-in from the Performance screen.

== Frequently Asked Questions ==

= Does this plugin work without an external server? =

Yes. Local ads (custom image ads and WooCommerce product ads) work entirely without any external connection. The Community Ad Network is the only feature that communicates with an external service, and it requires explicit opt-in.

= Does tracking require the Community server? =

No. Impression and click tracking is recorded locally in your WordPress database. The external service is not involved in local tracking.

= What happens if my community subscription expires? =

Community ad slots stop displaying. Your local house ads and all local tracking are unaffected.

= Can I disable tracking entirely? =

Yes. Toggle "Track impressions and clicks" off on the Performance screen. Tracking pixels are not loaded and clicks go directly to their destination URL.

= Where is my tracking data stored? =

In two custom database tables created in your WordPress database: `wp_advertising_ads` and `wp_advertising_events`. No data is sent to any external server.

= Does the plugin collect any data automatically without my knowledge? =

No. The Community registration, heartbeat, and entitlement validation only occur after you configure an API URL on the main settings screen. If no API URL is entered, the plugin operates fully locally and makes no external requests.

== External Services ==

When you configure a WP Advertising API URL, the plugin communicates with the WP Advertising service for the following purposes:

**Community registration** — When you first save an API URL or enable Community participation, the plugin sends your site URL, site name, plugin version, and admin email address to register your site. This is required to obtain the credentials used for all subsequent authenticated requests.

**Entitlement validation** — Once per day on admin page loads, the plugin sends your site ID and API key to verify your subscription status. This controls whether community ad display is permitted.

**Authenticated heartbeat** — For sites with community credentials, every 4 hours on admin page loads, the plugin sends your site ID and API key. The response includes the current latest plugin version, which is used to display an update notice.

**Public release check** — For sites that have configured an API URL but have not yet registered, once per 24 hours on admin page loads, the plugin sends a request with no site identity (only the plugin version in the User-Agent header) to check for available updates.

**Community opt-in/opt-out** — When you toggle community participation, the plugin sends your site ID and API key, and your current house ad creative (title, image URL, destination URL).

**Community ad serving** — When a `[wp_advertising_community_ad]` shortcode is displayed and community participation is active, the plugin requests a community creative from the service. This request includes your site URL, the shortcode zone, and your plugin version.

**Checkout and license activation** — When you initiate a Pro upgrade or activate a license key, the relevant request is sent to the WP Advertising service via Stripe. Your admin email address is sent to Stripe for receipt purposes.

All requests use HTTPS. No passwords, post content, or private WordPress data are transmitted. Community ad serving requests are only made when community participation is explicitly enabled.

**Service information:**
WP Advertising service — https://wp-advertising.example.com
Terms of Service — https://wp-advertising.example.com/terms
Privacy Policy — https://wp-advertising.example.com/privacy

== Privacy ==

**Local tracking:** When tracking is enabled, the plugin records impression and click events in your local WordPress database. Each event stores a hashed user-agent, a hashed IP address (salted with your WordPress secret key), referring domain, UTM parameters, approximate country code from HTTP headers, device type, browser family, and the hour of the event. No raw IP addresses or personal information are stored. Raw data is retained for 90 days by default and can be configured or disabled from the Performance screen.

**Community network:** When community participation is active, your site URL and house ad creative (image URL, destination URL, title) are shared with the WP Advertising service. Community ad serving requests include your site URL. Your admin email is shared with the service during initial registration and may be used for account communication.

**Data transmitted to the external service** is governed by the WP Advertising Privacy Policy at https://wp-advertising.example.com/privacy.

== Shortcodes ==

= [wp_advertising_community_ad] =

Displays a community ad. Requires community participation to be enabled and an active subscription.

Optional attributes: `theme`, `label`, `headline`, `cta`

Example: `[wp_advertising_community_ad theme="light" label="From our community"]`

The Community Shortcode screen generates shortcode with a live preview.

== Changelog ==

= 8.3.0 =
* Added update notifications: connected sites receive latest version info via authenticated heartbeat; free/unconnected sites check a public release endpoint once per 24 hours.
* Update notice appears across all wp-admin screens when a newer version is available.
* Added `GET /plugin/release` public endpoint on the community server (no authentication, no telemetry).
* Fixed `wp_safe_redirect()` usage for the Stripe checkout redirect.
* Added `wp_unslash()` to all public endpoint superglobal reads.
* Removed unused internal placeholder constant.
* Added four new options to uninstall cleanup.

= 8.2.0 =
* Added 30-day Trial entitlement for Community and external network features.
* Community ad display and opt-in require cached Trial or Pro eligibility.
* Plugin stops community-server calls when entitlement is inactive or expired.

= 8.1.2 =
* Community creatives never embed community-server click or impression URLs in rendered HTML.
* Community card clicks go directly to the advertiser destination.
* Community network impressions are counted server-side on the community serve request.

= 8.0.0 =
* Added Community API registration via POST /sites/register.
* Added opt-in and opt-out sync via POST /sites/opt-in and POST /sites/opt-out.
* Added house ad creative sync via POST /sites/ad.
* Community serve calls changed to GET /community/serve with site URL and tracking flag.
* HTTP 204, API errors, and empty responses skip the community slot cleanly.
* Site credentials (ID and API key) returned by the Community API are stored locally.

= 7.6.0 =
* Added Community API URL setting.
* Blank API URL means local-only mode with no remote requests.

= 7.5.4 =
* Reworked Performance screen settings into vertical setting cards.
* Combined Community and Tracking settings into one Save Settings action.
* Community shortcode is displayed directly on the main screen with Copy and Edit actions.

= 7.1.0 =
* External embeds on file:// pages no longer attempt impression pixels.
* Added per-embed tracking override via data-wpa-track="0".
* Added image error fallback for product images.

= 7.0.0 =
* Added global Track impressions and clicks toggle.
* Disabled tracking removes impression pixel loading and click redirect logging.
* Disabled tracking makes external ads link directly to the rendered destination URL.

= 6.0.0 =
* Added Community Ad rotation.
* Added Community Ad row to the performance table.
* Added Community Shortcode admin view.

= 5.5.2 =
* Emergency stable CORS fix.

== Upgrade Notice ==

= 8.3.0 =
Adds update awareness for all installed plugin instances. No configuration changes required.
