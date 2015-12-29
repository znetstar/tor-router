'use strict';

const dns = require('native-dns');
const async = require('async');
const winston = require('winston');
const HOSTS = require('./hosts');

const DNSServer = (function () {
	const SERVER = Symbol('server');
	const POOL = Symbol('pool');
	const TOR_ALL_DOMAINS = Symbol('all domains');
	const DEFAULT_DNS = Symbol('def dns');
	return class DNSServer {
		constructor(tor_pool, all_domains, default_dns) {
			if (!tor_pool) 
				throw (new Error('no tor pool'));
			this[SERVER] = dns.createUDPServer();
			this[POOL] = tor_pool;
			this[TOR_ALL_DOMAINS] = !!all_domains;
			this[DEFAULT_DNS] = default_dns || { address: '8.8.8.8', port: 53, type: 'udp' };
			var dns_srv = this;
			this[SERVER].on('listening', function () {
				
			})
			this[SERVER].on('request', function (req, res) {
				async.each(req.question, function (question, next) {
					if (question.name.split('.').slice(-1).shift() === 'onion' || dns_srv[TOR_ALL_DOMAINS])
						var srv = { address: dns_srv[POOL].next().host, port: dns_srv[POOL].next().dns_port, type: 'udp' };
					else
						var srv = dns_srv[DEFAULT_DNS];

					var hosts_result = dns_srv.resolve(question.name);
					if (hosts_result && ((hosts_result && hosts_result[0]) !== question.name)) {
					  res.answer.push(dns.A({
							name: hosts_result[1],
							address: hosts_result[0],
							ttl: 600,
						}));
						res.send();
						return;
					}

					var $req = dns.Request({
						question: question,
						server: srv,
						timeout: 1000,
					});

					$req.once('timeout', function () {
						res.send();
						next && next();
						next = null;
					});

					$req.on('message', function (err, answer) {
						answer.answer.forEach((record) => winston.info('[DNS]: '+question.name+' => '+record.address));
						answer.answer.forEach((record) => res.answer.push(record));
					});

					$req.once('end', function () {
						res.send();
						next && next();
						next = null;
					});

					$req.send();
				}, function () {

				});
			});
			this[SERVER].on('error', function (err){
				winston.error(err.stack);
			});
		}

		get server() {
			return this[SERVER];
		}

		resolve($host) {
			let result = HOSTS.filter((line) => line.slice(1).some((host) => host === $host))[0];
			return result || null;
		}
	};
})();

module.exports = DNSServer