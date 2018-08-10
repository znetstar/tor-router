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

### Changed
- By default Tor Router will use the Tor executable bundled with the application, to override use the "TOR_PATH" environment variable
- Deprecates the TorPool.new_ips and TorProcess.new_ip functions use TorPool.new_identites and TorProcess.new_identity function respectively.

## [3.3.0] - 2018-05-10

### Added
- Adds documentation on all RPC Methods available
- Allows different load-balance methods to be defined, and changed at runtime and via RPC
- Each instance can have started with a specific configuration (torrc) by setting the "Config" property in the definition

### Changed
- If the "Name" property in the definition was not set the data directory will be deleted when the Tor Process exits
- Switches from "commander" to "nconf"/"yargs" for command line processing, switches however will remain the same

## [3.2.2] - 2018-05-08

### Added
- Fixes

### Changed
- Tor Router and child Tor processes are run as an unprivilieged user in the Docker container
- Fixes [Issue #4](https://github.com/znetstar/tor-router/issues/4)