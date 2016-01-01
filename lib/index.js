module.exports = {};

(require('shelljs').ls(__dirname).filter((f) => f !== 'index.js')).forEach(function (name) {
	module.exports[name.replace('.js', '')] = require(__dirname+'/'+name);;
})