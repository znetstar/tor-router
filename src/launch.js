const fs = require('fs');

const nconf = require('nconf');
const yargs = require('yargs');
const winston = require('winston')
const Promise = require('bluebird');

const { ControlServer } = require('./');

const package_json = JSON.parse(fs.readFileSync(`${__dirname}/../package.json`, 'utf8'));

async function main(nconf, logger) {
    let instances = nconf.get('instances');
    let socks_port = nconf.get('socksPort');
    let dns_port = nconf.get('dnsPort');
    let http_port = nconf.get('httpPort');
    let control_port = nconf.get('controlPort');

    if (typeof(control_port) === 'boolean') {
        control_port = 9077;
        nconf.set('controlPort', 9077);
    }

    let control = new ControlServer(logger, nconf);

    try {

        if (socks_port) {
            if (typeof(socks_port) === 'boolean') {
                socks_port = 9050;
                nconf.set('socksPort', socks_port);
            }
            control.createSOCKSServer(socks_port);
        }

        if (http_port) {
            if (typeof(http_port) === 'boolean') {
                http_port = 9080;
                nconf.set('httpPort', http_port);
            }
            control.createHTTPServer(http_port);
        }

        if (dns_port) {
            if (typeof(dns_port) === 'boolean') {
                dns_port = 9053;
                nconf.set('dnsPort', dns_port);
            }
            control.createDNSServer(dns_port);
        }

        if (instances) {
            logger.info(`[tor]: starting ${Array.isArray(instances) ? instances.length : instances} tor instances...`)
            await control.torPool.create(instances);
            
            logger.info('[tor]: tor started');
        }

        await control.listen(control_port);
        logger.info(`[control]: control Server listening on ${control_port}`);
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

        if (handleError && error) {
            console.log(error)
            logger.error(`[global]: error shutting down: ${error.message}`);
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
            alias: 'controlPort',
            describe: 'Port the control server will bind to [default: 9077]',
            demand: false
            // ,default: 9077
        },
        j: {
            alias: 'instances',
            describe: 'Number of instances using the default config',
            demand: false
            // ,default: 1
        },
        s: {
            alias: 'socksPort',
            describe: 'Port the SOCKS5 Proxy server will bind to',
            demand: false,
            // ,default: 9050
        },
        d: {
            alias: 'dnsPort',
            describe: 'Port the DNS Proxy server will bind to',
            demand: false
        },
        h: {
            alias: 'httpPort',
            describe: 'Port the HTTP Proxy server will bind to',
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
        }
    });

require(`${__dirname}/../src/nconf_load_env.js`)(nconf);
nconf
    .argv(argv_config);

let nconf_config = nconf.get('config');
if (nconf_config) {
    nconf.file(nconf_config);
}

nconf.defaults(require(`${__dirname}/../src/default_config.js`));

let logLevel = nconf.get('logLevel');

let logger = winston.createLogger({
    level: logLevel,
    format: winston.format.simple(),
    silent: (logLevel === 'null'),
    transports: new (winston.transports.Console)({ level: (logLevel !== 'null' ? logLevel : void(0)), silent: (logLevel === 'null') })
});

module.exports = { main, nconf, logger };