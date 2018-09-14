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
	"torPath": (() => {
	  let platform = require('os').platform();
	  let BIN_PATH = path.join(__dirname, '..', 'node_modules', 'granax', 'bin');
		/**
		 * @author gordonhall on GitLab <https://bit.ly/2xcahjY>
		 */
	  switch (platform) {
	    case 'win32':
	      return path.join(BIN_PATH, 'Browser', 'TorBrowser', 'Tor', 'tor.exe');
	      break;
	    case 'darwin':
	      return path.join(BIN_PATH, '.tbb.app', 'Contents', 'Resources',
	                          'TorBrowser', 'Tor', 'tor');
	      break;
	    case 'android':
	    case 'linux':
	      return path.join(BIN_PATH, 'tor-browser_en-US', 'Browser', 'TorBrowser', 'Tor', 'tor');
	      break;
	    default:
	      return "tor"; 
	  }
	})(),
	"instances": null,
	"dns": {
		"timeout": 10000,
		"options": {}
	},
	"granaxOptions": null
};