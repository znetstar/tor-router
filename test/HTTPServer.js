const { Provider } = require('nconf');
const nconf = new Provider();
const getPort = require('get-port');
const { assert } = require('chai');
const _ = require('lodash');
const Promise = require('bluebird');

const { TorPool, HTTPServer, TorProcess } = require('../');
const { WAIT_FOR_CREATE, PAGE_LOAD_TIME, RETRY_DELAY, RETRY_STRATEGY, MAX_ATTEMPTS  } = require('./constants');

const request = require('requestretry').defaults({
	promiseFactory: ((resolver) => new Promise(resolver)),
	maxAttempts: MAX_ATTEMPTS,
	retryStrategy: RETRY_STRATEGY,
	retryDelay: RETRY_DELAY
});

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

		it('should emit the "instance_connection" event', function (done) {
			this.timeout(PAGE_LOAD_TIME);

			let connectionHandler = (instance, source) => {
				assert.instanceOf(instance, TorProcess);
				assert.isObject(source);
				
				httpServer.removeAllListeners('instance_connection');;
				done();
			};

			httpServer.on('instance_connection', connectionHandler);

			request({
				url: 'http://example.com',
				proxy: `http://127.0.0.1:${httpPort}`
			})
			.catch((err) => {

			})
		});


		after('shutdown server', function () {
			httpServer.close();
		});
	
		after('shutdown tor pool', async function () {
			await httpServerTorPool.exit();
		});

	});
	return
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
				url: 'https://example.com',
				proxy: `http://127.0.0.1:${httpPort}`
			});
		});

		it('should emit the "instance_connection" event', function (done) {
			this.timeout(PAGE_LOAD_TIME);

			let connectionHandler = (instance, source) => {
				assert.instanceOf(instance, TorProcess);
				assert.isObject(source);
			
				httpServer.removeAllListeners('instance_connection');;
				done();
			};

			httpServer.on('instance_connection', connectionHandler);

			request({
				url: 'https://example.com',
				proxy: `http://127.0.0.1:${httpPort}`
			})
			.catch((error) => {

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
			Name: 'instance-3',
			Group: 'foo'
		};

		before('start up server', async function (){
			httpServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
			httpServer = new HTTPServer(httpServerTorPool, null, { deny_unidentified_users: true, mode: 'individual' });
			
			this.timeout(WAIT_FOR_CREATE * 3);
	
			await httpServerTorPool.create(2);
			await httpServerTorPool.add(instance_def);
			httpPort = await getPort();
	
			await httpServer.listen(httpPort);
		});

		it(`should service a request for example.com through the instance named ${instance_def.Name}`, function (done) {
			this.timeout(PAGE_LOAD_TIME);

			let req;

			let connectionHandler = (instance, source) => {
				assert.equal(instance.instance_name, instance_def.Name);
				assert.isTrue(source.by_name);
				
				req.cancel();
				httpServer.removeAllListeners('instance_connection');;
				done();
			};

			httpServer.on('instance_connection', connectionHandler);

			req = request({
				url: 'http://example.com',
				proxy: `http://${instance_def.Name}:@127.0.0.1:${httpPort}`
			})
			.catch(done)
		});
		
		it(`four requests made to example.com through the group named "foo" should come from the instances in "foo"`, function (done) {
			(async () => {
				this.timeout(PAGE_LOAD_TIME + (WAIT_FOR_CREATE));

				await httpServerTorPool.add([
					{
						Name: 'instance-4',
						Group: 'foo'
					}
				]);
			})()
			.then(async () => {
				httpServer.proxy_by_name.mode = "group";

				let names_requested = [];

				let connectionHandler = (instance, source) => {
					names_requested.push(instance.instance_name);

					if (names_requested.length === httpServerTorPool.instances.length) {
						names_requested = _.uniq(names_requested).sort();

						let names_in_group = httpServerTorPool.instances_by_group('foo').map((i) => i.instance_name).sort()

						assert.deepEqual(names_requested, names_in_group);
						httpServer.removeAllListeners('instance_connection');
						done();
					}
				};

				httpServer.on('instance_connection', connectionHandler);

				let i = 0;
				while (i < httpServerTorPool.instances.length) {
					await request({
						url: 'http://example.com',
						proxy: `http://foo:@127.0.0.1:${httpPort}`
					});
					i++;
				}
			})
			.then(async () => {
				await httpServerTorPool.remove_by_name('instance-4');
				httpServer.proxy_by_name.mode = "individual";
			})
			.catch(done);
		});
		
		it(`shouldn't be able to send a request without a username`, async function() {
			let f = () => {};
			try {
				let res =  await request({
					url: 'http://example.com',
					proxy: `http://127.0.0.1:${httpPort}`,
					timeout: PAGE_LOAD_TIME
				});
				if (res.statusCode === 407) 
					throw new Error('407');
			} catch (error) {
				f = () => { throw error };
			} finally {
				assert.throws(f, "407", "Did not return 407 status code");
			}
		});

		it(`shouldn't be able to send a request with an incorrect username`, async function() {
			let f = () => {};
			try {
				let res = await request({
					url: 'http://example.com',
					proxy: `http://blah-blah-blah:@127.0.0.1:${httpPort}`,
					timeout: PAGE_LOAD_TIME,
					fullResponse: true
				});
				if (res.statusCode === 407) 
					throw new Error('407');
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
			Name: 'instance-3',
			Group: 'foo'
		};

		before('start up server', async function (){
			httpServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
			httpServer = new HTTPServer(httpServerTorPool, null, { deny_unidentified_users: true, mode: "individual" });
			
			this.timeout(WAIT_FOR_CREATE * 3);
	
			await httpServerTorPool.create(2);
			await httpServerTorPool.add(instance_def);
			httpPort = await getPort();
	
			await httpServer.listen(httpPort);
		});

		it(`should service a request for example.com through ${instance_def.Name}`, function (done) {
			this.timeout(PAGE_LOAD_TIME);
			let req;

			let connectionHandler = (instance, source) => {
				assert.equal(instance.instance_name, instance_def.Name);
				assert.isTrue(source.by_name);
				req.cancel();
				httpServer.removeAllListeners('instance_connection');
				done();
			};

			httpServer.on('instance_connection', connectionHandler);

			req = request({
				url: 'https://example.com',
				proxy: `http://${instance_def.Name}:@127.0.0.1:${httpPort}`,
			})
			.catch(done);
		});

		it(`four requests made to example.com through the group named "foo" should come from instances in the "foo" group`, function (done) {
			(async () => {
				this.timeout(PAGE_LOAD_TIME + (WAIT_FOR_CREATE));

				await httpServerTorPool.add([
					{
						Name: 'instance-4',
						Group: 'foo'
					}
				]);
	
				httpServer.proxy_by_name.mode = "group";
			})()
			.then(async () => {
				let request = require('request-promise').defaults({ proxy: `http://foo:@127.0.0.1:${httpPort}` });

				let names_requested = [];

				let connectionHandler = (instance, source) => {
					names_requested.push(instance.instance_name);

					if (names_requested.length === httpServerTorPool.instances.length) {
						names_requested = _.uniq(names_requested).sort();

						let names_in_group = httpServerTorPool.instances_by_group('foo').map((i) => i.instance_name).sort()

						assert.deepEqual(names_requested, names_in_group);
						httpServer.removeAllListeners('instance_connection');
						done();
					}
				};

				httpServer.on('instance_connection', connectionHandler);

				let i = 0;
				while (i < httpServerTorPool.instances.length) {
					await request({
						url: 'https://example.com'
					});
					i++;
				}
			})
			.then(async () => {
				await httpServerTorPool.remove_by_name('instance-4');
				httpServer.proxy_by_name.mode = "individual";
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
				assert.throws(f, "statusCode=407", "Did not return 407 status code");
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
				assert.throws(f, "statusCode=407", "Did not hang up");
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
