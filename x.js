const S = require('./').SOCKSServer;
const P = require('./').TorPool;

let p = new P('tor', null, require('winston'));
let s = new S(p, require('winston'));

p.create(3, () => {
	s.listen(9050);
});