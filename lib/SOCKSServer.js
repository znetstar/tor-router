'use strict';

var socks = require('socksv5'),
	winston = require('winston'),
	ejs = require('ejs'),
	domain = require('domain'),
	shell = require('shelljs'),
	HOSTS = require('./hosts');

const SOCKSServer = (function () {
	const SERVER = Symbol('server');
	const POOL = Symbol('pool');
	return class SOCKSServer {
		constructor(tor_pool) {
			if (!tor_pool) 
				throw (new Error('no tor pool'));
			var socks_srv = this;
			this[SERVER] = socks.createServer(function (info, accept, deny) {
				if (socks_srv.acl(info)){
					var d = domain.create();
					var socket = accept(true);
					d.on('error', function (err) {
						winston.warn(err.message);
						socket && socket.end();
					});
					d.add(socket);
					d.run(function () {
						socks_srv.connection(info, socket);
					});
				} else {
					deny();
				}
 			});
			this[SERVER].useAuth(socks.auth.None());
			this[POOL] = tor_pool;

		}

		resolve($host) {
			let result = HOSTS.filter((line) => line.slice(1).some((host) => host === $host))[0];
			return result || $host;
		}

		acl(info) {
			return true;
		}

		connection (info, socket) {
				var socks_srv = this;
				var incoming_socket = socket,
						outgoing_socket = null;

				var buffer = Array();

				var onError = function (error) {
					this.incoming_socket && (typeof(this.incoming_socket.end) === 'function') && this.incoming_socket.end();
					this.outgoing_socket && (typeof(this.outgoing_socket.end) === 'function') && this.outgoing_socket.end();
					socks_srv.error(error);
				};
				var onClose = function () {
					if (!buffer)
						return; 
					buffer = void(0);
				};

				incoming_socket.on('error', onError.bind({ incoming_socket: incoming_socket, outgoing_socket: outgoing_socket }));
				incoming_socket.on('data', function (data) {
					if (outgoing_socket) {
						outgoing_socket.write(data);
					} else {
						buffer[buffer.length] = data;
					}
				});

				incoming_socket.on('close', function () {
					outgoing_socket && outgoing_socket.end();
					onClose();
				});

				let srv = socks_srv[POOL].host;

				winston.info(ejs.render("[SOCKS]: <%= info.srcAddr %>:<%= info.srcPort %> => <%= srv.host %>:<%= srv.port %> => <%= info.dstAddr %>:<%= info.dstPort %>", { info: info, srv: srv }));

				info.dstAddr = socks_srv.resolve(info.dstAddr);
				if (info.distAddr === '0.0.0.0') {
					incoming_socket.end();
					return;
				}

				socks.connect({
					host: info.dstAddr,
					port: info.dstPort,
					proxyHost: srv.host,
					proxyPort: srv.port,
					localDNS: false,
					auths: [ socks.auth.None() ]
				}, (function (outgoing) {
					var incoming_socket = this.incoming_socket;
					var buffer = this.buffer;
					outgoing.on('error', onError.bind({ incoming_socket: incoming_socket, outgoing_socket: outgoing }));
					outgoing.on('close', (function () {
						this.incoming_socket && (typeof(this.incoming_socket.end) === 'function') && this.incoming_socket.end();
						onClose();
					}).bind({ incoming_socket: (incoming_socket || null) }));

					outgoing.on('data', function (data){
						incoming_socket && incoming_socket.write(data);
					});

					while (buffer.length > 0) {
						outgoing.write(buffer.shift());
					}

					outgoing_socket = outgoing;
				}).bind({ incoming_socket: incoming_socket, buffer: buffer }));
			}

		error() {

		}

		get server() {
			return this[SERVER];
		}
	};
})();

module.exports = SOCKSServer;