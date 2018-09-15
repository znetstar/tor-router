# Tor Router

[![NPM](https://nodei.co/npm/tor-router.png)](https://nodei.co/npm/tor-router/)

*Tor Router* is a SOCKS5, DNS and HTTP proxy server for distributing traffic across multiple instances of Tor. At startup Tor Router will run an arbitrary number of instances Tor and each request will be sent to a different instance in round-robin fashion. This can be used to increase anonymity, because each request will be sent on a different circuit and will most likely use a different exit-node, and also to increase performance since outbound traffic is now split across several instances of Tor.

A list of changes can be [found here](https://github.com/znetstar/tor-router/blob/master/CHANGELOG.md).

## Building and Running

The only installation requirement is node.js. Tor is bundled with the application. To use an external Tor executable use the `--torPath` command line switch or set the `TOR_PATH` environment variable.

To install run: `npm install`
To start run: `bin/tor-router`

To install globally run: `npm install -g tor-router`

Alternatively docker can be used. The build will retrieve the latest version of Tor from the offical Tor Project repository.

To build run: `docker build -t znetstar/tor-router .`
To start run: `docker run --rm -it -p 9050:9050 znetstar/tor-router`

## Usage

The following command line switches and their environment variable equivalents are available for use:

If just a port number is passed in place of a host, it will bind to all interfaces.

|Command line switch|Environment Variable|Description|
|---------------------------|--------------------|-----------|
|-f, --config       		|                    |Path to a JSON configuration file to use|
|-c, --controlHost			|CONTROL_HOST        |Host the control server will bind to and listen for TCP traffic (see below)|
|-w, --websocketControlHost	|WEBSOCKET_CONTROL_HOST        |Host the control server will bind to and listen for WebSocket traffic|
|-j, --instances    		|INSTANCES           |Number of Tor instances to spawn|
|-s, --socksHost    		|SOCKS_HOST 		 |Host the SOCKS proxy will bind to|
|-d, --dnsHost				|DNS_HOST			 |Host the DNS proxy will bind to|
|-h, --httpHost     		|HTTP_HOST			 |Host the HTTP proxy will bind to|
|-l, --logLevel				|LOG_LEVEL			 |Log level (defaults to "info") set to "null" to disable logging. To see a log of all network traffic set logLevel to "verbose"|
|-p, --parentDataDirectory	|PARENT_DATA_DIRECTORY|Parent directory that will contain the data directories for the instances|
|-b, --loadBalanceMethod	|LOAD_BALANCE_METHOD |Method that will be used to sort the instances between each request. Currently supports "round_robin" and "weighted".	|
|-t, --torPath				|TOR_PATH			|Provide the path for the Tor executable that will be used| 
|-n, --proxyByName			|PROXY_BY_NAME		|Controls how authenticated requests will be handled. Can be set to "individual", "group" or false to disable|

A full list of all available configuration options and their defaults can be found in [default_config.js](https://github.com/znetstar/tor-router/blob/master/src/default_config.js)

For example: `tor-router -j 3 -s 127.0.0.1:9050` would start the proxy with 3 tor instances and listen for SOCKS connections on localhost:9050.

## Documentation

For detailed examples and insturctions on using Tor Router [see the wiki](https://github.com/znetstar/tor-router/wiki).

To generate API documentation run `npm run docs`. The documentation will be available in `docs/`. 

## Testing

Tests are written in mocha and can be found under `test/` and can be run with `npm test`
