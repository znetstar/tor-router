/**
 * Index module for the project
 * @module tor-router
 */
module.exports = {
	TorProcess: require('./TorProcess'),
	TorPool: require('./TorPool'),
	SOCKSServer: require('./SOCKSServer'),
	HTTPServer: require('./HTTPServer'),
	DNSServer: require('./DNSServer'),
	ControlServer: require('./ControlServer')
};