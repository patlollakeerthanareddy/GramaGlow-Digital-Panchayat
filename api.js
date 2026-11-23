const express = require("express");
const { verifyCredentials, issueAdminToken, requireAdminAuth } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/security");
const { getRuntimeMetrics } = require("../middleware/requestLogger");
const {
  evaluateProjectBudget,
  evaluateSLAEscalation,
  sortGrievancesBySLA,
  computeResolutionRate,
  buildCsv,
} = require("../utils/logic");
const {
  validateGrievanceInput,
  validateGrievanceUpdate,
  validateProjectUpdate,
  validateNoticeInput,
  validateAgendaInput,
} = require("../utils/validators");

function enrichGrievance(g) {
  return { ...g, sla: evaluateSLAEscalation(g) };
}

function createApiRouter(repo, eventBus) {
  const router = express.Router();
  const writeLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 45 });

  router.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "GramaGlow DigitalPanchayat API",
      database: "SQLite3 (WAL)",
      liveStreams: eventBus ? eventBus.getActiveClientCount() : 0,
      timestamp: new Date().toISOString(),
    });
  });

  // Real-Time Server-Sent Events (SSE) Stream
  router.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected" })}\n\n`);

    eventBus.addClient(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(keepAlive);
        eventBus.removeClient(res);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      eventBus.removeClient(res);
    });
  });

  router.get("/metrics", (req, res) => {
    const grievances = repo.getGrievances();
    const overdueCount = grievances.filter((g) => g.status !== "Resolved" && g.slaHoursLeft === 0).length;
    res.json({
      runtime: getRuntimeMetrics(),
      database: repo.getDatabaseStats(),
      liveStreams: eventBus ? eventBus.getActiveClientCount() : 0,
      governance: {
        resolutionRatePct: computeResolutionRate(grievances),
        overdueEscalatedTickets: overdueCount,
      },
    });
  });

  router.get("/bootstrap", (req, res) => {
    const overview = repo.getOverview();
    const projects = repo.getProjects().map((p) => ({
      ...p,
      audit: evaluateProjectBudget(p.sanctioned, p.spent, p.workPct),
    }));
    const grievances = sortGrievancesBySLA(repo.getGrievances()).map(enrichGrievance);
    const resolutionRate = computeResolutionRate(grievances);

    res.json({
      ...overview,
      notices: repo.getNotices(),
      projects,
      grievances,
      agendaItems: repo.getAgendaItems(),
      metrics: {
        population: overview.profile.population,
        totalWards: overview.profile.totalWards,
        totalSanctioned: projects.reduce((acc, p) => acc + p.sanctioned, 0),
        resolutionRate,
      },
    });
  });

  router.post("/auth/login", writeLimiter, (req, res) => {
    const { username, password } = req.body || {};
    if (!verifyCredentials(username, password)) {
      return res.status(401).json({ error: "Invalid Sarpanch credentials." });
    }
    const token = issueAdminToken(username);
    repo.logAudit("sarpanch", "ADMIN_LOGIN", "session", "sarpanch", "Signed in via HMAC-SHA256");
    return res.json({
      token,
      user: { username: "sarpanch", role: "sarpanch_admin", displayName: "Smt. Savitri Devi" },
    });
  });

  router.get("/audit-logs", requireAdminAuth, (req, res) => {
    res.json({ logs: repo.getAuditLogs(30) });
  });

  router.get("/notices", (req, res) => {
    res.json({ notices: repo.getNotices(req.query.category) });
  });

  router.post("/notices", writeLimiter, requireAdminAuth, (req, res) => {
    const check = validateNoticeInput(req.body);
    if (!check.valid) return res.status(400).json({ error: check.errors[0], details: check.errors });
    const created = repo.addNotice(check.data, req.adminUser.sub);
    eventBus.broadcast("notice_published", created);
    return res.status(201).json({ notice: created });
  });

  router.get("/projects", (req, res) => {
    const projects = repo.getProjects().map((p) => ({
      ...p,
      audit: evaluateProjectBudget(p.sanctioned, p.spent, p.workPct),
    }));
    res.json({ projects });
  });

  router.patch("/projects/:id", writeLimiter, requireAdminAuth, (req, res) => {
    const check = validateProjectUpdate(req.body);
    if (!check.valid) return res.status(400).json({ error: check.errors[0], details: check.errors });
    const updated = repo.updateProject(req.params.id, check.data, req.adminUser.sub);
    if (!updated) return res.status(404).json({ error: "Project not found." });
    const enriched = { ...updated, audit: evaluateProjectBudget(updated.sanctioned, updated.spent, updated.workPct) };
    eventBus.broadcast("project_updated", enriched);
    return res.json({ project: enriched });
  });

  router.get("/grievances", (req, res) => {
    const sorted = sortGrievancesBySLA(repo.getGrievances(req.query.status)).map(enrichGrievance);
    res.json({ grievances: sorted });
  });

  router.post("/grievances", writeLimiter, (req, res) => {
    const check = validateGrievanceInput(req.body);
    if (!check.valid) return res.status(400).json({ error: check.errors[0], details: check.errors });
    const created = enrichGrievance(repo.createGrievance(check.data));
    eventBus.broadcast("grievance_created", created);
    return res.status(201).json({ grievance: created });
  });

  router.patch("/grievances/:token", writeLimiter, requireAdminAuth, (req, res) => {
    const check = validateGrievanceUpdate(req.body);
    if (!check.valid) return res.status(400).json({ error: check.errors[0], details: check.errors });
    const updated = repo.updateGrievance(req.params.token, check.data, req.adminUser.sub);
    if (!updated) return res.status(404).json({ error: "Grievance token not found." });
    const enriched = enrichGrievance(updated);
    eventBus.broadcast("grievance_updated", enriched);
    return res.json({ grievance: enriched });
  });

  router.get("/agenda", (req, res) => {
    res.json({ agendaItems: repo.getAgendaItems() });
  });

  router.post("/agenda", writeLimiter, (req, res) => {
    const check = validateAgendaInput(req.body);
    if (!check.valid) return res.status(400).json({ error: check.errors[0], details: check.errors });
    const created = repo.addAgendaItem(check.data);
    eventBus.broadcast("agenda_updated", created);
    return res.status(201).json({ agendaItem: created });
  });

  router.post("/agenda/:id/vote", writeLimiter, (req, res) => {
    const updated = repo.upvoteAgendaItem(req.params.id);
    if (!updated) return res.status(404).json({ error: "Agenda item not found." });
    eventBus.broadcast("agenda_updated", updated);
    return res.json({ agendaItem: updated });
  });

  router.get("/export/budget.csv", (req, res) => {
    const projects = repo.getProjects();
    const headers = [
      "Project ID", "Title", "Wards", "Sanctioned (INR)", "Spent (INR)",
      "Work Completed (%)", "Funds Utilized (%)", "Projected Cost (INR)", "Projected Overrun (INR)", "Audit Risk"
    ];
    const rows = projects.map((p) => {
      const audit = evaluateProjectBudget(p.sanctioned, p.spent, p.workPct);
      return [
        p.id, p.titleEn, p.wardEn, p.sanctioned, p.spent,
        p.workPct, audit.spendPct, audit.projectedTotalCost, audit.projectedOverrunInr, audit.riskLevel
      ];
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="pipri-budget-audit.csv"');
    res.send(buildCsv(headers, rows));
  });

  router.get("/export/grievances.csv", (req, res) => {
    const grievances = sortGrievancesBySLA(repo.getGrievances());
    const headers = ["Token", "Category", "Ward", "Status", "SLA Tier", "Escalated To", "Citizen", "Landmark", "Resolution Notes"];
    const rows = grievances.map((g) => {
      const sla = evaluateSLAEscalation(g);
      return [g.token, g.category, g.ward, g.status, sla.tier, sla.escalatedTo || "Closed", g.citizenName, g.landmark, g.resolutionNotes];
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="pipri-grievances-report.csv"');
    res.send(buildCsv(headers, rows));
  });

  return router;
}

module.exports = { createApiRouter };
