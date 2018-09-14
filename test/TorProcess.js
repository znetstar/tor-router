const { Provider } = require('nconf');
const nconf = new Provider();
const { assert } = require('chai');
const _ = require('lodash');

const { TorProcess } = require('../');
const { WAIT_FOR_CREATE } = require('./constants');

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

describe('TorProcess', function () {
	const tor_factory = (d) => { 
		let defaults = { Config: { DataDirectory: nconf.get('parentDataDirectory') } };
		d = _.extend(_.cloneDeep(defaults), (d || {}));
		return new TorProcess(nconf.get('torPath'), d, null); 
	}

	describe('#instance_name', function () {
		let def = { Name: 'foo' };
		before('create tor process', function () {
			tor = tor_factory(def);
		});

		it('should have the same name as the definition', function () {
			assert.equal(tor.instance_name, def.Name);
		});
	});

	describe('#instance_group', function () {
		let def = { Group: ['foo'] };
		before('create tor process', function () {
			tor = tor_factory(def);
		});

		it('should have the same group as the definition', function () {
			assert.deepEqual(tor.instance_group, def.Group);
		});
	});

	describe('#definition', function () {
		let def = { Group: ['foo'], Config: {} };
		before('create tor process', function () {
			tor = tor_factory(def);
		});

		it('should be the same as the definition', function () {
			let tor_def = _.cloneDeep(tor.definition);
			assert.deepEqual(tor.definition, def);
		});
	});

	describe('#exit()', function () {
		let tor
		before('create tor process', async function () {
			tor = tor_factory();
			this.timeout(WAIT_FOR_CREATE);
			await tor.create();
		});

		it('should exit cleanly', async function () {
			await tor.exit();
		});

		it('the process should be dead', function () {
			assert.isTrue(tor.process.killed);
		});
	});

	describe('#create()', function () {
		let tor
		before('create tor process', function () {
			tor = tor_factory();
		});

		it('should create the child process', async function () {
			this.timeout(WAIT_FOR_CREATE);
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

		after('exit tor', async function () {
			await tor.exit();
		});
	});

	describe('#set_config(keyword, value)', function () {
		let tor
		before('create tor process', function (done) {
			tor = tor_factory();
			this.timeout(WAIT_FOR_CREATE);
			tor.once('controller_ready', done);
			tor.create().catch(done);
		});

		it('should set sample configuration option via the control protocol', async function () {
			await tor.set_config('ProtocolWarnings', 1);
		});

		it('should have the value set', async function () {
			let value = (await tor.get_config('ProtocolWarnings'))[0];
			assert.equal(value, "1");
		});

		after('exit tor', async function () {
			await tor.exit();
		});
	});

	describe('#get_config(keyword, value)', function () {
		let tor
		before('create tor process', function (done) {
			tor = tor_factory({ Config: { ProtocolWarnings: 1 } });
			this.timeout(WAIT_FOR_CREATE);
			tor.once('controller_ready', done);
			tor.create().catch(done);
		});

		it('should retrieve sample configuration option via the control protocol', async function () {
			let value = await tor.get_config('ProtocolWarnings');
			assert.equal(value, 1);
		});

		after('exit tor', async function () {
			await tor.exit();
		});		
	});

	describe('#new_identity()', function () {
		before('create tor process', function (done) {
			tor = tor_factory();
			this.timeout(WAIT_FOR_CREATE);
			tor.once('controller_ready', done);
			tor.create().catch(done);
		});

		it('should use a new identity', async function () {
			await tor.new_identity();
		});

		after('exit tor', async function () {
			await tor.exit();
		});	
	});

	describe('#signal()', function () {
		let tor;
		before('create tor process', function (done) {
			tor = tor_factory();
			this.timeout(WAIT_FOR_CREATE);
			tor.once('controller_ready', done);
			tor.create().catch(done);
		});

		it('should send a signal via the control protocol', async function () {
			await tor.signal('DEBUG');
		});

		after('exit tor', async function () {
			await tor.exit();
		});	
	});
});