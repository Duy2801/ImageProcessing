const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({ level: 'INFO', message, timestamp: new Date().toISOString(), ...meta }));
  },
  warn: (message, error = null, meta = {}) => {
    const errorDetails = error ? { error: error.message, stack: error.stack } : {};
    console.warn(JSON.stringify({ level: 'WARN', message, timestamp: new Date().toISOString(), ...errorDetails, ...meta }));
  },
  error: (message, error = null, meta = {}) => {
    const errorDetails = error ? { error: error.message, stack: error.stack } : {};
    console.error(JSON.stringify({ level: 'ERROR', message, timestamp: new Date().toISOString(), ...errorDetails, ...meta }));
  }
};

module.exports = logger;
