const nconf = require('nconf');
const request = require('request-promise');
const getPort = require('get-port');
const { assert } = require('chai');

const { TorPool, HTTPServer } = require('../');
const { WAIT_FOR_CREATE, PAGE_LOAD_TIME } = require('./constants');

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));


describe('HTTPServer', function () {
	describe('#handle_http_connections(req, res)', function () {
		let httpServerTorPool;
		let httpServer;
		let httpPort;

		before('start up server', async function (){
			httpServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
			httpServer = new HTTPServer(httpServerTorPool, null, false);
			
			this.timeout(WAIT_FOR_CREATE);
	
			await httpServerTorPool.create(1);
			httpPort = await getPort();
	
			await httpServer.listen(httpPort);
		});

		it('should service a request for example.com', async function () {
			this.timeout(PAGE_LOAD_TIME);

			await request({
				url: 'http://example.com',
				proxy: `http://127.0.0.1:${httpPort}`
			});
		});

		after('shutdown server', function () {
			httpServer.close();
		});
	
		after('shutdown tor pool', async function () {
			await httpServerTorPool.exit();
		});

	});

	describe('#handle_connect_connections(req, inbound_socket, head)', function () {
		let httpServerTorPool;
		let httpServer;
		let httpPort;

		before('start up server', async function (){
			httpServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
			httpServer = new HTTPServer(httpServerTorPool, null, false);
			
			this.timeout(WAIT_FOR_CREATE);
	
			await httpServerTorPool.create(1);
			httpPort = await getPort();
	
			await httpServer.listen(httpPort);
		});

		it('should service a request for example.com', async function () {
			this.timeout(PAGE_LOAD_TIME);

			await request({
				url: 'http://example.com',
				proxy: `http://127.0.0.1:${httpPort}`
			});
		});

		after('shutdown server', function () {
			httpServer.close();
		});
	
		after('shutdown tor pool', async function () {
			await httpServerTorPool.exit();
		});
	});

	describe('#authenticate_user_http(req, res)', function () {
		let httpServerTorPool;
		let httpServer;
		let httpPort;

		let instance_def = {
			Name: 'instance-3'
		};

		before('start up server', async function (){
			httpServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
			httpServer = new HTTPServer(httpServerTorPool, null, { deny_unidentified_users: true });
			
			this.timeout(WAIT_FOR_CREATE * 3);
	
			await httpServerTorPool.create(2);
			await httpServerTorPool.add(instance_def);
			httpPort = await getPort();
	
			await httpServer.listen(httpPort);
		});

		it(`should service a request for example.com through ${instance_def.Name}`, function (done) {
			this.timeout(PAGE_LOAD_TIME);

			let req;

			httpServer.on('instance-connection', (instance, source) => {
				assert.equal(instance.instance_name, instance_def.Name);
				assert.isTrue(source.by_name);
				req.cancel();
				done();
			});

			req = request({
				url: 'http://example.com',
				proxy: `http://${instance_def.Name}:@127.0.0.1:${httpPort}`
			})
			.catch(done)
		});

		it(`shouldn't be able to send a request without a username`, async function() {
			let f = () => {};
			try {
				await request({
					url: 'http://example.com',
					proxy: `https://127.0.0.1:${httpPort}`,
					timeout: PAGE_LOAD_TIME
				});
			} catch (error) {
				f = () => { throw error };
			} finally {
				assert.throws(f, "407", "Did not return 407 status code");
			}
		});

		it(`shouldn't be able to send a request with an incorrect username`, async function() {
			let f = () => {};
			try {
				await request({
					url: 'http://example.com',
					proxy: `http://blah-blah-blah:@127.0.0.1:${httpPort}`,
					timeout: PAGE_LOAD_TIME
				});
			} catch (error) {
				f = () => { throw error };
			} finally {
				assert.throws(f, "407", "Did not return 407 status code");
			}
		});

		after('shutdown server', function () {
			httpServer.close();
		});
	
		after('shutdown tor pool', async function () {
			await httpServerTorPool.exit();
		});
	});

	describe('#authenticate_user_connect(req, socket)', function () {
		let httpServerTorPool;
		let httpServer;
		let httpPort;

		let instance_def = {
			Name: 'instance-3'
		};

		before('start up server', async function (){
			httpServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
			httpServer = new HTTPServer(httpServerTorPool, null, { deny_unidentified_users: true });
			
			this.timeout(WAIT_FOR_CREATE * 3);
	
			await httpServerTorPool.create(2);
			await httpServerTorPool.add(instance_def);
			httpPort = await getPort();
	
			await httpServer.listen(httpPort);
		});

		it(`should service a request for example.com through ${instance_def.Name}`, function (done) {
			this.timeout(PAGE_LOAD_TIME);
			let req;
			httpServer.on('instance-connection', (instance, source) => {
				assert.equal(instance.instance_name, instance_def.Name);
				assert.isTrue(source.by_name);
				req.cancel();
				done();
			});

			req = request({
				url: 'https://example.com',
				proxy: `http://${instance_def.Name}:@127.0.0.1:${httpPort}`,
			})
			.catch(done);
		});

		it(`shouldn't be able to send a request without a username`, async function() {
			let f = () => {};
			try {
				await request({
					url: 'https://example.com',
					proxy: `http://127.0.0.1:${httpPort}`,
					timeout: PAGE_LOAD_TIME
				});
			} catch (error) {
				f = () => { throw error };
			} finally {
				assert.throws(f, "socket hang up", "Did not hang up");
			}
		});

		it(`shouldn't be able to send a request with an incorrect username`, async function() {
			let f = () => {};
			try {
				await request({
					url: 'https://example.com',
					proxy: `http://blah-blah-blah:@127.0.0.1:${httpPort}`,
					timeout: PAGE_LOAD_TIME
				});
			} catch (error) {
				f = () => { throw error };
			} finally {
				assert.throws(f, "socket hang up", "Did not hang up");
			}
		});

		after('shutdown server', function () {
			httpServer.close();
		});
	
		after('shutdown tor pool', async function () {
			await httpServerTorPool.exit();
		});
	});
});
