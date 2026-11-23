function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=()");
  next();
}

function createRateLimiter({ windowMs = 60000, maxRequests = 50 } = {}) {
  const hits = new Map();

  return function rateLimiter(req, res, next) {
    const key = req.ip || req.socket.remoteAddress || "local";
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((ts) => now - ts < windowMs);

    if (recent.length >= maxRequests) {
      return res.status(429).json({
        error: "Too many requests. Please wait a moment before trying again.",
      });
    }

    recent.push(now);
    hits.set(key, recent);
    return next();
  };
}

module.exports = { securityHeaders, createRateLimiter };
