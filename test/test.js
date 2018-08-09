const SocksAgent = require('socks5-http-client/lib/Agent');
const request = require('request');
const async = require('async');
const temp = require('temp');
temp.track();
const TorRouter = require('../');
const getPort = require('get-port');
const dns = require('native-dns');
const _ = require('lodash');
const winston = require('winston');

var colors = require('mocha/lib/reporters/base').colors;
colors['diff added'] = 32;
colors['diff removed'] = 31;

var nconf = require('nconf')
nconf = require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

var logger = winston.createLogger({
	level: 'info',
	format: winston.format.simple(),
	transports: [new (require('winston-null-transport'))() ]
});

describe('TorProcess', function () {
	const torDataDir = temp.mkdirSync();
	
	var tor = new (TorRouter.TorProcess)(nconf.get('torPath'), { DataDirectory: torDataDir, ProtocolWarnings: 0 }, null, logger);
	describe('#create()', function () {
		this.timeout(60000);

		it('should create the child process', function (done) {
			tor.create(done);
		});

		it('should signal when it is listening on the control port', function (done) {
			if (tor.control_port_listening)
				return done();
			tor.once('control_listen', done);
		});

		it('should signal when connected to the control port', function (done) {
			if (tor.control_port_connected)
				return done();
			tor.once('controller_ready', done);
		});

		it('should signal when it is listening on the socks port', function (done) {
			if (tor.socks_port_listening)
				return done();
			tor.once('socks_listen', done);
		});

		it('should signal when it is listening on the dns port', function (done) {
			if (tor.dns_port_listening)
				return done();
			tor.once('dns_listen', done);
		});

		it('should signal when bootstrapped', function (done) {
			tor.once('error', done);
			if (tor.bootstrapped)
				return done();
			tor.once('ready', done);
		});
	});

	describe('#set_config(keyword, value)', function () {
		it('should set sample configuration option via the control protocol', function (done) {
			tor.set_config('ProtocolWarnings', 1, done);
		});
	});

	describe('#get_config(keyword, value)', function () {
		it('should retrieve sample configuration option via the control protocol', function (done) {
			tor.get_config('ProtocolWarnings', function (error, value) {
				done(error, (value == 1));
			});
		});
	});

	describe('#new_identity()', function () {
		it('should use a new identity', function (done) {
			tor.new_identity(done);
		});
	});

	describe('#signal()', function () {
		it('should send a signal via the control protocol', function (done) {
			tor.signal('DEBUG', done);
		});
	});

	after('shutdown tor', function () {
		tor.exit();
		require('fs').unlinkSync(torDataDir);
	});
});