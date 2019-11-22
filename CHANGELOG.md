# Changelog

## [4.0.13] - 2019-11-21
### Changed
- Switched 'granax' package to '@deadcanaries/granax' as suggested in [issue 12](https://zb.gy/2z).

## [4.0.12] - 2019-11-21
### Added
- Added a entrypoint file so the node.js process is not the root process, so it responds to SIGINT calls (Ctrl+C).

## [4.0.11] - 2019-01-15
### Changed
- Updates `multi-rpc` to version 1.5.5.

## [4.0.10] - 2018-12-14
### Changed
- Updates `multi-rpc` to version 1.4.1.

## [4.0.9] - 2018-12-14
### Changed
- Updates `multi-rpc` to version 1.4.0.

## [4.0.7] - 2018-12-14
### Changed
- Updates `multi-rpc` to version 1.1.9.

## [4.0.6] - 2018-12-14
### Changed
- Updates `multi-rpc` to version 1.1.1.

## [4.0.5] - 2018-10-15
### Changed
- Prevents errors that occur when connecting to the destination in the SOCKS Proxy and HTTP Proxy from crashing the applications

## [4.0.4] - 2018-09-24
### Changed
- Replaces `jrpc2` with `multi-rpc` for providing the RPC Interface. No changes to the application or API

## [4.0.3] - 2018-09-15

### Changed
- References granax in `default_config.js` to comply with licensing requirements

## [4.0.2] - 2018-09-15

### Added
- Adds API documentation. To generate run `npm run docs` and open under `docs/index.html`

### Changed
- Much of the README has been moved to [the wiki](https://github.com/znetstar/tor-router/wiki)
- Updates granax to 3.1.4 which fixes a bug on MacOS
- The constructor on `ControlServer` now takes an nconf instance as the first argument and a logger as the second

## [4.0.1] - 2018-09-11

## [4.0.0] - 2018-09-09

### Added
- Instances can now added to one or more groups by setting the `Group` field in the instance definition to a single string or array
- You can now proxy through a specific instance using the username field when connecting to a proxy by setting `--proxyByName` or `-n` to "individual" or true. For example: to connect to an instance named `instance-1` via http use `http://instance-1:@localhost:9080`
- You can also connect to a specific group of instances by setting `--proxyByName` or `-n` to "group". If enabled, requests made to  `://foo:@localhost:9080` would be routed to instances in the `foo` group in round-robin fashion
- The control server will accept WebSocket connections if the `--websocketControlHost` or `-w` argument is set. If the argument is used without a hostname it will default to 9078 on all interfaces
- All servers (DNS, HTTP, SOCKS and Control) all have a `listen` method which takes a port and optionally a host. It will return a Promise that will resolve when the server is listening
- Application configuration can be changed at runtime using the `getConfig` and `setConfig` RPC methods
- Application configuration can be saved and loaded from disk using the `saveConfig` and `loadConfig` RPC methods

### Changes
- All "Port" config options (e.g. socksPort) have been replaced with "Host", and can take a full host (e.g. 127.0.0.1:9050) for its value. This allows you to bind Tor Router to a specific hostname. If just a port is given it will bind to all interfaces
- All methods now return promises instead of accepting callbacks
- The `logger` argument to the constructor of all classes is now optional
- The `Config` property of instance definitions will now inherit all properties from `TorPool.default_tor_config`
- The mocha test has been split into individual files all under `test/`
- DNS shows the source/destination hostname/port in logs instead of what the query was resolved to
- `TorProcess` takes an instance definition as the second argument in its constructor

### Removes
- The `new_ips` and `new_ip_at` TorPool and `new_ip` TorProcess have been removed. Use `new_identites`, `new_identity_at` and `new_identity` instead.
- The `getDefaultTorConfig` and `setDefaultTorConfig` RPC methods have removed. Use `getConfig('torConfig')` and `setConfig('torConfig', value)` instead.

## [3.4.3] - 2018-08-10

### Added
- Adds a changelog 
- Adds `queryInstanceByName` and `queryInstanceAt` RPC methods to retrieve individual instances

### Changes
- Makes changes to ensure compatibility on Windows  

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
- Adds documentation on all available RPC Methods
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
- Adds a `queryInstances` RPC function as requested in [Issue #3](https://github.com/znetstar/tor-router/issues/3)

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