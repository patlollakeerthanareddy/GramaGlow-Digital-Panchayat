const crypto = require("crypto");
const { logger } = require("../utils/logger");

function resolveSigningSecret() {
  if (process.env.GRAMAGLOW_SECRET && process.env.GRAMAGLOW_SECRET.trim().length >= 16) {
    return process.env.GRAMAGLOW_SECRET.trim();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL: GRAMAGLOW_SECRET environment variable must be set (min 16 chars) in production.");
  }
  const ephemeral = crypto.randomBytes(32).toString("hex");
  logger.warn("GRAMAGLOW_SECRET not configured; generated ephemeral runtime signing secret for development/test.");
  return ephemeral;
}

const AUTH_SECRET = resolveSigningSecret();
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "sarpanch").trim().toLowerCase();
// Precomputed SHA-256 digest (overridable via ADMIN_PASSWORD_HASH in .env)
const ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH || "32e8797663799a0e4a677af273a75819edd8afb9e3016d53434d1112d158d799";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function verifyCredentials(username, password) {
  if (typeof username !== "string" || typeof password !== "string") return false;
  const givenHash = crypto.createHash("sha256").update(password).digest("hex");
  const expectedBuf = Buffer.from(ADMIN_PASSWORD_HASH, "hex");
  const givenBuf = Buffer.from(givenHash, "hex");
  if (expectedBuf.length !== givenBuf.length) return false;

  return (
    username.trim().toLowerCase() === ADMIN_USERNAME &&
    crypto.timingSafeEqual(givenBuf, expectedBuf)
  );
}

function issueAdminToken(username) {
  const payload = {
    sub: username,
    role: "sarpanch_admin",
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

function verifyAdminToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  const expectedSig = crypto.createHmac("sha256", AUTH_SECRET).update(payloadB64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    if (payload.role !== "sarpanch_admin") return null;
    return payload;
  } catch (err) {
    logger.warn({ err: err.message }, "Malformed admin token payload rejected");
    return null;
  }
}

function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const verified = verifyAdminToken(token);
  if (!verified) {
    return res.status(401).json({ error: "Unauthorized. Valid Sarpanch Admin Bearer token required." });
  }
  req.adminUser = verified;
  return next();
}

module.exports = {
  verifyCredentials,
  issueAdminToken,
  verifyAdminToken,
  requireAdminAuth,
  resolveSigningSecret,
};
