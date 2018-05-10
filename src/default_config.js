// Default configuration for Tor Router
const temp = require('temp');
temp.track();
module.exports = {
	"controlPort": 9077,
	"parentDataDirectory": temp.mkdirSync(),
	"socksPort": 9050,
	"dnsPort": null,
	"httpPort": null,
	"logLevel": "info",
	"loadBalanceMethod": "round_robin",
	"torConfig": {
		"Log": "notice stdout",
		"NewCircuitPeriod": "10"
	},
	"instances": 1,
	"dns": {
		"options": {},
		"timeout": null
	},
};