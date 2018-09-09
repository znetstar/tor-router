const nconf = require('nconf');
const assert = require('chai').assert;

const { TorProcess } = require('../');
const { WAIT_FOR_CREATE } = require('./constants');

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

describe('TorProcess', function () {
	let tor = new TorProcess(nconf.get('torPath'), { DataDirectory: nconf.get('parentDataDirectory'), ProtocolWarnings: 0 }, null);
	describe('#create()', function () {
		this.timeout(WAIT_FOR_CREATE);

		it('should create the child process', async function () {
			await tor.create();
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
		it('should set sample configuration option via the control protocol', async function () {
			await tor.set_config('ProtocolWarnings', 1);
		});
	});

	describe('#get_config(keyword, value)', function () {
		it('should retrieve sample configuration option via the control protocol', async function () {
			let value = await tor.get_config('ProtocolWarnings');
			assert.equal(value, 1);
		});
	});

	describe('#new_identity()', function () {
		it('should use a new identity', async function () {
			await tor.new_identity();
		});
	});

	describe('#signal()', function () {
		it('should send a signal via the control protocol', async function () {
			await tor.signal('DEBUG');
		});
	});

	after('shutdown tor', async function () {
		await tor.exit();
	});
});