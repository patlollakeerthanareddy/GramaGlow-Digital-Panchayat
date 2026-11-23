const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateProjectBudget,
  evaluateSLAEscalation,
  sortGrievancesBySLA,
  generateNextToken,
  computeResolutionRate,
  buildCsv,
} = require("../server/utils/logic");
const {
  sanitizeText,
  validateGrievanceInput,
  validateGrievanceUpdate,
  validateProjectUpdate,
  validateNoticeInput,
  validateAgendaInput,
} = require("../server/utils/validators");
const { verifyCredentials, issueAdminToken, verifyAdminToken } = require("../server/middleware/auth");

test("evaluateProjectBudget computes predictive final cost, overrun, and risk level", () => {
  const solar = evaluateProjectBudget(250000, 235000, 70);
  assert.equal(solar.spendPct, 94);
  assert.equal(solar.overSpend, true);
  assert.equal(solar.riskLevel, "Critical");
  assert.equal(solar.projectedTotalCost, 335714);
  assert.equal(solar.projectedOverrunInr, 85714);

  const zeroWork = evaluateProjectBudget(100000, 10000, 0);
  assert.equal(zeroWork.projectedTotalCost, 10000);
  assert.equal(zeroWork.projectedOverrunInr, 0);
});

test("evaluateSLAEscalation classifies Escalated (BDO), Warning, Normal, and Closed tiers", () => {
  const esc = evaluateSLAEscalation({ status: "In Progress", slaHoursLeft: 0, ward: 3 });
  assert.equal(esc.tier, "Escalated");
  assert.equal(esc.escalatedTo, "Block Development Officer (BDO)");

  const warn = evaluateSLAEscalation({ status: "Assigned", slaHoursLeft: 8, ward: 6 });
  assert.equal(warn.tier, "Warning");

  const normal = evaluateSLAEscalation({ status: "Submitted", slaHoursLeft: 30, ward: 5 });
  assert.equal(normal.tier, "Normal");

  const closed = evaluateSLAEscalation({ status: "Resolved", slaHoursLeft: 0, ward: 2 });
  assert.equal(closed.tier, "Closed");
});

test("sortGrievancesBySLA pins overdue open tickets first and resolved last", () => {
  const sorted = sortGrievancesBySLA([
    { token: "GP-1", status: "Resolved", slaHoursLeft: 0 },
    { token: "GP-2", status: "Submitted", slaHoursLeft: 26 },
    { token: "GP-3", status: "In Progress", slaHoursLeft: 0 },
    { token: "GP-4", status: "Assigned", slaHoursLeft: 9 },
  ]);
  assert.deepEqual(sorted.map((g) => g.token), ["GP-3", "GP-4", "GP-2", "GP-1"]);
});

test("HMAC-SHA256 admin auth verifies valid tokens and rejects tampered tokens", () => {
  assert.equal(verifyCredentials("sarpanch", "sarpanch2026"), true);
  assert.equal(verifyCredentials("sarpanch", "wrongpass"), false);
  const tok = issueAdminToken("sarpanch");
  assert.equal(verifyAdminToken(tok).role, "sarpanch_admin");
  assert.equal(verifyAdminToken(`${tok}tampered`), null);
});

test("buildCsv escapes quotes and neutralizes spreadsheet formula injection", () => {
  const csv = buildCsv(["Title", "Notes"], [['Road "A"', "=CMD|'/C calc'!A0"]]);
  assert.ok(csv.includes('"Road ""A"""'));
  assert.ok(csv.includes("'=CMD|'/C calc'!A0"));
});

test("validators sanitize XSS and enforce strict schema boundaries", () => {
  assert.equal(sanitizeText("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(validateGrievanceInput({ category: "Bad", ward: 99 }).valid, false);
  assert.equal(validateGrievanceUpdate({ status: "In Progress" }).valid, true);
  assert.equal(validateProjectUpdate({ workPct: 90, spent: 300000 }).valid, true);
  assert.equal(validateNoticeInput({ category: "Health", titleEn: "Polio Drive", bodyEn: "Vaccination camp on Sunday at PHC." }).valid, true);
  assert.equal(validateAgendaInput({ title: "Solar lights near ward 7", proposedBy: "Ankit", ward: 7 }).valid, true);
  assert.equal(generateNextToken(1048).token, "GP-1049");
  assert.equal(computeResolutionRate([{ status: "Resolved" }, { status: "Submitted" }]), 50);
});
