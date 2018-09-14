/**
 * An array of all valid environment variables 
 * @constant
 * @type {string[]}
 */
 const env_whitelist = [
	"CONTROL_HOST", 
	"TOR_PATH", 
	"INSTANCES", 
	"SOCKS_HOST", 
	"DNS_HOST", 
	"HTTP_HOST", 
	"LOG_LEVEL", 
	'PARENT_DATA_DIRECTORIES', 
	'LOAD_BALANCE_METHOD', 
	"WEBSOCKET_CONTROL_PORT",
	"PROXY_BY_NAME",
	"DENY_UNIDENTIFIED_USERS"
 ];

/**
 * Converts a configuration property's name from env variable format to application config format
 * `"CONTROL_HOST"` -> `"controlHost"` 
 * @param {string} env - Environment variable
 * @returns {string}
 * @private
 */
 function env_to_config(env) {
	let a = env.toLowerCase().split('_');
	i = 1;
	while (i < a.length) {
		a[i] = a[i][0].toUpperCase() + a[i].substr(1);
		i++;
	}
	return a.join('');
 }

 /**
  * Sets up nconf with the `env` store.
  * @param {Provider} nconf - Instance of `nconf.Provider`.
  * @returns {Provider} - Same instance of `nconf.Provider`.
  */
function setup_nconf_env(nconf) {
	return nconf
		.env({
		whitelist: env_whitelist.concat(env_whitelist.map(env_to_config)),
		parseValues: true,
		transform: (obj) => {
			if (env_whitelist.includes(obj.key)) {
				if (obj.key.indexOf('_') !== -1) {
					obj.key = env_to_config(obj.key);
				}
			}
			return obj;
		}
	});
};

/**
 * This module returns a function
 * @module tor-router/nconf_load_env
 */
module.exports = setup_nconf_env;