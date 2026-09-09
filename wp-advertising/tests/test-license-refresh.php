<?php
// Standalone regression checks; no WordPress install or network required.
define('ABSPATH', __DIR__ . '/');
define('HOUR_IN_SECONDS', 3600);
define('WPA_COMMUNITY_LAST_ERROR_OPTION', 'community_last_error');
define('WPA_DB_VERSION', 'test');
define('WPA_RETENTION_HOOK', 'retention');
define('WPA_RETENTION_DAYS_OPTION', 'retention_days');
foreach (['STATUS', 'ACCESS_UNTIL', 'RULES', 'NEXT_CHECK', 'LAST_ERROR', 'KEY'] as $name) {
    define('WPA_LICENSE_' . $name . '_OPTION', strtolower($name));
}
$options = ['wp_advertising_db_version' => 'test'];
$hooks = []; $scheduled = []; $schedule_calls = 0;
function get_option($key, $default = false) { global $options; return $options[$key] ?? $default; }
function update_option($key, $value, $autoload = false) { global $options; $options[$key] = $value; }
function delete_option($key) { global $options; unset($options[$key]); }
function add_option($key, $value, $unused = '', $autoload = false) { update_option($key, $value); }
function sanitize_key($v) { return strtolower($v); }
function sanitize_text_field($v) { return $v; }
function absint($v) { return abs((int) $v); }
function is_wp_error($v) { return false; }
function current_user_can($cap) { return false; }
function add_action($name, $callback) { global $hooks; $hooks[$name] = $callback; }
function add_filter($name, $callback) {}
function add_shortcode($name, $callback) {}
function wp_next_scheduled($name) { global $scheduled; return $scheduled[$name]['time'] ?? false; }
function wp_schedule_event($time, $frequency, $name) { global $scheduled, $schedule_calls; $scheduled[$name] = compact('time', 'frequency'); $schedule_calls++; }
function wp_unschedule_event($time, $name) { global $scheduled; unset($scheduled[$name]); }
function wp_clear_scheduled_hook($name) { global $scheduled; unset($scheduled[$name]); }
class WPA_Repository {
    public $calls = 0;
    public $response = ['code' => 503];
    public function community_auth_payload() { return ['siteId' => 'site_test', 'apiKey' => 'test_key']; }
    public function get_community_api_url() { return 'https://example.test/v1'; }
    public function community_api_request($method, $path, $body) { $this->calls++; return $this->response; }
    public function community_api_error_message($r) { return 'unavailable'; }
    public function community_enabled() { return false; }
    public function ensure_default_house_ad() {}
}
class FakeDatabase { public $options = 'options'; public function query($query) {} }
$wpdb = new FakeDatabase();
require __DIR__ . '/../includes/class-wpa-license.php';
require __DIR__ . '/../includes/class-wpa-plugin.php';
require __DIR__ . '/../includes/class-wpa-installer.php';
function check($condition, $message) { if (!$condition) throw new RuntimeException($message); }
$repo = new WPA_Repository(); $license = new WPA_License($repo);
$end = gmdate('c', time() + 3600);
$license->store_entitlement(['networkStatus' => 'ACTIVE', 'networkAccessUntil' => $end, 'eligible' => true]);
check($license->is_network_eligible(), 'active window');
$license->maybe_validate(true);
check($license->status() === 'grace', 'offline grace status');
check(get_option('access_until') === $end, 'failure cannot extend deadline');
$license->maybe_validate(true);
check(get_option('access_until') === $end, 'retry cannot extend deadline');
update_option('access_until', gmdate('c', time() - 1));
check(!$license->is_network_eligible(), 'offline grace must expire');
$license->maybe_validate(true);
check($license->status() === 'expired', 'expired status stored');
update_option('status', 'active'); update_option('access_until', '');
check(!$license->is_network_eligible(), 'missing deadline must fail closed');
update_option('access_until', $end); $repo->response = ['code' => 403];
$license->maybe_validate(true);
check($license->status() === 'revoked', 'explicit server denial must not get offline grace');

$reflection = new ReflectionClass('WPA_Plugin');
$plugin = $reflection->newInstanceWithoutConstructor();
foreach (['license' => $license, 'repo' => $repo] as $name => $value) {
    $property = $reflection->getProperty($name); $property->setAccessible(true); $property->setValue($plugin, $value);
}
$method = $reflection->getMethod('hooks'); $method->setAccessible(true); $method->invoke($plugin);
check(isset($hooks['wp_advertising_refresh_entitlement']), 'background refresh hook registered');
WPA_Installer::maybe_upgrade(); $count = $schedule_calls; WPA_Installer::maybe_upgrade();
check($schedule_calls === $count, 'upgrade must not duplicate cron events');
check($scheduled['wp_advertising_refresh_entitlement']['frequency'] === 'hourly', 'hourly schedule');
update_option('status', 'expired'); update_option('next_check', 0);
$repo->response = ['code' => 200, 'body' => ['networkStatus' => 'ACTIVE', 'networkAccessUntil' => $end, 'eligible' => true]];
$before = $repo->calls; call_user_func($hooks['wp_advertising_refresh_entitlement']);
check($repo->calls === $before + 1, 'background refresh works without an administrator and recovers expired state');
check($license->is_network_eligible(), 'renewed entitlement recovered');
call_user_func($hooks['wp_advertising_refresh_entitlement']);
check($repo->calls === $before + 1, 'next-check throttle respected');
update_option('status', 'inactive'); update_option('next_check', 0);
call_user_func($hooks['wp_advertising_refresh_entitlement']);
check($repo->calls === $before + 1, 'free/inactive installs do not contact licensing');
WPA_Installer::deactivate();
check(!isset($scheduled['wp_advertising_refresh_entitlement']), 'deactivation removes cron event');
echo "License expiry and scheduled refresh checks passed.\n";
