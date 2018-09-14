module.exports = {
    WAIT_FOR_CREATE: 600000,
    PAGE_LOAD_TIME: 60000,
    RETRY_DELAY: 500,
    MAX_ATTEMPTS: 10,
    RETRY_STRATEGY: require('requestretry').RetryStrategies.HTTPOrNetworkError
};