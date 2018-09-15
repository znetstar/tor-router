const { Provider } = require('nconf');
const nconf = new Provider();
const getPort = require('get-port');
const { HttpAgent, auth } = require('socksv5');
const { assert } = require('chai');
const _ = require('lodash');
const SocksProxyAgent = require('socks-proxy-agent');

const { TorPool, SOCKSServer, TorProcess } = require('../');
const { WAIT_FOR_CREATE, PAGE_LOAD_TIME, RETRY_DELAY, RETRY_STRATEGY, MAX_ATTEMPTS, SHUTDOWN_DELAY, SHUTDOWN_TIMEOUT } = require('./constants');

const request = require('requestretry').defaults({
	promiseFactory: ((resolver) => new Promise(resolver)),
	maxAttempts: MAX_ATTEMPTS,
	retryStrategy: RETRY_STRATEGY,
	retryDelay: RETRY_DELAY,
	timeout: PAGE_LOAD_TIME
});

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

describe('SOCKSServer', function () {
	describe('#handleConnection(socket)', function () {
		let socksPort;
		let socksServerTorPool;
		let socksServer;

		before('start up server', async function (){
			socksServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
			socksServer = new SOCKSServer(socksServerTorPool, null, false);

			this.timeout(WAIT_FOR_CREATE);
	
			await socksServerTorPool.create(1);
			socksPort = await getPort();
	
			await socksServer.listen(socksPort);
		});

		it('should service a request for example.com', async function () {
			this.timeout(PAGE_LOAD_TIME);

			await request({
				url: 'http://example.com',
				agent: new HttpAgent({
					proxyHost: '127.0.0.1',
					proxyPort: socksPort,
					localDNS: false,
					auths: [ auth.None() ]
				})
			});
		});

		it('should emit the "instance_connection" event', function (done) {
			this.timeout(PAGE_LOAD_TIME);

			let connectionHandler = (instance, source) => {
				assert.instanceOf(instance, TorProcess);
				assert.isObject(source);
				
				socksServer.removeAllListeners('instance_connection');;
				done();
			};

			socksServer.on('instance_connection', connectionHandler);

			request({
				url: 'http://example.com',
				agent: new HttpAgent({
					proxyHost: '127.0.0.1',
					proxyPort: socksPort,
					localDNS: false,
					auths: [ auth.None() ]
				})
			})
			.catch(done)
		});

		after('shutdown server and shutdown tor pool', function (done) {
			this.timeout(SHUTDOWN_TIMEOUT);
			setTimeout(async () => {
				socksServer.close();
				await socksServerTorPool.exit();
				done();
			}, SHUTDOWN_DELAY);
		});
	});
	
	describe('#authenticate_user(username, password)', function () {
		let socksPort;
		let socksServerTorPool;
		let socksServer;
		let instance_def = {
			Name: 'instance-3',
			Group: "foo"
		};

		before('start up server', async function (){
			socksServerTorPool = new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);
			socksServer = new SOCKSServer(socksServerTorPool, null, { deny_unidentified_users: true, mode: "individual" });
	
			this.timeout(WAIT_FOR_CREATE * 3);
			
			await socksServerTorPool.create(2);
			await socksServerTorPool.add(instance_def);

			socksPort = await getPort();
	
			await socksServer.listen(socksPort);
		});

		it(`should service a request for example.com through ${instance_def.Name}`, function (done) {
			this.timeout(PAGE_LOAD_TIME);

			let connectionHandler = (instance, source) => {
				assert.equal(instance.instance_name, instance_def.Name);
				assert.isTrue(source.by_name);
				socksServer.removeAllListeners('instance_connection');
				done();
			};

			socksServer.on('instance_connection', connectionHandler);

			request({
				url: 'http://example.com',
				agent: new HttpAgent({
					proxyHost: '127.0.0.1',
					proxyPort: socksPort,
					localDNS: false,
					auths: [ auth.UserPassword(instance_def.Name, "doesn't mater") ]
				})
			})
			.catch(done);
		});

		it(`four requests made to example.com through the group named "foo" should come from the instances in "foo"`, function (done) {
			(async () => {
				this.timeout((PAGE_LOAD_TIME * 4) + (WAIT_FOR_CREATE));

				await socksServerTorPool.add([
					{
						Name: 'instance-4',
						Group: 'foo'
					}
				]);
			})()
			.then(async () => {
				socksServer.proxy_by_name.mode = "group";


				let names_requested = [];

				let connectionHandler = (instance, source) => {
					names_requested.push(instance.instance_name);

					if (names_requested.length === socksServerTorPool.instances.length) {
						names_requested = _.uniq(names_requested).sort();

						let names_in_group = socksServerTorPool.instances_by_group('foo').map((i) => i.instance_name).sort()

						assert.deepEqual(names_requested, names_in_group);
						socksServer.removeAllListeners('instance_connection');
						done();
					}
				};

				socksServer.on('instance_connection', connectionHandler);

				let i = 0;
				while (i < socksServerTorPool.instances.length) {
					await request({
						url: 'http://example.com',
						agent: new HttpAgent({
							proxyHost: '127.0.0.1',
							proxyPort: socksPort,
							localDNS: false,
							auths: [ auth.UserPassword('foo', "doesn't mater") ]
						})
					});
					i++;
				}
			})
			.then(async () => {
				await socksServerTorPool.remove_by_name('instance-4');
				socksServer.proxy_by_name.mode = "individual";
			})
			.catch(done);
		});

		const regular_request = require('request-promise');

		it(`shouldn't be able to send a request without a username`, async function() {
			let f = () => {};
			try {
				await regular_request({
					url: 'http://example.com',
					agent: new SocksProxyAgent(`socks5h://127.0.0.1:${socksPort}`),
					timeout: PAGE_LOAD_TIME
				});
			} catch (error) {
				f = () => { throw error };
			} finally {
				assert.throws(f);
			}
		});

		it(`shouldn't be able to send a request with an incorrect username`, async function() {
			let f = () => {};
			try {
				await regular_request({
					url: 'http://example.com',
					agent: new SocksProxyAgent(`socks5h://blah-blah-blah:@127.0.0.1:${socksPort}`),
					timeout: PAGE_LOAD_TIME
				});
			} catch (error) {
				f = () => { throw error };
			} finally {
				assert.throws(f);
			}
		});

		after('shutdown server and shutdown tor pool', function (done) {
			this.timeout(SHUTDOWN_TIMEOUT);
			setTimeout(async () => {
				socksServer.close();
				await socksServerTorPool.exit();
				done();
			}, SHUTDOWN_DELAY);
		});
	});
	
});