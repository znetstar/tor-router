// Default configuration for Tor Router
const temp = require('temp');
const path = require('path');
temp.track();
module.exports = {
	"controlHost": 9077,
	"websocketControlHost": null,
	"parentDataDirectory": temp.mkdirSync(),
	"socksHost": null,
	"dnsHost": null,
	"httpHost": null,
	"logLevel": "info",
	"loadBalanceMethod": "round_robin",
	"torConfig": {
		"Log": "notice stdout",
		"NewCircuitPeriod": "10"
	},
	"torPath": (() => {
	  let platform = require('os').platform();
	  let BIN_PATH = path.join(__dirname, '..', 'node_modules', 'granax', 'bin');
	  /* Taken from https://github.com/bookchin/granax/blob/master/index.js */
	  switch (platform) {
	    case 'win32':
	      torpath = path.join(BIN_PATH, 'Browser', 'TorBrowser', 'Tor', 'tor.exe');
	      break;
	    case 'darwin':
	      torpath = path.join(BIN_PATH, '.tbb.app', 'Contents', 'Resources',
	                          'TorBrowser', 'Tor', 'tor');
	      break;
	    case 'android':
	    case 'linux':
	      torpath = path.join(BIN_PATH, 'tor-browser_en-US', 'Browser', 'TorBrowser', 'Tor', 'tor');
	      break;
	    default:
	      throw new Error(`Unsupported platform "${platform}"`);
	  }
	  return torpath;
	})(),
	"instances": null,
	"dns": {
		"options": {},
		"timeout": null
	},
	"granaxOptions": null
};