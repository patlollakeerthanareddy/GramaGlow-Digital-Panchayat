const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../server/server");

let server;
let repoInstance;
let baseUrl;
let adminToken;

test.before(async () => {
  const created = createApp({ dbFilePath: ":memory:" });
  repoInstance = created.repo;
  await new Promise((resolve) => {
    server = created.app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "sarpanch", password: "sarpanch2026" }),
  });
  adminToken = (await login.json()).token;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  repoInstance.close();
});

test("GET /api/bootstrap, /api/metrics, /api/openapi.json, and unknown 404 route", async () => {
  const boot = await fetch(`${baseUrl}/api/bootstrap`);
  assert.equal(boot.status, 200);
  const data = await boot.json();
  assert.equal(data.profile.population, 3420);
  assert.equal(data.wards.length, 8);
  assert.equal(data.grievances[0].sla.tier, "Escalated");
  assert.ok(data.projects.some((p) => p.audit.projectedOverrunInr > 0));

  const metrics = await fetch(`${baseUrl}/api/metrics`);
  assert.equal(metrics.status, 200);
  assert.equal((await metrics.json()).database.wards, 8);

  const spec = await fetch(`${baseUrl}/api/openapi.json`);
  assert.equal(spec.status, 200);
  assert.equal((await spec.json()).openapi, "3.0.3");

  const notFound = await fetch(`${baseUrl}/api/does-not-exist`);
  assert.equal(notFound.status, 404);
});

test("GET /api/events opens SSE stream with text/event-stream content type", async () => {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  controller.abort();
});

test("POST /api/grievances validates input and persists into SQLite", async () => {
  const bad = await fetch(`${baseUrl}/api/grievances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "Unknown", ward: 12 }),
  });
  assert.equal(bad.status, 400);

  const ok = await fetch(`${baseUrl}/api/grievances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "Streetlights",
      ward: 3,
      citizenName: "D Ankit Swamy",
      citizenPhone: "9849025050",
      landmark: "North School Road",
      title: "Broken solar lamp at bus stop",
      description: "Lamp has been dark for two nights near school gate.",
    }),
  });
  assert.equal(ok.status, 201);
  const created = await ok.json();
  assert.match(created.grievance.token, /^GP-\d+$/);
});

test("Admin RBAC protects grievance PATCH, project PATCH, notice POST, and records audit logs", async () => {
  const unauth = await fetch(`${baseUrl}/api/grievances/GP-1048`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Assigned" }),
  });
  assert.equal(unauth.status, 401);

  const patchG = await fetch(`${baseUrl}/api/grievances/GP-1048`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: "In Progress", resolutionNotes: "Ward 5 sanitation team dispatched." }),
  });
  assert.equal(patchG.status, 200);

  const patchP = await fetch(`${baseUrl}/api/projects/P-01`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ workPct: 85, spent: 340000 }),
  });
  assert.equal(patchP.status, 200);
  assert.equal((await patchP.json()).project.workPct, 85);

  const postN = await fetch(`${baseUrl}/api/notices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      category: "Health",
      titleEn: "Free Eye Checkup Camp",
      bodyEn: "District ophthalmologist visiting Pipri PHC this Sunday 10 AM.",
    }),
  });
  assert.equal(postN.status, 201);

  const logsRes = await fetch(`${baseUrl}/api/audit-logs`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(logsRes.status, 200);
  const { logs } = await logsRes.json();
  assert.ok(logs.some((l) => l.action === "UPDATE_GRIEVANCE" && l.entityId === "GP-1048"));
  assert.ok(logs.some((l) => l.action === "UPDATE_PROJECT" && l.entityId === "P-01"));
});

test("Agenda POST, upvote, and CSV transparency exports succeed", async () => {
  const agRes = await fetch(`${baseUrl}/api/agenda`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Build covered bus shelter at Ward 4", proposedBy: "Kotha Vishnu", ward: 4 }),
  });
  assert.equal(agRes.status, 201);
  const agId = (await agRes.json()).agendaItem.id;

  const voteRes = await fetch(`${baseUrl}/api/agenda/${agId}/vote`, { method: "POST" });
  assert.equal(voteRes.status, 200);
  assert.equal((await voteRes.json()).agendaItem.votes, 2);

  const bCsv = await fetch(`${baseUrl}/api/export/budget.csv`);
  assert.equal(bCsv.status, 200);
  const bText = await bCsv.text();
  assert.ok(bText.includes("Projected Overrun (INR)"));

  const gCsv = await fetch(`${baseUrl}/api/export/grievances.csv`);
  assert.equal(gCsv.status, 200);
  assert.ok((await gCsv.text()).includes("Block Development Officer"));
});
