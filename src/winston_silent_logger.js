const winston = require('winston');

/**
 * Contains a winston `Logger` that is silent (doesn't log anything).
 * @module tor-router/winston_silent_logger
 */
module.exports = winston.createLogger({
	level: 'info',
	format: winston.format.simple(),
	silent: true,
	transports: [ new (winston.transports.Console)({ silent: true }) ]
});