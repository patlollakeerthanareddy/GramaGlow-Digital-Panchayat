require("dotenv").config();

const path = require("path");
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("./docs/openapi.json");
const { GramaGlowRepository } = require("./db/database");
const { createApiRouter } = require("./routes/api");
const { securityHeaders } = require("./middleware/security");
const { requestLogger } = require("./middleware/requestLogger");
const { GovernanceEventBus } = require("./utils/eventBus");
const { logger } = require("./utils/logger");

function createApp(options = {}) {
  const app = express();
  const repo = new GramaGlowRepository(options.dbFilePath);
  const eventBus = new GovernanceEventBus();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(requestLogger);
  app.use(express.json({ limit: "3mb" }));

  // OpenAPI / Swagger UI Documentation
  app.get("/api/openapi.json", (req, res) => res.json(openapiSpec));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec, { customSiteTitle: "GramaGlow API Docs" }));

  // Mount REST API + SSE Event Stream
  app.use("/api", createApiRouter(repo, eventBus));

  // Static Frontend (Tier 1)
  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.static(publicDir));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    return res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API endpoint not found." });
  });

  app.use((err, req, res, _next) => {
    if (err && err.type === "entity.too.large") {
      return res.status(413).json({ error: "Payload too large. Keep uploaded photos under 2 MB." });
    }
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
      return res.status(400).json({ error: "Malformed JSON request body." });
    }
    logger.error({ err, requestId: req.requestId }, "Unhandled server error");
    return res.status(500).json({ error: "Internal server error." });
  });

  return { app, repo, eventBus };
}

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  const { app, repo } = createApp();
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT, docs: `http://localhost:${PORT}/api/docs` }, "GramaGlow server started");
  });

  const shutdown = () => {
    logger.info("Shutting down GramaGlow server gracefully");
    server.close(() => {
      repo.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { createApp };
