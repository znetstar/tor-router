module.exports = {
    WAIT_FOR_CREATE: 600000,
    PAGE_LOAD_TIME: 75000,
    RETRY_DELAY: 5000,
    MAX_ATTEMPTS: 15,
    RETRY_STRATEGY: require('requestretry').RetryStrategies.HTTPOrNetworkError,
    SHUTDOWN_DELAY: 5000,
    SHUTDOWN_TIMEOUT: (this.SHUTDOWN_DELAY * 2)
};