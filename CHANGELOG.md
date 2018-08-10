# Changelog

## [3.4.2] - 2018-08-09

### Added
- Test suites for `DNSServer`, `HTTPServer`, `SOCKSServer` and `ControlServer`
- Added `TorPool.set_config_all` method to change configuration of all active instances

### Changed
- Cleans up test suites for `TorPool` and `TorProcess`
- Removes potential security vulnerability
- `setTorConfig` rpc method will now change the configuration of active instances, `setDefaultTorConfig` and `getDefaultTorConfig` will set or get the configuration of future instances
- The default Tor Configuration will be applied to instances when the `Config` property on the instance definition is not set

## [3.4.1] - 2018-07-19

### Changed
- Fixes bug with the application not binding to port numbers specified on the command line

## [3.4.0] - 2018-05-11

### Added
- Bundles the Tor executable with the application. Tor will be downloaded during `npm install`
- Signals and Configuration changes can be sent to live Tor instances via the Tor Control Protocol. Serveral RPC and `TorPool` methods have been added.

### Changed
- By default Tor Router will use the Tor executable bundled with the application, to override use the `TOR_PATH` environment variable
- Deprecates the `TorPool.new_ips` and `TorProcess.new_ip` functions use `TorPool.new_identites`cand `TorProcess.new_identity` function respectively.

## [3.3.0] - 2018-05-10

### Added
- Adds documentation on all RPC Methods available
- Allows different load-balance methods to be defined, and changed at runtime and via RPC
- Each instance can have started with a specific configuration (torrc) by setting the `Config` property in the definition

### Changed
- If the `Name` property in the definition was not set the data directory will be deleted when the Tor Process exits
- Switches from "commander" to "nconf"/"yargs" for command line processing, switches however will remain the same

## [3.2.2] - 2018-05-08

### Changed
- Tor Router and child Tor processes are run as an unprivilieged user in the Docker container
- Fixes [Issue #4](https://github.com/znetstar/tor-router/issues/4) which affects dynamically created Tor Instances
- Network traffic is only logged when `logLevel` is set to "verbose"

## [3.2.1] - 2017-12-08

### Changed
- Fixes typo bug in Control Server

## [3.2.0] - 2017-12-07

### Changed
- Replaced socket.io with JSON-RPC 2 as the RPC protocol
- The Dockerfile includes an `ENTRYPOINT` for Tor Router

## [3.1.0] - 2017-12-07

### Added
- Adds an HTTP Proxy Server `HTTPServer` which can HTTP-Connect requests (HTTPS traffic).
- Adds a `queryInstances` RPC function

### Removed
- Removes the "docker-compose.yml" file

## [3.0.7] - 2017-11-12

### Changes
- The Dockerfile will now use Node.js version 8

## [3.0.6] - 2017-07-25

### Changes
- Fixes a bug that occures on OS X

## [3.0.5] - 2017-04-05

### Changes 
- Fixes a bug with an RPC Method

## [3.0.4] - 2017-04-05

### Changes
- Changes the arguments tor-router will be launched with when run using npm start

## [3.0.3] - 2017-03-25

### Added
- Adds the Apache Licence Version 2 as the project's licence 

## [3.0.2] - 2017-03-25

### Changed

- Data sent in a request before a Tor instance comes online is held in a buffer.

## [3.0.1] - 2017-03-25

### Added

- In `SOCKSServer` waits for a Tor instance in the pool to come online before making a connection.

## [3.0.0] - 2017-03-24

### Changed

- Rewrites the application as a proxy server written as a node.js app.