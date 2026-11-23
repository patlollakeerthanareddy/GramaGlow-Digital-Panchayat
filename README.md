# GramaGlow — Digital Gram Panchayat Governance Portal (Pipri)

A production-grade **3-Tier Full-Stack** bilingual (**English & Hindi**) rural e-governance platform built for **Pipri Gram Panchayat** (Population: `3,420`, `8` Wards).

## Key Engineering Highlights
- **3-Tier Architecture + SQLite (WAL Mode):** Express REST API backed by a 9-table normalized SQLite schema (`better-sqlite3`, foreign keys, indexes, transactions, immutable `audit_logs`).
- **Real-Time Live Sync (Server-Sent Events):** `/api/events` broadcasts grievance, budget, notice, and Gram Sabha voting updates live across connected clients.
- **Predictive Budget Burn-Rate Forecasting:** Computes projected completion cost (`spent / (workPct / 100)`) and projected overrun in INR alongside dual-bar physical vs. financial progress tracking.
- **Rural Accessibility (Voice & Offline PWA):** Spoken Hindi notice broadcasts (`speechSynthesis`), voice-assisted grievance dictation (`SpeechRecognition`), Service Worker caching (`sw.js`), and an offline grievance background sync queue.
- **Security & Observability:** Zero hardcoded secrets (`dotenv` + ephemeral dev secret / strict production enforcement), HMAC-SHA256 timing-safe auth, XSS & CSV formula-injection sanitization, Pino structured JSON logging with `X-Request-Id`, `/api/metrics`, and interactive Swagger UI at `/api/docs`.
- **DevOps Ready:** Multi-step `Dockerfile` with `HEALTHCHECK`, `docker-compose.yml` with persistent SQLite volume, and GitHub Actions CI pipeline (`.github/workflows/ci.yml`).

---

## Quick Setup & Run

### Local Development
```bash
cd gramaglow-digital-panchayat
cp .env.example .env
npm install
npm start
```
- **Portal:** `http://localhost:3000`
- **Swagger API Docs:** `http://localhost:3000/api/docs`
- **Health & Metrics:** `http://localhost:3000/api/metrics`

### Run Automated Tests (Unit + In-Memory SQLite API Integration)
```bash
npm test
```

### Run with Docker Compose
```bash
docker compose up --build
```

### Sarpanch Admin Demo Login
Click **Sarpanch Admin** in the header (or click **Auto-Fill Demo Credentials**):
- **Username:** `sarpanch`
- **Password:** `sarpanch2026`
