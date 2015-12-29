'use strict';

const TorPool = require('../lib/TorPool.js');
const DockerPool = require('../lib/DockerPool');
const SOCKS = require('../lib/SOCKSServer.js');
const DNS = require('../lib/DNSServer.js');
const url = require('url');

const program = {
	docker: process.env.DOCKER || 'tcp://127.0.0.1:2375',
	tors: parseInt(process.env.TORS) || 1,
	port: parseInt(process.env.PORT) || 9050,
	dns: parseInt(process.env.DNS_PORT) || 9053
};

var docker = new DockerPool({ host: (url.parse(program.docker).hostname), port: (url.parse(program.docker).port) });
var pool = new TorPool(program.tors, docker);

process.stdin.resume();
process.on('uncaughtException', function (err) {
	console.error(err.stack);
});

pool.start(function () {
	if (program.port) {
		let socks = new SOCKS(pool);
		socks.server.listen(program.port, function (err) {
			if (err)
				console.error(err);
		});
	}
	if (program.dns) {
		let dns = new DNS(pool);
		dns.server.serve(program.dns);
	}
	
});