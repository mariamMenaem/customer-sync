function log(level, event, metadata = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...metadata,
    }),
  );
}

module.exports = {
  info(event, metadata) {
    log("info", event, metadata);
  },

  warn(event, metadata) {
    log("warn", event, metadata);
  },

  error(event, metadata) {
    log("error", event, metadata);
  },
};
