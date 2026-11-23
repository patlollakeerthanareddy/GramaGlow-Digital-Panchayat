-- GramaGlow Relational Database Schema (SQLite 3 with WAL & Foreign Keys)
-- Pipri Gram Panchayat (Population: 3,420 | 8 Electoral Wards)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS village_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  district_en TEXT NOT NULL,
  district_hi TEXT NOT NULL,
  population INTEGER NOT NULL CHECK (population > 0),
  total_wards INTEGER NOT NULL CHECK (total_wards > 0),
  sarpanch_name_en TEXT NOT NULL,
  sarpanch_name_hi TEXT NOT NULL,
  sarpanch_phone TEXT NOT NULL,
  secretary_name_en TEXT NOT NULL,
  secretary_name_hi TEXT NOT NULL,
  secretary_phone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wards (
  ward_number INTEGER PRIMARY KEY CHECK (ward_number BETWEEN 1 AND 8),
  member_name_en TEXT NOT NULL,
  member_name_hi TEXT NOT NULL,
  area_en TEXT NOT NULL,
  area_hi TEXT NOT NULL,
  phone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('Gram Sabha', 'Agriculture', 'Health', 'Education')),
  date_en TEXT NOT NULL,
  date_hi TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_hi TEXT NOT NULL,
  body_en TEXT NOT NULL,
  body_hi TEXT NOT NULL,
  authority_en TEXT NOT NULL,
  authority_hi TEXT NOT NULL,
  script_hi TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS development_projects (
  id TEXT PRIMARY KEY,
  title_en TEXT NOT NULL,
  title_hi TEXT NOT NULL,
  ward_en TEXT NOT NULL,
  ward_hi TEXT NOT NULL,
  sanctioned_inr INTEGER NOT NULL CHECK (sanctioned_inr > 0),
  spent_inr INTEGER NOT NULL CHECK (spent_inr >= 0),
  work_pct INTEGER NOT NULL CHECK (work_pct BETWEEN 0 AND 100),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grievances (
  token TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('Streetlights', 'Drinking Water', 'Sanitation', 'Roads')),
  ward_number INTEGER NOT NULL REFERENCES wards(ward_number),
  status TEXT NOT NULL CHECK (status IN ('Submitted', 'Assigned', 'In Progress', 'Resolved')),
  sla_hours_left INTEGER NOT NULL CHECK (sla_hours_left >= 0),
  citizen_name TEXT NOT NULL,
  citizen_phone TEXT DEFAULT '',
  landmark TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_hi TEXT NOT NULL,
  desc_en TEXT NOT NULL,
  desc_hi TEXT NOT NULL,
  resolution_notes TEXT NOT NULL DEFAULT '',
  photo_data_url TEXT,
  photo_caption_en TEXT,
  photo_caption_hi TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gram_sabha_agenda (
  id TEXT PRIMARY KEY,
  title_en TEXT NOT NULL,
  title_hi TEXT NOT NULL,
  proposed_by TEXT NOT NULL,
  ward_number INTEGER NOT NULL REFERENCES wards(ward_number),
  votes INTEGER NOT NULL DEFAULT 1 CHECK (votes >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS village_assets (
  id TEXT PRIMARY KEY,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('HealthCenter', 'School', 'Anganwadi', 'WaterPoint')),
  map_x INTEGER NOT NULL,
  map_y INTEGER NOT NULL,
  pin_color TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  meta_en TEXT NOT NULL,
  meta_hi TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_grievances_status ON grievances(status);
CREATE INDEX IF NOT EXISTS idx_grievances_ward ON grievances(ward_number);
CREATE INDEX IF NOT EXISTS idx_notices_category ON notices(category);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
