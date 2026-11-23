const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { createSeedData } = require("./seedData");
const { generateNextToken } = require("../utils/logic");
const { logger } = require("../utils/logger");

class GramaGlowRepository {
  constructor(dbFilePath) {
    const resolvedPath =
      dbFilePath || process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "gramaglow.sqlite");

    if (resolvedPath !== ":memory:") {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.dbFilePath = resolvedPath;
    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this._runMigrations();
    this._seedIfEmpty();
  }

  _runMigrations() {
    const schemaSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    this.db.exec(schemaSql);
  }

  _seedIfEmpty() {
    const existing = this.db.prepare("SELECT COUNT(*) AS count FROM village_profile").get();
    if (existing.count > 0) return;

    const seed = createSeedData();
    const seedTransaction = this.db.transaction(() => {
      const p = seed.profile;
      this.db
        .prepare(
          `INSERT INTO village_profile
          (id, name_en, name_hi, district_en, district_hi, population, total_wards,
           sarpanch_name_en, sarpanch_name_hi, sarpanch_phone, secretary_name_en, secretary_name_hi, secretary_phone)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          p.nameEn, p.nameHi, p.districtEn, p.districtHi, p.population, p.totalWards,
          p.sarpanchNameEn, p.sarpanchNameHi, p.sarpanchPhone, p.secretaryNameEn, p.secretaryNameHi, p.secretaryPhone
        );

      const insertWard = this.db.prepare(
        "INSERT INTO wards (ward_number, member_name_en, member_name_hi, area_en, area_hi, phone) VALUES (?, ?, ?, ?, ?, ?)"
      );
      for (const w of seed.wards) {
        insertWard.run(w.ward, w.nameEn, w.nameHi, w.areaEn, w.areaHi, w.phone);
      }

      const insertNotice = this.db.prepare(
        `INSERT INTO notices
        (id, category, date_en, date_hi, title_en, title_hi, body_en, body_hi, authority_en, authority_hi, script_hi, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const n of seed.notices) {
        insertNotice.run(
          n.id, n.category, n.dateEn, n.dateHi, n.titleEn, n.titleHi,
          n.bodyEn, n.bodyHi, n.authorityEn, n.authorityHi, n.scriptHi, n.createdAt
        );
      }

      const insertProject = this.db.prepare(
        `INSERT INTO development_projects
        (id, title_en, title_hi, ward_en, ward_hi, sanctioned_inr, spent_inr, work_pct, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const pr of seed.projects) {
        insertProject.run(pr.id, pr.titleEn, pr.titleHi, pr.wardEn, pr.wardHi, pr.sanctioned, pr.spent, pr.workPct, pr.updatedAt);
      }

      const insertGrievance = this.db.prepare(
        `INSERT INTO grievances
        (token, category, ward_number, status, sla_hours_left, citizen_name, citizen_phone, landmark,
         title_en, title_hi, desc_en, desc_hi, resolution_notes, photo_data_url, photo_caption_en, photo_caption_hi, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const g of seed.grievances) {
        insertGrievance.run(
          g.token, g.category, g.ward, g.status, g.slaHoursLeft, g.citizenName, g.citizenPhone, g.landmark,
          g.titleEn, g.titleHi, g.descEn, g.descHi, g.resolutionNotes, g.photoDataUrl,
          g.photoCaptionEn, g.photoCaptionHi, g.createdAt, g.updatedAt
        );
      }

      const insertAgenda = this.db.prepare(
        "INSERT INTO gram_sabha_agenda (id, title_en, title_hi, proposed_by, ward_number, votes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      for (const a of seed.agendaItems) {
        insertAgenda.run(a.id, a.titleEn, a.titleHi, a.proposedBy, a.ward, a.votes, a.createdAt);
      }

      const insertAsset = this.db.prepare(
        "INSERT INTO village_assets (id, asset_type, map_x, map_y, pin_color, name_en, name_hi, meta_en, meta_hi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      );
      for (const as of seed.assets) {
        insertAsset.run(as.id, as.type, as.x, as.y, as.color, as.nameEn, as.nameHi, as.metaEn, as.metaHi);
      }

      const insertCounter = this.db.prepare("INSERT INTO system_counters (name, value) VALUES (?, ?)");
      insertCounter.run("grievance_token", seed.tokenCounter);
      insertCounter.run("notice_id", seed.noticeCounter);
      insertCounter.run("agenda_id", seed.agendaCounter);
    });

    seedTransaction();
    logger.info({ dbPath: this.dbFilePath }, "SQLite database initialized and seeded");
  }

  _nextCounter(name, fallback) {
    const row = this.db.prepare("SELECT value FROM system_counters WHERE name = ?").get(name);
    const nextVal = (row ? row.value : fallback) + 1;
    this.db.prepare("INSERT INTO system_counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value").run(name, nextVal);
    return nextVal;
  }

  logAudit(actor, action, entityType, entityId, details = "") {
    this.db
      .prepare("INSERT INTO audit_logs (actor, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(actor, action, entityType, entityId, details, new Date().toISOString());
  }

  getAuditLogs(limit = 25) {
    return this.db
      .prepare("SELECT id, actor, action, entity_type AS entityType, entity_id AS entityId, details, created_at AS createdAt FROM audit_logs ORDER BY id DESC LIMIT ?")
      .all(limit);
  }

  getOverview() {
    const p = this.db.prepare("SELECT * FROM village_profile WHERE id = 1").get();
    const wards = this.db
      .prepare("SELECT ward_number AS ward, member_name_en AS nameEn, member_name_hi AS nameHi, area_en AS areaEn, area_hi AS areaHi, phone FROM wards ORDER BY ward_number ASC")
      .all();
    const assets = this.db
      .prepare("SELECT id, asset_type AS type, map_x AS x, map_y AS y, pin_color AS color, name_en AS nameEn, name_hi AS nameHi, meta_en AS metaEn, meta_hi AS metaHi FROM village_assets")
      .all();

    return {
      profile: {
        nameEn: p.name_en,
        nameHi: p.name_hi,
        districtEn: p.district_en,
        districtHi: p.district_hi,
        population: p.population,
        totalWards: p.total_wards,
        sarpanchNameEn: p.sarpanch_name_en,
        sarpanchNameHi: p.sarpanch_name_hi,
        sarpanchPhone: p.sarpanch_phone,
        secretaryNameEn: p.secretary_name_en,
        secretaryNameHi: p.secretary_name_hi,
        secretaryPhone: p.secretary_phone,
      },
      wards,
      assets,
    };
  }

  getNotices(category) {
    const baseSql = `SELECT id, category, date_en AS dateEn, date_hi AS dateHi, title_en AS titleEn, title_hi AS titleHi,
      body_en AS bodyEn, body_hi AS bodyHi, authority_en AS authorityEn, authority_hi AS authorityHi, script_hi AS scriptHi, created_at AS createdAt
      FROM notices`;
    if (!category || category === "All") {
      return this.db.prepare(`${baseSql} ORDER BY rowid DESC`).all();
    }
    return this.db.prepare(`${baseSql} WHERE category = ? ORDER BY rowid DESC`).all(category);
  }

  addNotice({ category, titleEn, titleHi, bodyEn, bodyHi, scriptHi }, actor = "sarpanch") {
    const tx = this.db.transaction(() => {
      const nextNum = this._nextCounter("notice_id", 104);
      const id = `N-${nextNum}`;
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO notices (id, category, date_en, date_hi, title_en, title_hi, body_en, body_hi, authority_en, authority_hi, script_hi, created_at)
           VALUES (?, ?, 'Just Now', 'अभी जारी', ?, ?, ?, ?, 'Sarpanch Office (Pipri)', 'सरपंच कार्यालय (पिपरी)', ?, ?)`
        )
        .run(id, category, titleEn, titleHi, bodyEn, bodyHi, scriptHi, now);
      this.logAudit(actor, "PUBLISH_NOTICE", "notice", id, `${category}: ${titleEn}`);
      return this.db
        .prepare(
          `SELECT id, category, date_en AS dateEn, date_hi AS dateHi, title_en AS titleEn, title_hi AS titleHi,
           body_en AS bodyEn, body_hi AS bodyHi, authority_en AS authorityEn, authority_hi AS authorityHi, script_hi AS scriptHi, created_at AS createdAt
           FROM notices WHERE id = ?`
        )
        .get(id);
    });
    return tx();
  }

  getProjects() {
    return this.db
      .prepare(
        `SELECT id, title_en AS titleEn, title_hi AS titleHi, ward_en AS wardEn, ward_hi AS wardHi,
         sanctioned_inr AS sanctioned, spent_inr AS spent, work_pct AS workPct, updated_at AS updatedAt
         FROM development_projects ORDER BY id ASC`
      )
      .all();
  }

  updateProject(projectId, updates, actor = "sarpanch") {
    const existing = this.db.prepare("SELECT * FROM development_projects WHERE id = ?").get(projectId);
    if (!existing) return null;

    const nextWork = updates.workPct !== undefined ? updates.workPct : existing.work_pct;
    const nextSpent = updates.spent !== undefined ? updates.spent : existing.spent_inr;
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      this.db
        .prepare("UPDATE development_projects SET work_pct = ?, spent_inr = ?, updated_at = ? WHERE id = ?")
        .run(nextWork, nextSpent, now, projectId);
      this.logAudit(actor, "UPDATE_PROJECT", "project", projectId, `workPct=${nextWork}%, spent=INR ${nextSpent}`);
    });
    tx();

    return this.db
      .prepare(
        `SELECT id, title_en AS titleEn, title_hi AS titleHi, ward_en AS wardEn, ward_hi AS wardHi,
         sanctioned_inr AS sanctioned, spent_inr AS spent, work_pct AS workPct, updated_at AS updatedAt
         FROM development_projects WHERE id = ?`
      )
      .get(projectId);
  }

  _mapGrievanceRow(r) {
    if (!r) return null;
    return {
      token: r.token,
      category: r.category,
      ward: r.ward_number,
      status: r.status,
      slaHoursLeft: r.sla_hours_left,
      citizenName: r.citizen_name,
      citizenPhone: r.citizen_phone,
      landmark: r.landmark,
      titleEn: r.title_en,
      titleHi: r.title_hi,
      descEn: r.desc_en,
      descHi: r.desc_hi,
      resolutionNotes: r.resolution_notes,
      photoDataUrl: r.photo_data_url,
      photoCaptionEn: r.photo_caption_en,
      photoCaptionHi: r.photo_caption_hi,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  getGrievances(status) {
    const rows =
      !status || status === "All"
        ? this.db.prepare("SELECT * FROM grievances ORDER BY updated_at DESC").all()
        : this.db.prepare("SELECT * FROM grievances WHERE status = ? ORDER BY updated_at DESC").all(status);
    return rows.map((r) => this._mapGrievanceRow(r));
  }

  createGrievance(payload) {
    const tx = this.db.transaction(() => {
      const counterRow = this.db.prepare("SELECT value FROM system_counters WHERE name = 'grievance_token'").get();
      const { token, nextCounter } = generateNextToken(counterRow ? counterRow.value : 1048);
      this.db.prepare("INSERT INTO system_counters (name, value) VALUES ('grievance_token', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value").run(nextCounter);

      const now = new Date().toISOString();
      const descEn = `${payload.description} (Location: ${payload.landmark})`;
      const descHi = `${payload.description} (स्थान: ${payload.landmark})`;
      const capEn = `Citizen photo submitted by ${payload.citizenName} near ${payload.landmark}.`;
      const capHi = `${payload.citizenName} द्वारा ${payload.landmark} के पास से अपलोड किया गया फोटो।`;

      this.db
        .prepare(
          `INSERT INTO grievances
          (token, category, ward_number, status, sla_hours_left, citizen_name, citizen_phone, landmark,
           title_en, title_hi, desc_en, desc_hi, resolution_notes, photo_data_url, photo_caption_en, photo_caption_hi, created_at, updated_at)
          VALUES (?, ?, ?, 'Submitted', 48, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)`
        )
        .run(
          token, payload.category, payload.ward, payload.citizenName, payload.citizenPhone || "", payload.landmark,
          payload.title, payload.title, descEn, descHi, payload.photoDataUrl || null, capEn, capHi, now, now
        );

      this.logAudit(payload.citizenName, "CREATE_GRIEVANCE", "grievance", token, `${payload.category} (Ward ${payload.ward})`);
      return this._mapGrievanceRow(this.db.prepare("SELECT * FROM grievances WHERE token = ?").get(token));
    });
    return tx();
  }

  updateGrievance(token, updates, actor = "sarpanch") {
    const existing = this.db.prepare("SELECT * FROM grievances WHERE token = ?").get(token);
    if (!existing) return null;

    const nextStatus = updates.status !== undefined ? updates.status : existing.status;
    const nextWard = updates.ward !== undefined ? updates.ward : existing.ward_number;
    const nextNotes = updates.resolutionNotes !== undefined ? updates.resolutionNotes : existing.resolution_notes;
    const nextSla = nextStatus === "Resolved" ? 0 : existing.sla_hours_left;
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      this.db
        .prepare("UPDATE grievances SET status = ?, ward_number = ?, sla_hours_left = ?, resolution_notes = ?, updated_at = ? WHERE token = ?")
        .run(nextStatus, nextWard, nextSla, nextNotes, now, token);
      this.logAudit(actor, "UPDATE_GRIEVANCE", "grievance", token, `status=${nextStatus}, ward=${nextWard}`);
    });
    tx();

    return this._mapGrievanceRow(this.db.prepare("SELECT * FROM grievances WHERE token = ?").get(token));
  }

  getAgendaItems() {
    return this.db
      .prepare(
        `SELECT id, title_en AS titleEn, title_hi AS titleHi, proposed_by AS proposedBy, ward_number AS ward, votes, created_at AS createdAt
         FROM gram_sabha_agenda ORDER BY votes DESC, rowid DESC`
      )
      .all();
  }

  addAgendaItem({ title, proposedBy, ward }) {
    const tx = this.db.transaction(() => {
      const nextNum = this._nextCounter("agenda_id", 3);
      const id = `AG-${nextNum}`;
      const now = new Date().toISOString();
      this.db
        .prepare("INSERT INTO gram_sabha_agenda (id, title_en, title_hi, proposed_by, ward_number, votes, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)")
        .run(id, title, title, proposedBy, ward, now);
      this.logAudit(proposedBy, "ADD_AGENDA", "agenda", id, title);
      return this.db
        .prepare("SELECT id, title_en AS titleEn, title_hi AS titleHi, proposed_by AS proposedBy, ward_number AS ward, votes, created_at AS createdAt FROM gram_sabha_agenda WHERE id = ?")
        .get(id);
    });
    return tx();
  }

  upvoteAgendaItem(agendaId) {
    const existing = this.db.prepare("SELECT id FROM gram_sabha_agenda WHERE id = ?").get(agendaId);
    if (!existing) return null;
    this.db.prepare("UPDATE gram_sabha_agenda SET votes = votes + 1 WHERE id = ?").run(agendaId);
    return this.db
      .prepare("SELECT id, title_en AS titleEn, title_hi AS titleHi, proposed_by AS proposedBy, ward_number AS ward, votes, created_at AS createdAt FROM gram_sabha_agenda WHERE id = ?")
      .get(agendaId);
  }

  getDatabaseStats() {
    const counts = {
      wards: this.db.prepare("SELECT COUNT(*) AS c FROM wards").get().c,
      notices: this.db.prepare("SELECT COUNT(*) AS c FROM notices").get().c,
      projects: this.db.prepare("SELECT COUNT(*) AS c FROM development_projects").get().c,
      grievances: this.db.prepare("SELECT COUNT(*) AS c FROM grievances").get().c,
      agendaItems: this.db.prepare("SELECT COUNT(*) AS c FROM gram_sabha_agenda").get().c,
      auditLogs: this.db.prepare("SELECT COUNT(*) AS c FROM audit_logs").get().c,
    };
    return counts;
  }

  close() {
    this.db.close();
  }
}

module.exports = { GramaGlowRepository };
