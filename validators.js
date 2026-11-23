const ALLOWED_GRIEVANCE_CATEGORIES = ["Streetlights", "Drinking Water", "Sanitation", "Roads"];
const ALLOWED_GRIEVANCE_STATUSES = ["Submitted", "Assigned", "In Progress", "Resolved"];
const ALLOWED_NOTICE_CATEGORIES = ["Gram Sabha", "Agriculture", "Health", "Education"];
const MAX_PHOTO_DATA_URL_BYTES = 2 * 1024 * 1024;

function sanitizeText(input) {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validateGrievanceInput(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Invalid JSON payload."] };
  }

  const category = String(body.category || "").trim();
  if (!ALLOWED_GRIEVANCE_CATEGORIES.includes(category)) {
    errors.push(`Category must be one of: ${ALLOWED_GRIEVANCE_CATEGORIES.join(", ")}.`);
  }

  const ward = Number(body.ward);
  if (!Number.isInteger(ward) || ward < 1 || ward > 8) {
    errors.push("Ward number must be an integer between 1 and 8.");
  }

  const citizenName = sanitizeText(body.citizenName || "");
  if (citizenName.length < 2 || citizenName.length > 80) {
    errors.push("Citizen name must be between 2 and 80 characters.");
  }

  const citizenPhone = String(body.citizenPhone || "").trim();
  if (citizenPhone && !/^[6-9]\d{9}$/.test(citizenPhone)) {
    errors.push("Phone number must be a valid 10-digit Indian mobile number.");
  }

  const landmark = sanitizeText(body.landmark || "");
  if (landmark.length < 3 || landmark.length > 140) {
    errors.push("Landmark / location must be between 3 and 140 characters.");
  }

  const title = sanitizeText(body.title || "");
  if (title.length < 5 || title.length > 140) {
    errors.push("Complaint title must be between 5 and 140 characters.");
  }

  const description = sanitizeText(body.description || "");
  if (description.length < 8 || description.length > 600) {
    errors.push("Description must be between 8 and 600 characters.");
  }

  let photoDataUrl = null;
  if (body.photoDataUrl) {
    const rawPhoto = String(body.photoDataUrl);
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(rawPhoto)) {
      errors.push("Photo must be a valid PNG, JPEG, or WebP image.");
    } else if (Buffer.byteLength(rawPhoto, "utf8") > MAX_PHOTO_DATA_URL_BYTES) {
      errors.push("Uploaded photo exceeds the 2 MB size limit.");
    } else {
      photoDataUrl = rawPhoto;
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return {
    valid: true,
    errors: [],
    data: { category, ward, citizenName, citizenPhone, landmark, title, description, photoDataUrl },
  };
}

function validateGrievanceUpdate(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Invalid JSON payload."] };
  }

  const updates = {};
  if (body.status !== undefined) {
    const status = String(body.status).trim();
    if (!ALLOWED_GRIEVANCE_STATUSES.includes(status)) {
      errors.push(`Status must be one of: ${ALLOWED_GRIEVANCE_STATUSES.join(", ")}.`);
    } else {
      updates.status = status;
    }
  }

  if (body.assignedWard !== undefined) {
    const w = Number(body.assignedWard);
    if (!Number.isInteger(w) || w < 1 || w > 8) {
      errors.push("Assigned ward must be between 1 and 8.");
    } else {
      updates.ward = w;
    }
  }

  if (body.resolutionNotes !== undefined) {
    const notes = sanitizeText(String(body.resolutionNotes));
    if (notes.length > 400) {
      errors.push("Resolution notes cannot exceed 400 characters.");
    } else {
      updates.resolutionNotes = notes;
    }
  }

  if (Object.keys(updates).length === 0 && errors.length === 0) {
    errors.push("Provide at least one field to update (status, assignedWard, or resolutionNotes).");
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true, errors: [], data: updates };
}

function validateProjectUpdate(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Invalid JSON payload."] };
  }

  const updates = {};
  if (body.workPct !== undefined) {
    const workPct = Number(body.workPct);
    if (!Number.isFinite(workPct) || workPct < 0 || workPct > 100) {
      errors.push("Work progress percentage must be between 0 and 100.");
    } else {
      updates.workPct = Math.round(workPct);
    }
  }

  if (body.spent !== undefined) {
    const spent = Number(body.spent);
    if (!Number.isFinite(spent) || spent < 0 || spent > 50000000) {
      errors.push("Spent amount must be a valid non-negative number.");
    } else {
      updates.spent = Math.round(spent);
    }
  }

  if (Object.keys(updates).length === 0 && errors.length === 0) {
    errors.push("Provide workPct and/or spent to update.");
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true, errors: [], data: updates };
}

function validateNoticeInput(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Invalid JSON payload."] };
  }

  const category = String(body.category || "").trim();
  if (!ALLOWED_NOTICE_CATEGORIES.includes(category)) {
    errors.push(`Notice category must be one of: ${ALLOWED_NOTICE_CATEGORIES.join(", ")}.`);
  }

  const titleEn = sanitizeText(body.titleEn || "");
  if (titleEn.length < 5 || titleEn.length > 160) {
    errors.push("Notice title must be between 5 and 160 characters.");
  }

  const bodyEn = sanitizeText(body.bodyEn || "");
  if (bodyEn.length < 10 || bodyEn.length > 700) {
    errors.push("Notice description must be between 10 and 700 characters.");
  }

  const titleHi = sanitizeText(body.titleHi || titleEn);
  const bodyHi = sanitizeText(body.bodyHi || bodyEn);
  const scriptHi = sanitizeText(body.scriptHi || bodyHi);

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], data: { category, titleEn, titleHi, bodyEn, bodyHi, scriptHi } };
}

function validateAgendaInput(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Invalid JSON payload."] };
  }
  const title = sanitizeText(body.title || "");
  if (title.length < 5 || title.length > 140) {
    errors.push("Agenda topic must be between 5 and 140 characters.");
  }
  const proposedBy = sanitizeText(body.proposedBy || "");
  if (proposedBy.length < 2 || proposedBy.length > 60) {
    errors.push("Proposer name must be between 2 and 60 characters.");
  }
  const ward = Number(body.ward);
  if (!Number.isInteger(ward) || ward < 1 || ward > 8) {
    errors.push("Ward must be between 1 and 8.");
  }
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], data: { title, proposedBy, ward } };
}

module.exports = {
  ALLOWED_GRIEVANCE_CATEGORIES,
  ALLOWED_GRIEVANCE_STATUSES,
  ALLOWED_NOTICE_CATEGORIES,
  sanitizeText,
  validateGrievanceInput,
  validateGrievanceUpdate,
  validateProjectUpdate,
  validateNoticeInput,
  validateAgendaInput,
};
