const shell = require('shelljs');
const HOSTS = shell.cat(process.cwd()+'/config/hosts')
	.split("\n")
	.filter((host) => (host[0] !== '#') && host.trim().length)
	.map((line) => line.split(' '));

module.exports = HOSTS;