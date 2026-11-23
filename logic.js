const VALID_STATUS_ORDER = ["Submitted", "Assigned", "In Progress", "Resolved"];

/**
 * Evaluates physical vs financial progress and forecasts projected final cost
 * using linear burn-rate extrapolation (spent / (workPct / 100)).
 */
function evaluateProjectBudget(sanctioned, spent, workPct) {
  if (typeof sanctioned !== "number" || sanctioned <= 0) {
    return {
      spendPct: 0,
      overSpend: false,
      variancePct: 0,
      riskLevel: "Normal",
      projectedTotalCost: 0,
      projectedOverrunInr: 0,
      efficiencyIndex: 1,
    };
  }
  const safeSpent = Math.max(0, Number(spent) || 0);
  const safeWork = Math.min(100, Math.max(0, Number(workPct) || 0));
  const spendPct = Math.round((safeSpent / sanctioned) * 100);
  const variancePct = spendPct - safeWork;
  const overSpend = variancePct > 0;

  let riskLevel = "Normal";
  if (variancePct >= 15) riskLevel = "Critical";
  else if (variancePct > 0) riskLevel = "Warning";

  // Predictive Cost-to-Complete Forecasting (Earned Value Estimate at Completion)
  const projectedTotalCost = safeWork > 0 ? Math.round((safeSpent / safeWork) * 100) : safeSpent;
  const projectedOverrunInr = Math.max(0, projectedTotalCost - sanctioned);
  const efficiencyIndex = spendPct > 0 ? Number((safeWork / spendPct).toFixed(2)) : 1;

  return {
    spendPct,
    overSpend,
    variancePct,
    riskLevel,
    projectedTotalCost,
    projectedOverrunInr,
    efficiencyIndex,
  };
}

function evaluateSLAEscalation(grievance) {
  if (!grievance || grievance.status === "Resolved") {
    return { tier: "Closed", escalatedTo: null, isOverdue: false, hoursRemaining: 0 };
  }
  const hours = Math.max(0, Number(grievance.slaHoursLeft ?? 48));
  if (hours === 0) {
    return {
      tier: "Escalated",
      escalatedTo: "Block Development Officer (BDO)",
      isOverdue: true,
      hoursRemaining: 0,
    };
  }
  if (hours <= 12) {
    return {
      tier: "Warning",
      escalatedTo: "Sarpanch Priority Desk",
      isOverdue: false,
      hoursRemaining: hours,
    };
  }
  return {
    tier: "Normal",
    escalatedTo: `Ward ${grievance.ward} Member`,
    isOverdue: false,
    hoursRemaining: hours,
  };
}

function sortGrievancesBySLA(grievances) {
  return [...grievances].sort((a, b) => {
    const aOpen = a.status !== "Resolved";
    const bOpen = b.status !== "Resolved";
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen && bOpen) return (a.slaHoursLeft ?? 48) - (b.slaHoursLeft ?? 48);
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
}

function generateNextToken(currentCounter) {
  const base = Number.isInteger(currentCounter) && currentCounter >= 1000 ? currentCounter : 1048;
  const nextCounter = base + 1;
  return { token: `GP-${nextCounter}`, nextCounter };
}

function computeResolutionRate(grievances) {
  if (!Array.isArray(grievances) || grievances.length === 0) return 0;
  const resolved = grievances.filter((g) => g.status === "Resolved").length;
  return Math.round((resolved / grievances.length) * 100);
}

function toCsvCell(value) {
  const str = String(value ?? "");
  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function buildCsv(headers, rows) {
  const headerLine = headers.map(toCsvCell).join(",");
  const dataLines = rows.map((row) => row.map(toCsvCell).join(","));
  return [headerLine, ...dataLines].join("\r\n") + "\r\n";
}

module.exports = {
  VALID_STATUS_ORDER,
  evaluateProjectBudget,
  evaluateSLAEscalation,
  sortGrievancesBySLA,
  generateNextToken,
  computeResolutionRate,
  toCsvCell,
  buildCsv,
};
