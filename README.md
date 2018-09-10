# Tor Router

[![NPM](https://nodei.co/npm/tor-router.png)](https://nodei.co/npm/tor-router/)

*Tor Router* is a simple SOCKS5 proxy server for distributing traffic across multiple instances of Tor. At startup Tor Router will run an arbitrary number of instances Tor and each request will be sent to a different instance in round-robin fashion. This can be used to increase anonymity, because each request will be sent on a different circuit and will most likely use a different exit-node, and also to increase performance since outbound traffic is now split across several instances of Tor.

Tor Router also includes a DNS proxy server and a HTTP proxy as well, which like the SOCKS proxy will distribute traffic across multiple instances of Tor in round-robin fashion. The HTTP proxy server can be used to access Tor via an HTTP Proxy.

A list of changes can be [found here](https://github.com/znetstar/tor-router/blob/master/CHANGELOG.md)

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
|-n, --proxyByName			|PROXY_BY_NAME		|Controls how authenticated requests will be handled. Can be set to "individual", "groups" or false to disable|

A full list of all available configuration options and their defaults can be found in [default_config.js](https://github.com/znetstar/tor-router/blob/master/src/default_config.js)

For example: `tor-router -j 3 -s 127.0.0.1:9050` would start the proxy with 3 tor instances and listen for SOCKS connections on localhost:9050.

## Testing

Tests are written in mocha and can be found under `test/` and can be run with `npm test`

## Configuration

Using the `--config` or `-f` command line switch you can set the path to a JSON file which can be used to load configuration on startup

The same variable names from the command line switches are used to name the keys in the JSON file.

Example:

```
 {
 	"controlPort": 9077,
 	"logLevel": "debug"
 }
```

Using the configuration file you can set a default configuration for all Tor instances

```
{
	"torConfig": {
		"MaxCircuitDirtiness": "10"
	}
}
```

You can also specify a configuration for individual instances by setting the "instances" field to an array instead of an integer.

Instances can optionally be assigned name and a weight. If the `loadBalanceMethod` config variable is set to "weighted" the weight field will determine how frequently the instance is used. If the instance is assigned a name the data directory will be preserved when the process is killed saving time when Tor is restarted.

```
{
	"loadBalanceMethod": "weighted",
	"instances": [
		{
			"Name": "instance-1"
			"Weight": 10,
			"Config": {
			}
		},
		{
			"Name": "instance-2",
			"Weight": 5,
			"Config": {
			}
		}
	]
}
```

## Control Server

A JSON-RPC 2 TCP Server will listen on port 9077 by default. Using the rpc server the client can add/remove Tor instances and get a new identity (which includes a new ip address) while Tor Router is running.

Example (in node):

```
	const net = require('net');

	let client = net.createConnection({ port: 9077 }, () => {
		let rpcRequest = {
			"method": "createInstances",
			"params": [3], 
			"jsonrpc":"2.0", 
			"id": 1
		};
		client.write(JSON.stringify(rpcRequest));
	});

	client.on('data', (chunk) => {
		let rawResponse = chunk.toString('utf8');
		let rpcResponse = JSON.parse(rawResponse);
		console.log(rpcResponse)
		if (rpcResponse.id === 1) {
			console.log('Three instances have been created!')
		}
	})
```

A full list of available RPC Methods can be [found here](https://github.com/znetstar/tor-router/blob/master/docs/rpc-methods.md)

## Tor Control Protocol

You can retrieve or set the configuration of instances while they're running via the Tor Control Protocol.

The example below will change the "MaxCircuitDirtiness" value for the first instance in the pool

Example:
```
let rpcRequest = {
	"method": "setInstanceConfigAt",
	"params": [0, "MaxCircuitDirtiness", "20"], 
	"jsonrpc":"2.0", 
	"id": 1
};
client.write(JSON.stringify(rpcRequest));
```

You can also send signals directly to instances or to all instances in the pool via the control protocol. A list of all signals can be [found here](https://gitweb.torproject.org/torspec.git/tree/control-spec.txt)

The example below will set the log level of all instances to "debug".

Example:
```
let rpcRequest = {
	"method": "signalAllInstances",
	"params": ["DEBUG"], 
	"jsonrpc":"2.0", 
	"id": 1
};
client.write(JSON.stringify(rpcRequest));
```
