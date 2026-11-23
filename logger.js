const pino = require("pino");

const logger = pino({
  name: "gramaglow-api",
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: {
    service: "gramaglow-digital-panchayat",
    env: process.env.NODE_ENV || "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ["req.headers.authorization", "password", "token"],
    censor: "[REDACTED]",
  },
});

module.exports = { logger };
