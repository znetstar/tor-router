#!/usr/bin/env node
'use strict';

const dir = __dirname+'/../';

const TorPool = require(dir+'/lib/TorPool.js');
const DockerPool = require(dir+'/lib/DockerPool');
const SOCKS = require(dir+'/lib/SOCKSServer.js');
const DNS = require(dir+'/lib/DNSServer.js');
const url = require('url');
const program = require('commander');


program
  .version('0.0.1')
  .option('-H, --docker [unix:///var/run/docker.sock]', 'Docker Host')
  .option('-j, --tors [1]', 'Number of Tor Instances', parseInt)
  .option('-p, --port [9050]', 'SOCKS Port', parseInt)
  .option('-d, --dns [9053]', 'DNS Port', parseInt)
  .parse(process.argv);

program.docker = program.docker || 'unix:///var/run/docker.sock';
program.tors = program.tors || 1;
program.port = program.port || 9050;
program.dns = program.dns || 9053;

var docker_url = (url.parse(program.docker));

var docker_cfg = {};
if (docker_url.protocol === 'unix:') {
	docker_cfg.socketPath = docker_url.path;
} else if (docker_url.protocol === 'http:' || docker_url.protocol === 'tcp:') {
	docker_cfg.host = docker_url.hostname;
	docker_cfg.port = docker_url.port;
	if (docker_url.protocol !== 'tcp:') {
		docker_cfg.protocol = docker_url.protocol.replace(':', '');
	}
} else {
	throw new Error('Invalid docker protocol: '+docker_url.protocol);
}

var docker = new DockerPool();
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
		let dns = new DNS(pool, true);
		dns.server.serve(program.dns);
	}
	
});