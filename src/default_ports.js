/**
 * This module cotains the default ports the application will bind to.
 * @module tor-router/default_ports
 */
module.exports = Object.freeze({
    socks: 9050,
    http: 9080,
    dns: 9053,
    control: 9077,
    controlWs: 9078,
    default_host: null
});