const nconf = require('nconf');
const assert = require('chai').assert;
const Promise = require('bluebird');
const _ = require('lodash');

const { TorPool } = require('../');
const { WAIT_FOR_CREATE } = require('./constants');

nconf.use('memory');
require(`${__dirname}/../src/nconf_load_env.js`)(nconf);		
nconf.defaults(require(`${__dirname}/../src/default_config.js`));

describe('TorPool', function () {
	const torPoolFactory = () => new TorPool(nconf.get('torPath'), {}, nconf.get('parentDataDirectory'), 'round_robin', null);

	describe('#create_instance(instance_defintion)', function () {
		let instance_defintion = {
			Name: 'instance-1',
			Config: {
				ProtocolWarnings: 1
			}
		};

		let torPool;
		before('create tor pool', () => { torPool = torPoolFactory(); })

		it('should create one tor instance based on the provided definition', async function () {
			this.timeout(WAIT_FOR_CREATE);
			await torPool.create_instance(instance_defintion);
		});

		it('one instance should exist in the instances collection', function () {
			assert.equal(1, torPool.instances.length);
		});

		it('the created instance should have the defintion properties as the input definition', function () {
			assert.deepEqual(instance_defintion, torPool.instances[0].definition);
		});

		it('the created instance should have the same config properties specified in the definiton', async function () {
			let value = await torPool.instances[0].get_config('ProtocolWarnings');
			assert.equal(value, instance_defintion.Config.ProtocolWarnings);
		});

		after('shutdown tor pool', async function () {
			torPool.exit();
		});
	});

	describe('#add(instance_defintions)', function () {
		var instance_defintions = [
			{ Name: 'instance-1', Config: { ProtocolWarnings: 1} },
			{ Name: 'instance-2', Config: { ProtocolWarnings: 1 } }
		];

		let torPool;
		before('create tor pool', () => { torPool = torPoolFactory(); })

		it('should create instances from several instance definitions', async function () {
			this.timeout(WAIT_FOR_CREATE*2);
			await torPool.add(_.cloneDeep(instance_defintions))
		});

		it('2 instances should exist in the pool', function () {
			assert.equal(2, torPool.instances.length);
		});

		it('the created instances should have the same defintion properties as the input definitions', function () {
			let live_instance_definitions = torPool.instances.map((instance) => { 
				let def_clone = _.cloneDeep(instance.definition);
				delete def_clone.Config.DataDirectory;
				return def_clone;
			}).sort((a,b) => (a.Name > b.Name) ? 1 : ((b.Name > a.Name) ? -1 : 0));
			
			assert.deepEqual(instance_defintions, live_instance_definitions);
		});

		it('the created instances should have the same config properties specified in the definiton', async function () {
			this.timeout(10000);

			let values = await Promise.all(torPool.instances.map((instance) => instance.get_config('ProtocolWarnings')));
			values = _.flatten(values);
			assert.isTrue( values.every((value) => value === "1") );
		});

		after('shutdown tor pool', async function () {
			await torPool.exit();
		});
	});

	describe('#create(number_of_instances)', function () {
		let torPool;

		before('create tor pool', () => { 
			torPool = torPoolFactory(); 
			torPool.default_tor_config = { TestSocks: 1 };
		})

		it('should create 2 instances with the default config', async function () {
			this.timeout(WAIT_FOR_CREATE*2);
			await torPool.create(2);
		});

		it('2 instances should exist in the pool', function () {
			assert.equal(2, torPool.instances.length);
		});

		it('the created instances should have the same config properties specified in the default config', async function () {
			this.timeout(10000);

			let values = await Promise.all(torPool.instances.map((instance) => instance.get_config('TestSocks')));
			values = _.flatten(values);
			assert.isTrue( values.every((value) => value === "1") );
		});

		after('shutdown tor pool', async function () {
			torPool.default_tor_config = {};
			await torPool.exit();
		});
	});

	let torPool;
	describe('#next()', function () {
		before('create tor pool', () => { torPool = torPoolFactory(); })

		before('create tor instances', async function () {
			this.timeout(WAIT_FOR_CREATE * 3);
			await torPool.add([
				{
					Name: 'instance-1',
					Weight: 50
				},
				{
					Name: 'instance-2',
					Weight: 25
				},
				{
					Name: 'instance-3',
					Weight: 2
				}
			]);
		});

		it('result of next should be different if run twice', function () {
			let t1 = torPool.next().instance_name;
			let t2 = torPool.next().instance_name;
			assert.notEqual(t1, t2);
		});
	});

	describe('#instance_by_name(instance_name)', function () {
		it('should retrieve instance by name', function () {
			assert.ok(torPool.instance_by_name('instance-1'));
		});	
	});

	describe('#remove_by_name(instance_name)', function () {
		this.timeout(5000);
		it('should remove instance by name', async function () {
			await torPool.remove_by_name('instance-3');
		});
	});

	describe('#instance_at(index)', function () {
		this.timeout(5000);
		it('should retrieve an instance by id', function () {
			assert.ok(torPool.instance_at(0));
		});
	});

	describe('#remove_at(index)', function () {
		this.timeout(5000);
		it('should remove an instance by id', async function () {
			await torPool.remove_at(1);
		});
	});

	describe('#new_identites()', function () {
		this.timeout(5000);
		it('should signal to retrieve a new identity to all instances', async function () {
			await torPool.new_identites();
		});
	});

	describe('#new_identity_at(index)', function () {
		this.timeout(5000);
		it('should signal to retrieve a new identity identified by index', async function () {
			await torPool.new_identity_at(0);
		});
	});

	describe('#new_identity_by_name(instance_name)', function () {
		this.timeout(5000);
		it('should signal to retrieve a new identity identified by name', async function () {
			await torPool.new_identity_by_name('instance-1');
		});
	});


	describe('#set_config_all(keyword, value)', function () {
		it('should set configuration on all active instances', async function () {
			this.timeout(5000);
			await torPool.set_config_all('TestSocks', 1);
		});

		it('all instances should contain the same changed configuration', async function () {
			this.timeout(5000);

			let values = await Promise.all(torPool.instances.map((instance) => instance.get_config('TestSocks')));
			values = _.flatten(values);
			assert.isTrue( values.every((value) => value === "1") );
		});

		after('unset config options', async function () {
			await torPool.set_config_all('TestSocks', 0);
		});
	});

	describe('#set_config_by_name(name, keyword, value)', function () {
		this.timeout(5000);
		it('should set a configuration property of an instance identified by name', async function () {
			await torPool.set_config_by_name('instance-1', 'ProtocolWarnings', 1);
		});
	});

	describe('#get_config_by_name(name, keyword)', function () {
		this.timeout(5000);
		it('should get retrieve the configuration of an instance identified by name', async function () {
			let value = await torPool.get_config_by_name('instance-1', 'ProtocolWarnings');
			assert.equal(value, 1);
		});
	});

	describe('#set_config_at(index, keyword, value)', function () {
		this.timeout(5000);
		it('should set a configuration property of an instance identified by index', async function () {
			await torPool.set_config_at(0, 'ProtocolWarnings', 0);
		});
	});

	describe('#get_config_at(index, keyword)', function () {
		this.timeout(5000);
		it('should get retrieve the configuration of an instance identified by name', async function () {
			let value = await torPool.get_config_at(0, 'ProtocolWarnings');

			assert.equal(value, 0);
		});
	});

	describe('#signal_all(signal)', function () {
		this.timeout(5000);
		it('should send a signal to all instances', async function () {
			await torPool.signal_all('DEBUG');
		});
	});

	describe('#signal_by_name(name, signal)', async function () {
		this.timeout(5000);
		it('should send a signal to an instance identified by name', async function () {
			await torPool.signal_by_name('instance-1', 'DEBUG');
		});
	});

	describe('#signal_at(index, signal)', function () {
		this.timeout(5000);
		it('should send a signal to an instance identified by index', async function () {
			await torPool.signal_at(0, 'DEBUG');
		});
	});

	after('shutdown tor pool', async function () {
		await torPool.exit();
	});
});