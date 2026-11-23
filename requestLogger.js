const crypto = require("crypto");
const { logger } = require("../utils/logger");

const runtimeMetrics = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  errorResponses: 0,
  byMethod: {},
};

function requestLogger(req, res, next) {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  const startNs = process.hrtime.bigint();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  runtimeMetrics.totalRequests += 1;
  runtimeMetrics.byMethod[req.method] = (runtimeMetrics.byMethod[req.method] || 0) + 1;

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    if (res.statusCode >= 400) {
      runtimeMetrics.errorResponses += 1;
    }

    const logEntry = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip || req.socket.remoteAddress,
    };

    if (res.statusCode >= 500) {
      logger.error(logEntry, "HTTP request failed");
    } else if (res.statusCode >= 400) {
      logger.warn(logEntry, "HTTP client error");
    } else {
      logger.info(logEntry, "HTTP request completed");
    }
  });

  next();
}

function getRuntimeMetrics() {
  return {
    ...runtimeMetrics,
    uptimeSeconds: Math.round(process.uptime()),
  };
}

module.exports = { requestLogger, getRuntimeMetrics };
