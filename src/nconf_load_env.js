const env_whitelist = [ "CONTROL_PORT", 
						"TOR_PATH", 
						"INSTANCES", 
						"SOCKS_PORT", 
						"DNS_PORT", 
						"HTTP_PORT", 
						"LOG_LEVEL", 
						'PARENT_DATA_DIRECTORIES', 
						'LOAD_BALANCE_METHOD', 
						"controlPort", 
						"torPath", 
						"instances", 
						"socksPort", 
						"dnsPort", 
						"httpPort", 
						"logLevel", 
						'parentDataDirectories', 
						'loadBalanceMethod'
					];

module.exports = (nconf) => {
	return nconf
		.env({
		whitelist: env_whitelist,
		parseValues: true,
		transform: (obj) => {
			if (env_whitelist.includes(obj.key)) {
				if (obj.key.indexOf('_') !== -1) {
					let a = obj.key.toLowerCase().split('_');
					i = 1;
					while (i < a.length) {
						a[i] = a[i][0].toUpperCase() + a[i].substr(1);
						i++;
					}
					obj.key = a.join('');
				}
			}
			return obj;
		}
	});
};