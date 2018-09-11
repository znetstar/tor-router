
const _ = require('lodash');
const assert = require('chai').assert;
const Promise = require('bluebird');
const nconf = require('nconf');
const rpc = require('jrpc2');
const getPort = require('get-port');

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));
const { ControlServer } = require('../');
const { WAIT_FOR_CREATE } = require('./constants');

let rpcControlServer = new ControlServer(null, nconf);
let rpcControlPort;
let rpcClient;
describe('ControlServer - RPC Interface', function () {
	before('setup control server', async function () {
		rpcControlPort = await getPort();
		await rpcControlServer.listen(rpcControlPort);
		rpcClient = new rpc.Client(new rpc.tcpTransport({ port: rpcControlPort, hostname: 'localhost' }));
		Promise.promisifyAll(rpcClient);
	});

	describe('#createInstances(number_of_instances)', function () {
		this.timeout(WAIT_FOR_CREATE*2);
		it('should create an instance', async function () {
			await rpcClient.invokeAsync('createInstances', [{ Name: 'instance-1', Group: "foo" }]);		
		});
	});

	describe('#queryInstanceNames()', function () {
		it("should have an instance named \"instance-1\"", async function () {
			let raw = await rpcClient.invokeAsync('queryInstanceNames', [ ]);

			let instances = JSON.parse(raw).result;

			assert.deepEqual(instances, [ 'instance-1' ]);
		});
	});

	describe('#queryGroupNames()', function () {
		it("should have a group named \"foo\"", async function () {
			let raw = await rpcClient.invokeAsync('queryGroupNames', [ ]);

			let groups = JSON.parse(raw).result;

			assert.deepEqual(groups, [ 'foo' ]);
		});
	});

	describe('#queryInstancesByGroup()', function () {
		it("should return an instance named \"instance-1\"", async function () {
			let raw = await rpcClient.invokeAsync('queryInstancesByGroup', [ 'foo' ]);

			let instances = JSON.parse(raw).result;

			assert.equal(instances.length, 1);
			assert.ok(instances[0]);
			assert.equal(instances[0].name, 'instance-1');
		});
	});

	describe('#queryInstances()', function () {
		this.timeout(3000);
		it('should return a list of instances', async function () {
			let raw = await rpcClient.invokeAsync('queryInstances', []);

			let instances = JSON.parse(raw).result;

			assert.isArray(instances, 'Did not return an array');
			assert.isNotEmpty(instances, 'Returned an empty array');
			assert.isTrue(instances.every((instance) => ( typeof(instance.name) !== 'undefined' ) && ( instance.name !== null )), 'Objects were not valid');
		});
	});

	describe('#addInstances(definitions)', function () {
		this.timeout(WAIT_FOR_CREATE);
		it("should add an instance based on a defintion", async function () {
			let def = {
				Name: 'instance-2',
				Group: 'bar'
			};
			await rpcClient.invokeAsync('addInstances', [ def ]);
		});

		it("tor pool should now contain and instance that has the same name as the name specified in the defintion", function () {
			assert.ok(rpcControlServer.torPool.instance_by_name('instance-2'));
		});
	});

	describe('#queryInstanceByName(instance_name)', function () {
		this.timeout(3000);
		it('should return a single instance by name', async function () {
			let raw = await rpcClient.invokeAsync('queryInstanceByName', ['instance-1']);
			
			let instance = JSON.parse(raw).result;
			
			assert.isOk(instance);
		});
	});

	describe('#queryInstanceAt(index)', function () {
		this.timeout(3000);
		it('should return a single instance by index', async function () {
			let raw = await rpcClient.invokeAsync('queryInstanceAt', [0]);
			
			let instance = JSON.parse(raw).result;
			
			assert.isOk(instance);
		});
	});

	describe('#addInstanceToGroupByName()', function () {
		it(`should add "instance-1" to baz`, async function () {
			await rpcClient.invokeAsync('addInstanceToGroupByName', [ 'baz', "instance-1" ]);
		});

		it('"instance-1" should be added to "baz"', function () {
			assert.include(rpcControlServer.torPool.instances_by_group('baz').map((i) => i.instance_name), "instance-1");
		});

		after('remove from group', function () {
			rpcControlServer.torPool.groups['baz'].remove_by_name('instance-1');
		});
	});

	describe('#addInstanceToGroupAt()', function () {
		it(`should add "instance-1" to baz`, async function () {
			await rpcClient.invokeAsync('addInstanceToGroupAt', [ 'baz', 0 ]);
		});

		it('"instance-1" should be added to "baz"', function () {
			assert.include(rpcControlServer.torPool.instances_by_group('baz').map((i) => i.instance_name), "instance-1");
		});

		after('remove from group', function () {
			rpcControlServer.torPool.groups['baz'].remove_by_name('instance-1');
		});
	});

	describe('#removeInstanceFromGroupByName()', function () {
		before('add to group', function () {
			rpcControlServer.torPool.groups['baz'].add_by_name('instance-1');
		});

		it(`should remove "instance-1" from baz`, async function () {
			await rpcClient.invokeAsync('removeInstanceFromGroupByName', [ 'baz', "instance-1" ]);
		});

		it('"instance-1" should be remove from to "baz"', function () {
			assert.notInclude(rpcControlServer.torPool.instances_by_group('baz').map((i) => i.instance_name), "instance-1");
		});
	});

	describe('#removeInstanceFromGroupAt()', function () {
		before('add to group', function () {
			rpcControlServer.torPool.groups['baz'].add_by_name('instance-1');
		});

		it(`should remove "instance-1" from baz`, async function () {
			await rpcClient.invokeAsync('removeInstanceFromGroupAt', [ 'baz', 0 ]);
		});

		it('"instance-1" should be remove from to "baz"', function () {
			assert.notInclude(rpcControlServer.torPool.instances_by_group('baz').map((i) => i.instance_name), "instance-1");
		});
	});

	
	describe('#newIdentites()', function () {
		this.timeout(3000);
		it('should request new identities for all instances', async function () {
			await rpcClient.invokeAsync('newIdentites', []);		
		});
	});

	describe('#newIdentityByName(instance_name)', function () {
		this.timeout(3000);
		it('should request new identities for all instances', async function () {
			await rpcClient.invokeAsync('newIdentityByName', ['instance-1']);		
		});
	});

	describe('#newIdentityAt(index)', function () {
		this.timeout(3000);
		it('should request new identities for all instances', async function () {
			await rpcClient.invokeAsync('newIdentityAt', [0]);		
		});
	});


	describe('#newIdentitiesByGroup()', function () {
		it(`should get new identites for all instances in group`, async function () {
			await rpcClient.invokeAsync('newIdentitiesByGroup', [ 'foo' ]);
		});
	});

	describe("#setTorConfig(config_object)", function () {
		this.timeout(3000);
		it('should set several config variables on all instances', async function () {
			await rpcClient.invokeAsync('setTorConfig', [ { TestSocks: 1, ProtocolWarnings: 1 } ]);
		});

		it('all instances should have the modified variables', async function() {
			await Promise.all(rpcControlServer.torPool.instances.map(async (instance) => {
				let var1 = await instance.get_config('TestSocks');
				let var2 = await instance.get_config('ProtocolWarnings');

				assert.equal(var1, 1);
				assert.equal(var2, 1);
			}));
		});

		after('unset config variables', async function () {
			await rpcControlServer.torPool.set_config_all('TestSocks', 0);
			await rpcControlServer.torPool.set_config_all('ProtocolWarnings', 0);
		});
	});

	describe('#setDefaultTorConfig(object)', function () {
		it('should set the default config of new instances', async function () {
			this.timeout(3000);
			await rpcClient.invokeAsync('setDefaultTorConfig', [ { TestSocks: 1 } ]);
		});

		it('a new instance should be created with the modified property', async function () {
			this.timeout(WAIT_FOR_CREATE);

			await rpcControlServer.torPool.create_instance({ Name: 'config-test' });
			let values = await rpcControlServer.torPool.instance_by_name('config-test').get_config('TestSocks');

			assert.isNotEmpty(values);
			assert.equal(values[0], "1");
		});

		after('remove instance', async function () {
			this.timeout(10000);
			nconf.set('torConfig', {});
			await rpcControlServer.torPool.remove_by_name('config-test');
		});
	});

	describe('#setTorConfigByGroup()', function () {
		it(`should set the config value on all instances`, async function () {
			await rpcClient.invokeAsync('setTorConfigByGroup', [ 'foo', { 'ProtocolWarnings': 1 } ]);
		});

		it('all instances should have the config value set', async function () {
			let values = _.flatten(await Promise.all(rpcControlServer.torPool.instances_by_group('foo').map((i) => i.get_config('ProtocolWarnings'))));

			assert.isTrue(values.every((v) => v === "1"));
		});

		after('unset config values', async function () {
			rpcControlServer.torPool.set_config_by_group('foo', 'ProtocolWarnings', 0);
		});
	});

	describe('#getDefaultTorConfig()', function () {
		before('set tor config', function () {
			nconf.set('torConfig', { TestSocks: 1 });
		});

		it('should return a tor config with a modified property', async function () {
			this.timeout(6000);
			let raw = await rpcClient.invokeAsync('getDefaultTorConfig', [  ]);
			let config = JSON.parse(raw).result;

			assert.equal(config.TestSocks, 1);
		});

		after('unset property', function () {
			nconf.set('torConfig', {});
		});
	});

	describe('#getLoadBalanceMethod()', function () {
		this.timeout(3000);
		before(function () {
			rpcControlServer.torPool.load_balance_method = 'round_robin';
		});

		it('should return the current load balance method', async function () {
			let raw = await rpcClient.invokeAsync('getLoadBalanceMethod', []);
			let lb_method = JSON.parse(raw).result;
			assert.equal(lb_method, 'round_robin');
		});
	});

	describe('#setLoadBalanceMethod(load_balance_method)', function () {
		this.timeout(3000);

		it('should set the load balance method', async function () {
			await rpcClient.invokeAsync('setLoadBalanceMethod', ['weighted']);
		});

		it('the load balance method should be changed', function () {
			assert.equal(rpcControlServer.torPool.load_balance_method, 'weighted');
		});

		after(function () {
			rpcControlServer.torPool.load_balance_method = 'round_robin';
		});	
	});

	describe("#getInstanceConfigByName(instance_name)", function () {
		this.timeout(3000);

		before('set config property', async function () {
			await rpcControlServer.torPool.instance_by_name('instance-1').set_config('TestSocks', 1);
		});

		it('should retrieve the property from the tor instance', async function () {
			let raw = await rpcClient.invokeAsync('getInstanceConfigByName', ['instance-1', "TestSocks"]);		
			let values = JSON.parse(raw).result;

			assert.isNotEmpty(values);
			assert.equal(values[0], "1");
		});

		after('unset config property', async function () {
			await rpcControlServer.torPool.instance_by_name('instance-1').set_config('TestSocks', 0);
		});
	});

	describe("#getInstanceConfigAt(index)", function () {
		this.timeout(3000);

		before('set config property', async function () {
			await rpcControlServer.torPool.instance_at(0).set_config('TestSocks', 1);
		});

		it('should retrieve the property from the tor instance', async function () {
			let raw = await rpcClient.invokeAsync('getInstanceConfigAt', [0, "TestSocks"]);
			let values = JSON.parse(raw).result;

			assert.isNotEmpty(values);
			assert.equal(values[0], "1");
		});

		after('unset config property', async function () {
			await rpcControlServer.torPool.instance_at(0).set_config('TestSocks', 0);
		});
	});

	describe("#setInstanceConfigByName(instance_name)", function () {
		this.timeout(3000);

		before('set config property', async function () {
			await rpcControlServer.torPool.instance_by_name('instance-1').set_config('TestSocks', 0);
		});

		it('should set the property for the tor instance', async function () {
			await rpcClient.invokeAsync('setInstanceConfigByName', ['instance-1', 'TestSocks', 1]);			
		});

		it('tor instance should have the modified property', async function () {
			let value = await rpcControlServer.torPool.instance_by_name('instance-1').get_config('TestSocks');
			assert.equal(value, 1);
		});

		after('unset config property', async function () {
			await rpcControlServer.torPool.instance_by_name('instance-1').set_config('TestSocks', 0);
		});
	});

	describe("#setInstanceConfigAt(index)", function () {
		this.timeout(3000);

		before('set config property', async function () {
			await rpcControlServer.torPool.instance_at(0).set_config('TestSocks', 0);
		});

		it('should set the property for the tor instance', async function () {
			await rpcClient.invokeAsync('setInstanceConfigAt', [0, 'TestSocks', 1]);			
		});

		it('tor instance should have the modified property', async function () {
			let value = await rpcControlServer.torPool.instance_at(0).get_config('TestSocks');
			assert.equal(value, 1);
		});

		after('unset config property', async function () {
			await rpcControlServer.torPool.instance_at(0).set_config('TestSocks', 0);
		});
	});

	describe('#signalAllInstances(signal)', function () {
		this.timeout(3000);
		it('should signal to all interfaces', async function () {
			await rpcClient.invokeAsync('signalAllInstances', [ 'DEBUG' ]);
		});
	});

	describe('#signalInstanceAt(signal)', function () {
		this.timeout(3000);
		it('should signal to all interfaces', async function () {
			await rpcClient.invokeAsync('signalInstanceAt', [ 0, 'DEBUG' ]);
		});
	});

	describe('#signalAllInstances(signal)', function () {
		this.timeout(3000);
		it('should signal to all interfaces', async function () {
			await rpcClient.invokeAsync('signalInstanceByName', [ 'instance-1', 'DEBUG' ]);
		});
	});

	describe('#signalInstancesByGroup()', function () {
		it(`should get new identites for all instances in group`, async function () {
			await rpcClient.invokeAsync('signalInstancesByGroup', [ 'foo', 'DEBUG' ]);
		});
	});

	describe("#nextInstance()", function () {
		this.timeout(3000);
		let instance_name;
		it('should rotate the 0th item in the instances array', async function () {
			instance_name = rpcControlServer.torPool.instances[0].instance_name;
			await rpcClient.invokeAsync('nextInstance', []);					
		});

		it('0th item in the instances array should be different after nextInstance is called', function () {
			assert.notEqual(rpcControlServer.torPool.instances[0].instance_name, instance_name);
		});
	});

	describe('#nextInstanceByGroup(group)', function () {
		before('add "instance-1" to "foo"', function () {
			rpcControlServer.torPool.add_instance_to_group_by_name('foo', 'instance-2');
		});

		it('should rotate the instances in group "foo"', async function () {
			this.timeout(5000);
			let first_instance_name_before = rpcControlServer.torPool.groups['foo'][0].instance_name;
			await rpcClient.invokeAsync('nextInstanceByGroup', [ 'foo' ]);		
			let first_instance_name_after = rpcControlServer.torPool.groups['foo'][0].instance_name;
			
			assert.notEqual(first_instance_name_after, first_instance_name_before);
		});

		after('remove "instance-1" from "foo"', function () {
			rpcControlServer.torPool.remove_instance_from_group_by_name('foo', 'instance-2');
		})
	});

	var instance_num1, instance_num2, i_num;
	describe('#removeInstanceAt(index)', function () {
		this.timeout(10000);
		it("should remove an instance at the position specified", async function () {
			instance_num1 = rpcControlServer.torPool.instances.length;
			await rpcClient.invokeAsync('removeInstanceAt', [0]);
		});

		it('the tor pool should contain one instance fewer', function () {
			assert.equal(rpcControlServer.torPool.instances.length, (instance_num1 - 1));
		});
	});

	describe('#removeInstanceByName(instance_name)', function () {
		this.timeout(10000);
		it("should remove an instance at the position specified", async function () {
			instance_num2 = rpcControlServer.torPool.instances.length;
			await rpcClient.invokeAsync('removeInstanceByName', [ "instance-1" ]);
		});

		it('the tor pool should contain one instance fewer', function () {
			assert.equal(rpcControlServer.torPool.instances.length, (instance_num2 - 1));
		});
	});

	describe('#closeInstances()', function () {
		this.timeout(10000);
		it('should shutdown all instances', async function () {
			instance_num = rpcControlServer.torPool.instances.length;
			await rpcClient.invokeAsync('closeInstances', [ ]);	
		});

		it('no instances should be present in the pool', function () {
			assert.equal(rpcControlServer.torPool.instances.length, 0);
		});
	});

	after('shutdown tor pool', async function () {
		this.timeout(10000);
		await rpcControlServer.torPool.exit();
	});	
});