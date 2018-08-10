# Changelog

## [3.4.2] - 2018-08-09

### Added
- Test suites for DNSServer, HTTPServer, SOCKSServer and ControlServer
- Added TorPool.set_config_all method to change configuration of all active instances

### Changed
- Cleans up test suites for TorPool and TorProcess
- Removes potential security vulnerability
- setTorConfig rpc method changes the configuration of active instances, setDefaultTorConfig and getDefaultTorConfig will set or get the configuration of future instances
- The default Tor Configuration will be applied to instances when the "Config" property on the instance definition is not set

## [3.4.1] - 2018-07-19

### Changed
- Fixes bug with the application not binding to port numbers specified on the command line

## [3.4.0] - 2018-05-11

### Added
- Bundles the Tor executable with the application. Tor will be downloaded during "npm install"
- Signals and Configuration changes can be sent to live Tor instances via the Tor Control Protocol
- Adds TorProcess.new_identity

### Changed
- By default Tor Router will use the Tor executable bundled with the application, to override use the "TOR_PATH" environment variable
- Deprecates the TorPool.new_ips and TorProcess.new_ip functions use TorPool.new_identites and TorProcess.new_identity function respectively.