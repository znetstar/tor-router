const winston = require('winston');

module.exports = winston.createLogger({
	level: 'info',
	format: winston.format.simple(),
	silent: true,
	transports: [ new (winston.transports.Console)({ silent: true }) ]
});