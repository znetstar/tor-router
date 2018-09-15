const temp = require('temp');
const path = require('path');
temp.track();

/**
 * This module cotains the default configuration for the application.
 * @module tor-router/default_config
 */
module.exports = {
	"controlHost": 9077,
	"websocketControlHost": null,
	"parentDataDirectory": temp.mkdirSync(),
	"socksHost": null,
	"dnsHost": null,
	"httpHost": null,
	"proxyByName": false,
	"denyUnidentifedUsers": false,
	"logLevel": "info",
	"loadBalanceMethod": "round_robin",
	"torConfig": {
		"Log": "notice stdout",
		"NewCircuitPeriod": "10"
	},
	"torPath": require('granax').tor(require('os').platform()),
	"instances": null,
	"dns": {
		"timeout": 10000,
		"options": {}
	},
	"granaxOptions": null
};