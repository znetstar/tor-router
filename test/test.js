const SocksAgent = require('socks5-http-client/lib/Agent');
const request = require('request');
const async = require('async');
const temp = require('temp');
temp.track();
const TorRouter = require('../');
const getPort = require('get-port');
const dns = require('native-dns');
const io = require('socket.io-client');
const _ = require('lodash');

const get_ip = function (callback) {
	request({
		url: 'http://monip.org',
		agentClass: SocksAgent,
		agentOptions: {
			socksHost: '127.0.0.1',
			socksPort: this.socks_port
		}	
	}, (error, res, body) => {
		var ip;
		if (body)
			ip = body.split('IP : ').pop().split('<').shift();

		callback(error || (!body && new Error("Couldn't grab IP")), ip)
	});
};


// describe('ControlServer', function () {
// 	let ports = {};
// 	var controlServer;
// 	var client;

// 	before((done) => {
// 		async.autoInject({
// 			dnsPort: (cb) => { getPort().then((port) => { cb(null, port); }) },
// 			socksPort: (cb) => { getPort().then((port) => { cb(null, port); }) },
// 			controlPort: (cb) => { getPort().then((port) => { cb(null, port); }) }
// 		}, (error, context) => {
// 			_.extend(ports, context);

// 			done(error);
// 		});
// 	});

// 	controlServer = new TorRouter.ControlServer();

// 	describe('#listen(port, callback)', () => {
// 		it('should listen on the control port', (done) => { controlServer.listen(ports.controlPort, done); })
// 		it('should connect to control server', (done) => {
// 			client = io.connect(`ws://127.0.0.1:${ports.controlPort}`);

// 			client.once('connect_error', (err) => {
// 				console.log(err)
// 				done(err);
// 			});

// 			client.once('connected', () => {
// 				done();
// 			})
// 		});
// 	});

// 	describe('#createTorPool(options)', function () {
// 		it('should create a tor pool', () => {
// 			client.emit('createTorPool', {});
// 		});
// 	});

// 	describe('#createSOCKSServer(port)', function () {
// 		it('should create a socks server', () => {
// 			client.emit('createSOCKSServer', ports.socksPort);
// 		});
// 	});

// 	describe('#createInstances(instances, callback)', function () {
// 		this.timeout(Infinity);
// 		it('should create 1 instance', function (done) {
// 			client.emit('createInstances', 1, (err) => {
// 				if (err) return done(error);

// 				done(((controlServer.torPool.instances.length !== 1) && new Error(`It doesn't have 1 instance`)));
// 			});
// 		})
// 	})

// 	describe('#newIps()', function (done) {
// 		var oldip;
// 		this.timeout(Infinity);
// 		it('should grab the current ip', (done) => {
// 			get_ip.call({ socks_port: ports.socksPort })((error, ip) => {
// 				oldip = ip;
// 				done(error);
// 			});
// 		});
		
// 		it('should change the ip', (done) => {
// 			client.emit('newIps');
// 			setTimeout(() => {
// 				done();
// 			}, 1000);
// 		});

// 		it('should have a diffrent ip', (done) => {
// 			get_ip.call({ socks_port: ports.socksPort })((error, ip) => {
// 				done(((oldip === ip) && new Error("ip hasn't changed")));
// 			});			
// 		});
// 	});

// 	after(() => {
// 		controlServer.torPool.exit();
// 		client.close();
// 		controlServer.close();
// 	});
// });


describe('TorProcess', function () {
	const TOR_DATA_DIR = temp.mkdirSync();
	const TorProcess = TorRouter.TorProcess;

	describe('#create()', function () {
		var tor = new TorProcess('tor', { DataDirectory: TOR_DATA_DIR });

		this.timeout(Infinity);

		it('should create the process without an error', function (done) {
			tor.create(done);
		});

		it('should signal ready when bootstrapped', function (done) {
			tor.once('error', done);
			tor.once('ready', done);
		});

		after('shutdown tor', function () {
			tor.exit();
		});
	});

	describe('#new_ip()', function () {
		var tor = new TorProcess('tor', { DataDirectory: TOR_DATA_DIR });
		var old_ip = null;
		this.timeout(Infinity);


		before('create a tor instance', function (done) {
			tor.once('error', done);
			tor.once('ready', done);
			tor.create();
		});

		it('should have an ip address', function (done) {
			get_ip.call({ socks_port: tor.socks_port }, (err, ip) => {
				if (err) return done(err);

				old_ip = ip;
				done(err);
			});
		});

		it('should have a new ip address after sending HUP', function (done) {
			tor.new_ip();
			setTimeout(() => {
				get_ip.call({ socks_port: tor.socks_port }, (err, ip) => {
					if (err) return done(err);

					if (ip === old_ip)
						done(new Error(`IP hasn't changed ${old_ip} === ${ip}`));
					else
						done();
				});
			}, (10*1000));
		});

		after('shutdown tor', function () {
			tor.exit();
		});
	});
});

describe('TorPool', function () {
	var TorPool = TorRouter.TorPool;
	var pool = new TorPool('tor');
	describe('#create', function () {
		this.timeout(Infinity);
		it('should create two instances without any problems', function (done) {
			pool.create(2, function (error) {
				if (error) return done(error);
				done((pool.instances.length !== 2) && new Error('pool does not have two instances'));
			});
		});

		after(function () {
			pool.exit();
		});
	});
})

describe('DNSServer', function () {
	var TorPool = TorRouter.TorPool;
	var DNSServer = TorRouter.DNSServer;
 var port;
	var pool = new TorPool('tor');
	var dns_server = new DNSServer(pool);
	describe('#on("request")', function () {
		this.timeout(Infinity);


		before((done) => {
			getPort().then(($port) => {
				port = $port;
				dns_server.serve(port);
				done()
			});
		})

		it('should startup tor', (done) => {

			pool.create(2, done);
		})

		it('should be able to resolve "google.com" ', function (done) {
			
			
			let req = dns.Request({
				question: dns.Question({ name: 'google.com', type: 'A' }),
				server: { address: '127.0.0.1', port: port, type: 'udp' },
				timeout: 5000
			});

			req.on('timeout', () => {
				done && done(new Error("Request timed out"));
				done = null;
			});

			req.on('message', (e, m) => {
				done && done(((!m) || (!m.answer.length)) && new Error('Unable to resolve host'));
				done = null;
			});

			req.send();
		});

		after(function () {
			pool.exit();
			dns_server.close();
		});
	});
});

describe('SOCKSServer', function () {
	var TorPool = TorRouter.TorPool;
	var SOCKSServer = TorRouter.SOCKSServer;

	var pool = new TorPool('tor');
	var socks = new SOCKSServer(pool);
	
	this.timeout(Infinity);

	var port;

	before((done) => {
		getPort().then(($port) => {
			port = $port;
			socks.listen(port, (done));
		});
	})

	describe('#on("connection")', function () {
		var ip;

		it('should startup tor ', (done) => {
			pool.create(2, done);
		})

		it('should get an ip address', function (done) {
			get_ip.call({ socks_port: port }, (err, _ip) => {
				ip = _ip;
				done(err || (!ip && new Error('could not get an ip')))
			});
		});

		it('should have a different ip', function (done) {
			get_ip.call({ socks_port: port }, (err, _ip) => {
				
				done(err || (!ip && new Error('could not get an ip')) || ((_ip === ip) && new Error('IP has not changed')));
			});				
		});

		after(() => {
			pool.exit();
			socks.close();
		});
	});
});

