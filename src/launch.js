const fs = require('fs');

const nconf = require('nconf');
const yargs = require('yargs');
const winston = require('winston')
const Promise = require('bluebird');

const { ControlServer } = require('./');
const default_ports = require('./default_ports');

const package_json = JSON.parse(fs.readFileSync(`${__dirname}/../package.json`, 'utf8'));

function extractHost (host) {
    if (typeof(host) === 'number')
        return { hostname: (typeof(default_ports.default_host) === 'string' ? default_ports.default_host : ''), port: host };
    else if (typeof(host) === 'string' && host.indexOf(':') !== -1)
        return { hostname: host.split(':').shift(), port: Number(host.split(':').pop()) };
    else
        return null;
}

function assembleHost(host) {
    return `${typeof(host.hostname) === 'string' ? host.hostname : '' }:${host.port}`;
}

async function main(nconf, logger) {
    let instances = nconf.get('instances');
    let socks_host = typeof(nconf.get('socksHost')) !== 'boolean' ? extractHost(nconf.get('socksHost')) : nconf.get('socksHost');
    let dns_host  = typeof(nconf.get('dnsHost')) !== 'boolean' ? extractHost(nconf.get('dnsHost')) : nconf.get('dnsHost');
    let http_host = typeof(nconf.get('httpHost')) !== 'boolean' ? extractHost(nconf.get('httpHost')) : nconf.get('httpHost');
    let control_host = typeof(nconf.get('controlHost')) !== 'boolean' ? extractHost(nconf.get('controlHost')) : nconf.get('controlHost');
    let control_host_ws = typeof(nconf.get('websocketControlHost')) !== 'boolean' ? extractHost(nconf.get('websocketControlHost')) : nconf.get('websocketControlHost');

    if (typeof(control_host) === 'boolean') {
        control_host = extractHost(9077);
        nconf.set('controlHost', assembleHost(control_port));
    }

    if (typeof(control_host_ws) === 'boolean') {
        control_host_ws = extractHost(9078);
        nconf.set('websocketControlPort', assembleHost(control_host_ws));
    }

    let control = new ControlServer(logger, nconf);

    try {
        await control.listenTcp(control_host.port, control_host.hostname);

        if (control_host_ws) {
            control.listenWs(control_host_ws.port, control_host_ws.hostname);
        }

        if (socks_host) {
            if (typeof(socks_host) === 'boolean') {
                socks_host = extractHost(default_ports.socks);
                nconf.set('socksHost', assembleHost(socks_host));
            }
            control.createSOCKSServer(socks_host.port, socks_host.hostname);
        }

        if (http_host) {
            if (typeof(http_host) === 'boolean') {
                http_host = extractHost(default_ports.http);
                nconf.set('httpHost', assembleHost(http_host));
            }
            control.createHTTPServer(http_host.port, http_host.hostname);
        }

        if (dns_host) {
            if (typeof(dns_host) === 'boolean') {
                dns_host = extractHost(default_ports.dns);
                nconf.set('dnsPort', assembleHost(dns_host));
            }
            control.createDNSServer(dns_host.port, dns_host.hostname);
        }

        if (instances) {
            logger.info(`[tor]: starting ${Array.isArray(instances) ? instances.length : instances} tor instance(s)...`)
            await control.torPool.create(instances);
            
            logger.info('[tor]: tor started');
        }
    } catch (error) {
        logger.error(`[global]: error starting application: ${error.stack}`);
        process.exit(1);
    }

    const cleanUp = (async (error) => {
        let thereWasAnExitError = false;
        let { handleError } = this;
        try {
            await Promise.all(control.torPool.instances.map((instance) => instance.exit()));
        } catch (exitError) {
            logger.error(`[global]: error closing tor instances: ${exitError.message}`);
            thereWasAnExitError = true;
        }

        if (error instanceof Error) {
            logger.error(`[global]: error shutting down: ${error.message}`);
        } else {
            error = 0;
        }

        process.exit(Number(Boolean(error || thereWasAnExitError)));
    });

    process.title = 'tor-router';

    process.on('SIGHUP', () => {
        control.torPool.new_identites();
    });

    process.on('exit', cleanUp);
    process.on('SIGINT', cleanUp);
    process.on('uncaughtException', cleanUp.bind({ handleError: true }));
}

let argv_config = 
    yargs
    .version(package_json.version)
    .usage('Usage: tor-router [arguments]')
    .options({
        f: {
            alias: 'config',
            describe: 'Path to a config file to use',
            demand: false
        },
        c: {
            alias: 'controlHost',
            describe: `Host the control server will bind to, handling TCP connections [default: ${default_ports.default_host}:9077]`,
            demand: false
            // ,default: 9077
        },
        w: {
            alias: 'websocketControlHost',
            describe: 'Host the control server will bind to, handling WebSocket connections. If no hostname is specified will bind to localhost',
            demand: false
        },
        j: {
            alias: 'instances',
            describe: 'Number of instances using the default config',
            demand: false
            // ,default: 1
        },
        s: {
            alias: 'socksHost',
            describe: 'Host the SOCKS5 Proxy server will bind to. If no hostname is specified will bind to localhost',
            demand: false,
            // ,default: default_ports.socks
        },
        d: {
            alias: 'dnsHost',
            describe: 'Host the DNS Proxy server will bind to. If no hostname is specified will bind to localhost',
            demand: false
        },
        h: {
            alias: 'httpHost',
            describe: 'Host the HTTP Proxy server will bind to. If no hostname is specified will bind to localhost',
            demand: false
        },
        l: {
            alias: 'logLevel',
            describe: 'Controls the verbosity of console log output. Default level is "info". Set to "verbose" to see all network traffic logged or "null" to disable logging completely [default: info]',
            demand: false
            // ,default: "info"
        },
        p: {
            alias: 'parentDataDirectory',
            describe: 'Parent directory that will contain the data directories for the instances',
            demand: false
        },
        b: {
            alias: "loadBalanceMethod",
            describe: 'Method that will be used to sort the instances between each request. Currently supports "round_robin" and "weighted". [default: round_robin]',
            demand: false
        },
        t: {
            alias: "torPath",
            describe: "Provide the path for the Tor executable that will be used",
            demand: false
        },
        n: {
            alias: 'proxyByName',
            describe: 'Allow connecting to a specific instance identified by the username field when connecting to a proxy',
            demand: false
        }
    });

require(`${__dirname}/../src/nconf_load_env.js`)(nconf);
nconf
    .argv(argv_config);

let nconf_config = nconf.get('config');
if (nconf_config) {
    if (!require('fs').existsSync(nconf_config)) {
        console.error(`[global]: config file "${nconf_config}" does not exist. exiting.`);
        process.exit(1);
    }
    nconf.file(nconf_config);
} else {
    nconf.use('memory');
}

nconf.defaults(require(`${__dirname}/../src/default_config.js`));

let logLevel = nconf.get('logLevel');

let logger = winston.createLogger({
    level: logLevel,
    format: winston.format.simple(),
    silent: (logLevel === 'null'),
    transports: [ new (winston.transports.Console)({ level: (logLevel !== 'null' ? logLevel : void(0)), silent: (logLevel === 'null') }) ]
});

module.exports = { main, nconf, logger };