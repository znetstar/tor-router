const shell = require('shelljs');
const fs = require('fs');
const DIR = '/tmp/x';
shell.find(DIR)
	.filter((path) => fs.lstatSync(path).isFile())
	.forEach((file) => {
		
	});