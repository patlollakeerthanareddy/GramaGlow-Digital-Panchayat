/* ==========================================================================
   GramaGlow — Pipri Gram Panchayat Full-Stack UI Controller
   ========================================================================== */

(function () {
  const { translateKey, translateCategory, translateStatus } = window.GramaGlowI18n;
  const { escapeHtml, formatINR, formatLakhs, evaluateProjectBudget, sortGrievancesBySLA, computeResolutionRate } =
    window.GramaGlowLogic;
  const API = window.GramaGlowAPI;

  const state = {
    lang: "en",
    activeTab: "overview",
    noticeCat: "All",
    grievanceStatus: "All",
    assetType: "All",
    isAdminAuthenticated: Boolean(API.getAdminToken()),
    uploadedPhotoDataUrl: null,
    toastTimer: null,
    data: {
      profile: null,
      wards: [],
      notices: [],
      projects: [],
      grievances: [],
      agendaItems: [],
      assets: [],
    },
  };

  function t(key) {
    return translateKey(state.lang, key);
  }
  function tCat(cat) {
    return translateCategory(state.lang, cat);
  }
  function tStatus(st) {
    return translateStatus(state.lang, st);
  }

  function showToast(message) {
    const el = document.getElementById("toastBanner");
    if (state.toastTimer) clearTimeout(state.toastTimer);
    el.textContent = message;
    el.classList.remove("hidden");
    state.toastTimer = setTimeout(() => {
      el.classList.add("hidden");
      state.toastTimer = null;
    }, 3400);
  }

  function setActiveTab(tabId) {
    if (tabId === "admin" && !state.isAdminAuthenticated) {
      openLoginModal();
      return;
    }
    state.activeTab = tabId;
    document.querySelectorAll(".view-section").forEach((sec) => {
      sec.classList.toggle("active", sec.id === `section-${tabId}`);
    });
    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    updateRoleToggleUI();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateRoleToggleUI() {
    const btn = document.getElementById("roleToggleBtn");
    const label = document.getElementById("roleToggleLabel");
    const inAdmin = state.activeTab === "admin";
    btn.classList.toggle("is-admin", inAdmin);
    label.textContent = inAdmin ? t("roleCitizen") : t("roleAdmin");
  }

  function updateMetricsKPIs() {
    const { profile, projects, grievances } = state.data;
    if (profile) {
      document.getElementById("kpiPopVal").textContent = Number(profile.population).toLocaleString("en-IN");
      document.getElementById("kpiWardsVal").textContent = String(profile.totalWards);
    }
    const totalSanctioned = projects.reduce((sum, p) => sum + Number(p.sanctioned || 0), 0);
    document.getElementById("kpiFundsVal").textContent = formatLakhs(totalSanctioned);
    document.getElementById("kpiResolvedVal").textContent = `${computeResolutionRate(grievances)}%`;
  }

  function updateConnectionBadge() {
    const badge = document.getElementById("connectionStatusBadge");
    const isOnline = API.isOnline();
    badge.classList.toggle("offline", !isOnline);
    badge.textContent = isOnline ? t("connectionLive") : t("connectionOffline");
  }

  function populateFormSelects() {
    const gCat = document.getElementById("gCategory");
    const gCats = ["Streetlights", "Drinking Water", "Sanitation", "Roads"];
    const prevCat = gCat.value || "Streetlights";
    gCat.innerHTML = gCats.map((c) => `<option value="${c}">${escapeHtml(tCat(c))}</option>`).join("");
    gCat.value = prevCat;

    const gWard = document.getElementById("gWard");
    const prevWard = gWard.value || "3";
    gWard.innerHTML = state.data.wards
      .map((w) => {
        const lbl = state.lang === "en" ? `Ward ${w.ward} — ${w.areaEn}` : `वार्ड ${w.ward} — ${w.areaHi}`;
        return `<option value="${w.ward}">${escapeHtml(lbl)}</option>`;
      })
      .join("");
    if (state.data.wards.length) gWard.value = prevWard;

    const nCat = document.getElementById("nCategory");
    const nCats = ["Gram Sabha", "Agriculture", "Health", "Education"];
    const prevNCat = nCat.value || "Gram Sabha";
    nCat.innerHTML = nCats.map((c) => `<option value="${c}">${escapeHtml(tCat(c))}</option>`).join("");
    nCat.value = prevNCat;

    document.getElementById("agendaTitleInput").placeholder = t("agendaPlaceholder");
    document.getElementById("agendaProposerInput").placeholder = t("agendaProposerPlaceholder");
  }

  function applyTranslations() {
    document.body.classList.toggle("lang-hi", state.lang === "hi");
    document.documentElement.lang = state.lang;
    document.getElementById("langLabel").textContent = state.lang === "en" ? "हिंदी" : "English";

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });

    const formOpen = !document.getElementById("grievanceFormCard").classList.contains("hidden");
    document.getElementById("toggleGrievanceFormBtn").textContent = formOpen ? t("closeFormBtn") : t("openFormBtn");

    updateRoleToggleUI();
    updateConnectionBadge();
    populateFormSelects();
    renderAllViews();
  }

  function renderAllViews() {
    updateMetricsKPIs();
    renderWards();
    renderAgenda();
    renderNoticeFilters();
    renderNotices();
    renderBudget();
    renderWardAnalytics();
    renderGrievanceFilters();
    renderGrievances();
    renderAssetFilters();
    renderAssets();
    if (state.isAdminAuthenticated) {
      renderAdminDashboard();
    }
  }

  /* 1. Wards */
  function renderWards() {
    const container = document.getElementById("wardRosterContainer");
    container.innerHTML = state.data.wards
      .map((w) => {
        const wardTitle = state.lang === "en" ? `Ward ${w.ward}` : `वार्ड ${w.ward}`;
        const member = state.lang === "en" ? w.nameEn : w.nameHi;
        const area = state.lang === "en" ? w.areaEn : w.areaHi;
        return `
          <div class="ward-item">
            <div class="ward-num">${escapeHtml(wardTitle)}</div>
            <div class="ward-member">${escapeHtml(member)}</div>
            <div class="ward-area">${escapeHtml(area)}</div>
          </div>
        `;
      })
      .join("");
  }

  /* 2. Gram Sabha Digital Agenda Voting */
  function renderAgenda() {
    const list = document.getElementById("agendaList");
    const sorted = [...state.data.agendaItems].sort((a, b) => b.votes - a.votes);
    list.innerHTML = sorted
      .map((item) => {
        const title = state.lang === "en" ? item.titleEn : item.titleHi;
        const wardTxt = state.lang === "en" ? `Ward ${item.ward}` : `वार्ड ${item.ward}`;
        return `
          <div class="agenda-item">
            <div>
              <h4 class="agenda-item-title">${escapeHtml(title)}</h4>
              <div class="agenda-item-meta">${escapeHtml(item.proposedBy)} • ${escapeHtml(wardTxt)}</div>
            </div>
            <button type="button" class="vote-btn" data-vote-id="${escapeHtml(item.id)}">
              ▲ ${item.votes} ${escapeHtml(t("votesLabel"))}
            </button>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll("[data-vote-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const res = await API.upvoteAgenda(btn.dataset.voteId);
          const idx = state.data.agendaItems.findIndex((a) => a.id === res.agendaItem.id);
          if (idx !== -1) state.data.agendaItems[idx] = res.agendaItem;
          renderAgenda();
          showToast(state.lang === "en" ? "Vote recorded for Gram Sabha!" : "ग्राम सभा के लिए आपका वोट दर्ज किया गया!");
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }

  /* 3. Official Notices & Web Speech API */
  function renderNoticeFilters() {
    const cats = ["All", "Gram Sabha", "Agriculture", "Health", "Education"];
    const el = document.getElementById("noticeFilters");
    el.innerHTML = cats
      .map(
        (c) => `<button type="button" class="filter-pill ${state.noticeCat === c ? "active" : ""}" data-ncat="${c}">${escapeHtml(tCat(c))}</button>`
      )
      .join("");

    el.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.noticeCat = btn.dataset.ncat;
        renderNoticeFilters();
        renderNotices();
      });
    });
  }

  function renderNotices() {
    const list = document.getElementById("noticesList");
    const filtered = state.noticeCat === "All" ? state.data.notices : state.data.notices.filter((n) => n.category === state.noticeCat);

    list.innerHTML = filtered
      .map((n) => {
        const title = state.lang === "en" ? n.titleEn : n.titleHi;
        const body = state.lang === "en" ? n.bodyEn : n.bodyHi;
        const date = state.lang === "en" ? n.dateEn : n.dateHi;
        const auth = state.lang === "en" ? n.authorityEn : n.authorityHi;
        return `
          <article class="notice-card">
            <div class="notice-meta">
              <span class="cat-badge">${escapeHtml(tCat(n.category))}</span>
              <span class="date-text">${escapeHtml(date)}</span>
            </div>
            <h3 class="notice-title">${escapeHtml(title)}</h3>
            <p class="notice-body">${escapeHtml(body)}</p>
            <div class="notice-footer">
              <span class="authority-text">${escapeHtml(t("issuedBy"))} ${escapeHtml(auth)}</span>
              <button type="button" class="audio-trigger-btn" data-audio-id="${escapeHtml(n.id)}">
                🔊 <span>${escapeHtml(t("listenBtn"))}</span>
              </button>
            </div>
          </article>
        `;
      })
      .join("");

    list.querySelectorAll("[data-audio-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = state.data.notices.find((x) => x.id === btn.dataset.audioId);
        if (!item) return;
        document.getElementById("audioNoticeTitle").textContent = state.lang === "en" ? item.titleEn : item.titleHi;
        document.getElementById("audioScriptText").textContent = item.scriptHi;
        document.getElementById("audioReaderBox").classList.remove("hidden");

        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(item.scriptHi);
          utter.lang = "hi-IN";
          window.speechSynthesis.speak(utter);
        }
      });
    });
  }

  /* 4. Dual-Bar Development Budget Tracker */
  function renderBudget() {
    const list = document.getElementById("budgetList");
    list.innerHTML = state.data.projects
      .map((p) => {
        const { spendPct, overSpend, projectedTotalCost, projectedOverrunInr } = evaluateProjectBudget(p.sanctioned, p.spent, p.workPct);
        const title = state.lang === "en" ? p.titleEn : p.titleHi;
        const ward = state.lang === "en" ? p.wardEn : p.wardHi;
        return `
          <article class="project-card">
            <div class="project-top">
              <h3 class="project-title">${escapeHtml(title)}</h3>
              ${overSpend ? `<span class="audit-flag">⚠ ${escapeHtml(t("auditAlert"))}</span>` : ""}
            </div>
            <div class="project-ward">${escapeHtml(ward)}</div>

            <div class="bar-group">
              <div class="bar-label-row"><span>${escapeHtml(t("workLabel"))}</span><span>${p.workPct}%</span></div>
              <div class="track-bg" role="progressbar" aria-valuenow="${p.workPct}" aria-valuemin="0" aria-valuemax="100">
                <div class="fill-emerald" style="width:${Math.min(100, p.workPct)}%"></div>
              </div>
            </div>

            <div class="bar-group">
              <div class="bar-label-row"><span>${escapeHtml(t("spendLabel"))}</span><span>${spendPct}%</span></div>
              <div class="track-bg" role="progressbar" aria-valuenow="${spendPct}" aria-valuemin="0" aria-valuemax="100">
                <div class="fill-amber" style="width:${Math.min(100, spendPct)}%"></div>
              </div>
            </div>

            <div class="project-figures">
              <span>${escapeHtml(t("sanctionedLabel"))} <strong>${formatINR(p.sanctioned)}</strong></span>
              <span>${escapeHtml(t("spentLabel"))} <strong>${formatINR(p.spent)}</strong></span>
            </div>
            <div class="forecast-strip">
              <span>${escapeHtml(t("projectedCostLabel"))} <strong>${formatINR(projectedTotalCost)}</strong></span>
              ${projectedOverrunInr > 0 ? `<span class="forecast-overrun">${escapeHtml(t("projectedOverrunLabel"))} +${formatINR(projectedOverrunInr)}</span>` : ""}
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderWardAnalytics() {
    const chart = document.getElementById("wardAnalyticsChart");
    if (!chart) return;
    const counts = Array(8).fill(0);
    state.data.grievances.forEach((g) => {
      const idx = Number(g.ward) - 1;
      if (idx >= 0 && idx < 8) counts[idx] += 1;
    });
    const maxVal = Math.max(1, ...counts);
    chart.innerHTML = counts
      .map((cnt, idx) => {
        const pct = Math.round((cnt / maxVal) * 100);
        const wLbl = state.lang === "en" ? `W${idx + 1}` : `वा ${idx + 1}`;
        return `
          <div class="ward-bar-col">
            <span class="ward-bar-count">${cnt}</span>
            <div class="ward-bar-track"><div class="ward-bar-fill" style="height:${Math.max(8, pct)}%"></div></div>
            <span class="ward-bar-label">${wLbl}</span>
          </div>
        `;
      })
      .join("");
  }

  /* 5. Public Grievance Board */
  function renderGrievanceFilters() {
    const statuses = ["All", "Submitted", "Assigned", "In Progress", "Resolved"];
    const el = document.getElementById("grievanceFilters");
    el.innerHTML = statuses
      .map(
        (st) => `<button type="button" class="filter-pill ${state.grievanceStatus === st ? "active" : ""}" data-gstat="${st}">${escapeHtml(tStatus(st))}</button>`
      )
      .join("");

    el.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.grievanceStatus = btn.dataset.gstat;
        renderGrievanceFilters();
        renderGrievances();
      });
    });
  }

  function getStatusBadgeClass(status) {
    if (status === "Submitted") return "st-submitted";
    if (status === "Assigned") return "st-assigned";
    if (status === "In Progress") return "st-progress";
    return "st-resolved";
  }

  function renderGrievances() {
    const list = document.getElementById("grievancesList");
    const empty = document.getElementById("grievancesEmpty");
    const filtered =
      state.grievanceStatus === "All"
        ? state.data.grievances
        : state.data.grievances.filter((g) => g.status === state.grievanceStatus);
    const items = sortGrievancesBySLA(filtered);

    if (items.length === 0) {
      list.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    const steps = ["Submitted", "Assigned", "In Progress", "Resolved"];

    list.innerHTML = items
      .map((g) => {
        const title = state.lang === "en" ? g.titleEn : g.titleHi;
        const desc = state.lang === "en" ? g.descEn : g.descHi;
        const wardLabel = state.lang === "en" ? `Ward ${g.ward}` : `वार्ड ${g.ward}`;
        const currentIndex = steps.indexOf(g.status);

        let slaHtml = "";
        if (g.status === "Resolved") {
          slaHtml = `<span class="sla-chip sla-done">✓ ${escapeHtml(t("resolvedOnTime"))}</span>`;
        } else if (g.slaHoursLeft === 0) {
          slaHtml = `<span class="sla-chip sla-escalated">● ${escapeHtml(t("overdueText"))} • ${escapeHtml(t("escalatedBdo"))}</span>`;
        } else {
          slaHtml = `<span class="sla-chip">${g.slaHoursLeft}${escapeHtml(t("hoursLeftSuffix"))}</span>`;
        }

        const stepperHtml = steps
          .map((stepName, idx) => {
            const cls = idx < currentIndex ? "done" : idx === currentIndex ? "current" : "";
            return `
              <div class="step-node ${cls}">
                <div class="step-dot">${idx < currentIndex ? "✓" : idx + 1}</div>
                <span class="step-label">${escapeHtml(tStatus(stepName))}</span>
              </div>
            `;
          })
          .join("");

        const thumbInner = g.photoDataUrl
          ? `<img src="${g.photoDataUrl}" alt="Field photo" />`
          : `<span>📷</span><span>${escapeHtml(t("photoBtn"))}</span>`;

        const notesHtml = g.resolutionNotes
          ? `<div class="resolution-box"><strong>${escapeHtml(t("resolutionNotesLabel"))}</strong> ${escapeHtml(g.resolutionNotes)}</div>`
          : "";

        return `
          <article class="grievance-card">
            <div class="grievance-top">
              <div class="token-group">
                <span class="token-pill">#${escapeHtml(g.token)}</span>
                <span class="cat-badge">${escapeHtml(tCat(g.category))} • ${escapeHtml(wardLabel)}</span>
                ${slaHtml}
              </div>
              <span class="status-pill ${getStatusBadgeClass(g.status)}">${escapeHtml(tStatus(g.status))}</span>
            </div>
            <div class="grievance-main">
              <div>
                <h3 class="grievance-title">${escapeHtml(title)}</h3>
                <p class="grievance-desc">${escapeHtml(desc)}</p>
                ${notesHtml}
              </div>
              <button type="button" class="thumb-btn" data-photo-token="${escapeHtml(g.token)}" aria-label="View field photo">
                ${thumbInner}
              </button>
            </div>
            <div class="stepper" aria-label="Resolution progress">${stepperHtml}</div>
          </article>
        `;
      })
      .join("");

    list.querySelectorAll("[data-photo-token]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = state.data.grievances.find((x) => x.token === btn.dataset.photoToken);
        if (item) openPhotoModal(item);
      });
    });
  }

  /* 6. Village Assets SVG Map */
  function renderAssetFilters() {
    const types = ["All", "HealthCenter", "School", "Anganwadi", "WaterPoint"];
    const el = document.getElementById("assetFilters");
    el.innerHTML = types
      .map(
        (tp) => `<button type="button" class="filter-pill ${state.assetType === tp ? "active" : ""}" data-atype="${tp}">${escapeHtml(tCat(tp))}</button>`
      )
      .join("");

    el.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.assetType = btn.dataset.atype;
        renderAssetFilters();
        renderAssets();
      });
    });
  }

  function renderAssets() {
    const filtered = state.assetType === "All" ? state.data.assets : state.data.assets.filter((a) => a.type === state.assetType);
    const pinsLayer = document.getElementById("mapPinsLayer");
    pinsLayer.innerHTML = filtered
      .map((a) => {
        const label = (state.lang === "en" ? a.nameEn : a.nameHi).split(" ")[0];
        return `
          <g transform="translate(${a.x}, ${a.y})">
            <circle r="18" fill="${a.color}" opacity="0.22" />
            <circle r="10" fill="${a.color}" stroke="#ffffff" stroke-width="2.5" />
            <rect x="-48" y="15" width="96" height="24" rx="12" fill="#ffffff" opacity="0.92" />
            <text y="31" text-anchor="middle" fill="#0f172a" font-size="13" font-weight="600">${escapeHtml(label)}</text>
          </g>
        `;
      })
      .join("");

    document.getElementById("assetCardsList").innerHTML = filtered
      .map((a) => {
        const name = state.lang === "en" ? a.nameEn : a.nameHi;
        const meta = state.lang === "en" ? a.metaEn : a.metaHi;
        return `
          <div class="asset-card">
            <div class="notice-meta">
              <span class="cat-badge" style="color:${a.color};background:rgba(15,23,42,0.06);">${escapeHtml(tCat(a.type))}</span>
            </div>
            <h3 class="asset-title">${escapeHtml(name)}</h3>
            <div class="asset-meta">${escapeHtml(meta)}</div>
          </div>
        `;
      })
      .join("");
  }

  /* 7. Sarpanch Admin Dashboard */
  function renderAdminDashboard() {
    const ticketsBox = document.getElementById("adminTicketsContainer");
    const openTickets = sortGrievancesBySLA(state.data.grievances.filter((g) => g.status !== "Resolved"));

    if (openTickets.length === 0) {
      ticketsBox.innerHTML = `<div class="empty-state">${escapeHtml(t("adminNoOpenTickets"))}</div>`;
    } else {
      ticketsBox.innerHTML = openTickets
        .map((g) => {
          const title = state.lang === "en" ? g.titleEn : g.titleHi;
          const wardLabel = state.lang === "en" ? `Ward ${g.ward}` : `वार्ड ${g.ward}`;
          let nextActionBtn = "";
          if (g.status === "Submitted") {
            nextActionBtn = `<button type="button" class="btn-primary btn-sm btn-amber" data-adm-action="Assigned" data-adm-token="${escapeHtml(g.token)}">${escapeHtml(t("adminAssignBtn"))} ${g.ward}</button>`;
          } else if (g.status === "Assigned") {
            nextActionBtn = `<button type="button" class="btn-primary btn-sm" data-adm-action="In Progress" data-adm-token="${escapeHtml(g.token)}">${escapeHtml(t("adminStartBtn"))}</button>`;
          }
          const resolveBtn = `<button type="button" class="btn-primary btn-sm btn-emerald" data-adm-action="Resolved" data-adm-token="${escapeHtml(g.token)}">${escapeHtml(t("adminResolveBtn"))}</button>`;

          return `
            <article class="grievance-card">
              <div class="grievance-top">
                <div class="token-group">
                  <span class="token-pill">#${escapeHtml(g.token)}</span>
                  <span class="cat-badge">${escapeHtml(tCat(g.category))} • ${escapeHtml(wardLabel)}</span>
                </div>
                <span class="status-pill ${getStatusBadgeClass(g.status)}">${escapeHtml(tStatus(g.status))}</span>
              </div>
              <h4 class="grievance-title">${escapeHtml(title)}</h4>
              <div class="admin-notes-row">
                <input type="text" class="glass-input" data-note-input="${escapeHtml(g.token)}" value="${escapeHtml(g.resolutionNotes || "")}" placeholder="${escapeHtml(t("adminNotesPlaceholder"))}" />
                <button type="button" class="btn-glass btn-sm" data-save-note="${escapeHtml(g.token)}">${escapeHtml(t("adminSaveNotesBtn"))}</button>
              </div>
              <div class="admin-actions-row">
                ${nextActionBtn}
                ${resolveBtn}
              </div>
            </article>
          `;
        })
        .join("");

      ticketsBox.querySelectorAll("[data-adm-action]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const token = btn.dataset.admToken;
          const nextStatus = btn.dataset.admAction;
          const noteEl = ticketsBox.querySelector(`[data-note-input="${token}"]`);
          const resolutionNotes = noteEl ? noteEl.value.trim() : undefined;
          try {
            const res = await API.updateGrievance(token, { status: nextStatus, resolutionNotes });
            const idx = state.data.grievances.findIndex((x) => x.token === token);
            if (idx !== -1) state.data.grievances[idx] = res.grievance;
            renderAllViews();
            showToast(`#${token} → ${tStatus(nextStatus)}`);
          } catch (err) {
            showToast(err.message);
          }
        });
      });

      ticketsBox.querySelectorAll("[data-save-note]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const token = btn.dataset.saveNote;
          const noteEl = ticketsBox.querySelector(`[data-note-input="${token}"]`);
          try {
            const res = await API.updateGrievance(token, { resolutionNotes: noteEl.value.trim() });
            const idx = state.data.grievances.findIndex((x) => x.token === token);
            if (idx !== -1) state.data.grievances[idx] = res.grievance;
            renderAllViews();
            showToast(`#${token} note saved.`);
          } catch (err) {
            showToast(err.message);
          }
        });
      });
    }

    // Independent Project Progress & Spend Updater
    const projBox = document.getElementById("adminProjectsContainer");
    projBox.innerHTML = state.data.projects
      .map((p) => {
        const title = state.lang === "en" ? p.titleEn : p.titleHi;
        return `
          <div class="project-card">
            <h4 class="project-title">${escapeHtml(title)}</h4>
            <div class="project-ward">${escapeHtml(t("sanctionedLabel"))} ${formatINR(p.sanctioned)}</div>
            <div class="admin-proj-inputs">
              <div class="field-group">
                <label>${escapeHtml(t("adminWorkPctLabel"))}</label>
                <input type="number" min="0" max="100" class="glass-input" data-proj-work="${escapeHtml(p.id)}" value="${p.workPct}" />
              </div>
              <div class="field-group">
                <label>${escapeHtml(t("adminSpentLabel"))}</label>
                <input type="number" min="0" step="5000" class="glass-input" data-proj-spent="${escapeHtml(p.id)}" value="${p.spent}" />
              </div>
            </div>
            <button type="button" class="btn-primary btn-sm" data-save-proj="${escapeHtml(p.id)}">${escapeHtml(t("adminSaveProjectBtn"))}</button>
          </div>
        `;
      })
      .join("");

    projBox.querySelectorAll("[data-save-proj]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.saveProj;
        const workPct = Number(projBox.querySelector(`[data-proj-work="${id}"]`).value);
        const spent = Number(projBox.querySelector(`[data-proj-spent="${id}"]`).value);
        try {
          const res = await API.updateProject(id, { workPct, spent });
          const idx = state.data.projects.findIndex((x) => x.id === id);
          if (idx !== -1) state.data.projects[idx] = res.project;
          renderAllViews();
          showToast(state.lang === "en" ? "Project budget & progress updated!" : "परियोजना प्रगति और खर्च अपडेट किया गया!");
        } catch (err) {
          showToast(err.message);
        }
      });
    });
    // Load Immutable Governance Audit Trail
    const auditBox = document.getElementById("adminAuditContainer");
    if (auditBox) {
      API.getAuditLogs()
        .then((res) => {
          const logs = (res && res.logs) || [];
          if (!logs.length) {
            auditBox.innerHTML = `<div class="audit-row"><span>No audit events yet.</span></div>`;
            return;
          }
          auditBox.innerHTML = logs
            .slice(0, 10)
            .map(
              (l) => `
              <div class="audit-row">
                <span><span class="audit-action">${escapeHtml(l.action)}</span> • ${escapeHtml(l.entityType)} #${escapeHtml(l.entityId)} — ${escapeHtml(l.details)}</span>
                <span class="audit-time">${escapeHtml(l.actor)}</span>
              </div>`
            )
            .join("");
        })
        .catch((err) => {
          console.warn("[GramaGlow] Audit log fetch failed:", err.message);
          auditBox.innerHTML = `<div class="audit-row"><span>Unable to load audit trail: ${escapeHtml(err.message)}</span></div>`;
        });
    }
  }

  /* Modals */
  function openPhotoModal(item) {
    const modal = document.getElementById("evidenceModal");
    document.getElementById("modalTitle").textContent = `#${item.token} — ${state.lang === "en" ? item.titleEn : item.titleHi}`;
    document.getElementById("modalCaption").textContent = state.lang === "en" ? item.photoCaptionEn : item.photoCaptionHi;
    document.getElementById("modalVisual").innerHTML = item.photoDataUrl
      ? `<img src="${item.photoDataUrl}" alt="Citizen field photo" />`
      : `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#0066cc" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
    modal.classList.remove("hidden");
    document.getElementById("closeModalBtn").focus();
  }

  function openLoginModal() {
    document.getElementById("loginError").classList.add("hidden");
    document.getElementById("loginModal").classList.remove("hidden");
    document.getElementById("loginUsername").focus();
  }

  function openSuccessModal(grievance) {
    document.getElementById("successTokenValue").textContent = grievance.token;
    const shareMsg = encodeURIComponent(
      `GramaGlow Pipri Gram Panchayat — Complaint Registered! Token: ${grievance.token} | Category: ${grievance.category} | Ward ${grievance.ward}`
    );
    document.getElementById("shareWhatsappBtn").href = `https://wa.me/?text=${shareMsg}`;
    document.getElementById("successModal").classList.remove("hidden");
    document.getElementById("copyTokenBtn").focus();
  }

  function closeAllModals() {
    document.getElementById("evidenceModal").classList.add("hidden");
    document.getElementById("loginModal").classList.add("hidden");
    document.getElementById("successModal").classList.add("hidden");
  }

  function openGrievanceForm() {
    setActiveTab("grievances");
    const card = document.getElementById("grievanceFormCard");
    card.classList.remove("hidden");
    document.getElementById("toggleGrievanceFormBtn").textContent = t("closeFormBtn");
    document.getElementById("gCitizenName").focus();
  }

  /* Event Bindings & Bootstrap */
  async function init() {
    // Load backend or offline fallback data
    const boot = await API.bootstrap();
    state.data = {
      profile: boot.profile,
      wards: boot.wards || [],
      notices: boot.notices || [],
      projects: boot.projects || [],
      grievances: boot.grievances || [],
      agendaItems: boot.agendaItems || [],
      assets: boot.assets || [],
    };

    // Header & Nav bindings
    document.getElementById("langToggle").addEventListener("click", () => {
      state.lang = state.lang === "en" ? "hi" : "en";
  
    // Voice-Assisted Grievance Dictation (Web Speech Recognition API)
    const voiceBtn = document.getElementById("voiceDictateBtn");
    voiceBtn.addEventListener("click", () => {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        showToast(
          state.lang === "en"
            ? "Voice dictation is not supported in this browser. Please type your complaint."
            : "इस ब्राउज़र में बोलकर लिखने की सुविधा उपलब्ध नहीं है। कृपया टाइप करें।"
        );
        return;
      }
      const recognition = new SpeechRec();
      recognition.lang = state.lang === "hi" ? "hi-IN" : "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      voiceBtn.textContent = t("voiceListening");
      recognition.onresult = (event) => {
        const transcript = event.results[0] && event.results[0][0] ? event.results[0][0].transcript : "";
        const descEl = document.getElementById("gDesc");
        descEl.value = descEl.value ? `${descEl.value} ${transcript}` : transcript;
        showToast(state.lang === "en" ? "Voice text added to description." : "आपकी आवाज़ विवरण में जोड़ दी गई।");
      };
      recognition.onerror = (event) => {
        showToast(
          state.lang === "en"
            ? `Microphone error (${event.error}). Please allow microphone access.`
            : `माइक्रोफ़ोन त्रुटि (${event.error})। कृपया अनुमति दें।`
        );
      };
      recognition.onend = () => {
        voiceBtn.textContent = t("voiceDictateBtn");
      };
      recognition.start();
    });

    // Real-Time Server-Sent Events (SSE) Live Sync
    if (API.isOnline() && typeof EventSource !== "undefined") {
      try {
        const sse = new EventSource("/api/events");
        const refreshFromServer = async () => {
          try {
            const latest = await API.bootstrap();
            state.data.notices = latest.notices || state.data.notices;
            state.data.projects = latest.projects || state.data.projects;
            state.data.grievances = latest.grievances || state.data.grievances;
            state.data.agendaItems = latest.agendaItems || state.data.agendaItems;
            renderAllViews();
          } catch (err) {
            console.warn("[GramaGlow] Live SSE refresh failed:", err.message);
          }
        };
        ["grievance_created", "grievance_updated", "project_updated", "notice_published", "agenda_updated"].forEach(
          (evtName) => sse.addEventListener(evtName, refreshFromServer)
        );
        sse.onerror = () => {
          console.warn("[GramaGlow] SSE stream interrupted; browser will retry automatically.");
        };
      } catch (err) {
        console.warn("[GramaGlow] SSE initialization failed:", err.message);
      }
    }

    // Automatic Offline Queue Sync on Network Reconnect
    window.addEventListener("online", async () => {
      const syncedCount = await API.flushSyncQueue();
      if (syncedCount > 0) {
        const latest = await API.bootstrap();
        state.data.grievances = latest.grievances || state.data.grievances;
        renderAllViews();
        updateConnectionBadge();
        showToast(
          state.lang === "en"
            ? `Synced ${syncedCount} offline complaint(s) to GramaGlow server!`
            : `${syncedCount} ऑफ़लाइन शिकायतें सर्वर पर सिंक हो गईं!`
        );
      }
    });

    applyTranslations();
    });

    document.getElementById("roleToggleBtn").addEventListener("click", () => {
      if (state.activeTab === "admin") {
        setActiveTab("overview");
      } else {
        setActiveTab("admin");
      }
    });

    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
    });
    document.querySelectorAll("[data-jump]").forEach((btn) => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.jump));
    });
    document.querySelector("[data-nav='overview']").addEventListener("click", (e) => {
      e.preventDefault();
      setActiveTab("overview");
    });

    document.getElementById("heroReportBtn").addEventListener("click", openGrievanceForm);
    document.getElementById("shortcutReportBtn").addEventListener("click", openGrievanceForm);

    // Ward Roster toggle
    const toggleWardsBtn = document.getElementById("toggleWardsBtn");
    toggleWardsBtn.addEventListener("click", () => {
      const expanded = toggleWardsBtn.getAttribute("aria-expanded") === "true";
      toggleWardsBtn.setAttribute("aria-expanded", String(!expanded));
      document.getElementById("wardRosterContainer").classList.toggle("hidden", expanded);
    });

    // Audio close
    document.getElementById("closeAudioBtn").addEventListener("click", () => {
      document.getElementById("audioReaderBox").classList.add("hidden");
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    });

    // Agenda form
    document.getElementById("agendaForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("agendaTitleInput").value.trim();
      const proposedBy = document.getElementById("agendaProposerInput").value.trim();
      const ward = Number(document.getElementById("agendaWardSelect").value);
      if (title.length < 5 || proposedBy.length < 2) {
        showToast(state.lang === "en" ? "Please enter an agenda topic (5+ chars) and your name." : "कृपया विषय (5+ अक्षर) और अपना नाम दर्ज करें।");
        return;
      }
      try {
        const res = await API.addAgendaItem({ title, proposedBy, ward });
        state.data.agendaItems.push(res.agendaItem);
        document.getElementById("agendaForm").reset();
        renderAgenda();
        showToast(state.lang === "en" ? "Agenda item added!" : "ग्राम सभा विषय जोड़ा गया!");
      } catch (err) {
        showToast(err.message);
      }
    });

    // Grievance Form Toggle & Demo Auto-Fill
    document.getElementById("toggleGrievanceFormBtn").addEventListener("click", () => {
      const card = document.getElementById("grievanceFormCard");
      const nowHidden = card.classList.toggle("hidden");
      document.getElementById("toggleGrievanceFormBtn").textContent = nowHidden ? t("openFormBtn") : t("closeFormBtn");
    });

    document.getElementById("demoFillBtn").addEventListener("click", () => {
      document.getElementById("gCategory").value = "Streetlights";
      document.getElementById("gWard").value = "3";
      document.getElementById("gCitizenName").value = "D Ankit Swamy";
      document.getElementById("gCitizenPhone").value = "9849025050";
      document.getElementById("gLandmark").value = "North School Road, Pole #18";
      document.getElementById("gTitle").value = "Broken Solar Street Lamp near School Bus Stop";
      document.getElementById("gDesc").value = "Solar LED fixture has been flickering and completely dark since last night, causing safety issues for evening commuters.";
    });

    // Real Photo Upload with Preview & Validation
    document.getElementById("gPhotoInput").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        showToast("Please select a valid image file (PNG, JPG, WebP).");
        e.target.value = "";
        return;
      }
      if (file.size > 1.5 * 1024 * 1024) {
        showToast("Image must be smaller than 1.5 MB.");
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        state.uploadedPhotoDataUrl = reader.result;
        document.getElementById("gPhotoPreviewImg").src = reader.result;
        document.getElementById("gPhotoPreviewWrap").classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    });

    document.getElementById("clearPhotoBtn").addEventListener("click", () => {
      state.uploadedPhotoDataUrl = null;
      document.getElementById("gPhotoInput").value = "";
      document.getElementById("gPhotoPreviewWrap").classList.add("hidden");
    });

    // Grievance Submit
    document.getElementById("grievanceForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = document.getElementById("gFormError");
      errBox.classList.add("hidden");

      const payload = {
        category: document.getElementById("gCategory").value,
        ward: Number(document.getElementById("gWard").value),
        citizenName: document.getElementById("gCitizenName").value.trim(),
        citizenPhone: document.getElementById("gCitizenPhone").value.trim(),
        landmark: document.getElementById("gLandmark").value.trim(),
        title: document.getElementById("gTitle").value.trim(),
        description: document.getElementById("gDesc").value.trim(),
        photoDataUrl: state.uploadedPhotoDataUrl,
      };

      if (payload.citizenName.length < 2 || payload.landmark.length < 3 || payload.title.length < 5 || payload.description.length < 8) {
        errBox.textContent =
          state.lang === "en"
            ? "Please fill in your name, landmark, title (5+ chars), and description (8+ chars)."
            : "कृपया अपना नाम, स्थान, शीर्षक (5+ अक्षर) और विवरण (8+ अक्षर) सही से भरें।";
        errBox.classList.remove("hidden");
        return;
      }

      try {
        const res = await API.submitGrievance(payload);
        state.data.grievances.unshift(res.grievance);
        document.getElementById("grievanceForm").reset();
        state.uploadedPhotoDataUrl = null;
        document.getElementById("gPhotoPreviewWrap").classList.add("hidden");
        document.getElementById("grievanceFormCard").classList.add("hidden");
        document.getElementById("toggleGrievanceFormBtn").textContent = t("openFormBtn");
        renderAllViews();
        openSuccessModal(res.grievance);
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove("hidden");
      }
    });

    // Copy Token
    document.getElementById("copyTokenBtn").addEventListener("click", async () => {
      const token = document.getElementById("successTokenValue").textContent;
      try {
        await navigator.clipboard.writeText(token);
        showToast(state.lang === "en" ? `Token ${token} copied!` : `टोकन ${token} कॉपी किया गया!`);
      } catch (err) {
        console.warn("[GramaGlow] Clipboard unavailable:", err.message);
        showToast(`${t("successTokenLabel")}: ${token}`);
      }
    });

    // Sarpanch Login
    document.getElementById("loginDemoFillBtn").addEventListener("click", () => {
      document.getElementById("loginUsername").value = "sarpanch";
      document.getElementById("loginPassword").value = "sarpanch2026";
    });

    document.getElementById("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = document.getElementById("loginError");
      errBox.classList.add("hidden");
      const username = document.getElementById("loginUsername").value.trim();
      const password = document.getElementById("loginPassword").value;
      try {
        await API.loginAdmin(username, password);
        state.isAdminAuthenticated = true;
        closeAllModals();
        renderAdminDashboard();
        setActiveTab("admin");
        showToast(state.lang === "en" ? "Signed in as Sarpanch Admin." : "सरपंच एडमिन के रूप में लॉगिन सफल।");
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove("hidden");
      }
    });

    document.getElementById("adminLogoutBtn").addEventListener("click", () => {
      API.setAdminToken("");
      state.isAdminAuthenticated = false;
      setActiveTab("overview");
      showToast(state.lang === "en" ? "Signed out of Sarpanch Admin." : "लॉग आउट सफल।");
    });

    // Admin Notice Publisher
    document.getElementById("adminNoticeForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        category: document.getElementById("nCategory").value,
        titleEn: document.getElementById("nTitleEn").value.trim(),
        titleHi: document.getElementById("nTitleHi").value.trim(),
        bodyEn: document.getElementById("nBodyEn").value.trim(),
        bodyHi: document.getElementById("nBodyHi").value.trim(),
        scriptHi: document.getElementById("nBodyHi").value.trim(),
      };
      try {
        const res = await API.publishNotice(payload);
        state.data.notices.unshift(res.notice);
        document.getElementById("adminNoticeForm").reset();
        renderAllViews();
        showToast(state.lang === "en" ? "Official notice published!" : "नई ग्राम सूचना प्रकाशित की गई!");
      } catch (err) {
        showToast(err.message);
      }
    });

    // Modal Close & Escape Key
    ["closeModalBtn", "closeLoginModalBtn", "closeSuccessModalBtn"].forEach((id) => {
      document.getElementById(id).addEventListener("click", closeAllModals);
    });
    ["evidenceModal", "loginModal", "successModal"].forEach((id) => {
      document.getElementById(id).addEventListener("click", (e) => {
        if (e.target.id === id) closeAllModals();
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllModals();
    });


    // Voice-Assisted Grievance Dictation (Web Speech Recognition API)
    const voiceBtn = document.getElementById("voiceDictateBtn");
    voiceBtn.addEventListener("click", () => {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        showToast(
          state.lang === "en"
            ? "Voice dictation is not supported in this browser. Please type your complaint."
            : "इस ब्राउज़र में बोलकर लिखने की सुविधा उपलब्ध नहीं है। कृपया टाइप करें।"
        );
        return;
      }
      const recognition = new SpeechRec();
      recognition.lang = state.lang === "hi" ? "hi-IN" : "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      voiceBtn.textContent = t("voiceListening");
      recognition.onresult = (event) => {
        const transcript = event.results[0] && event.results[0][0] ? event.results[0][0].transcript : "";
        const descEl = document.getElementById("gDesc");
        descEl.value = descEl.value ? `${descEl.value} ${transcript}` : transcript;
        showToast(state.lang === "en" ? "Voice text added to description." : "आपकी आवाज़ विवरण में जोड़ दी गई।");
      };
      recognition.onerror = (event) => {
        showToast(
          state.lang === "en"
            ? `Microphone error (${event.error}). Please allow microphone access.`
            : `माइक्रोफ़ोन त्रुटि (${event.error})। कृपया अनुमति दें।`
        );
      };
      recognition.onend = () => {
        voiceBtn.textContent = t("voiceDictateBtn");
      };
      recognition.start();
    });

    // Real-Time Server-Sent Events (SSE) Live Sync
    if (API.isOnline() && typeof EventSource !== "undefined") {
      try {
        const sse = new EventSource("/api/events");
        const refreshFromServer = async () => {
          try {
            const latest = await API.bootstrap();
            state.data.notices = latest.notices || state.data.notices;
            state.data.projects = latest.projects || state.data.projects;
            state.data.grievances = latest.grievances || state.data.grievances;
            state.data.agendaItems = latest.agendaItems || state.data.agendaItems;
            renderAllViews();
          } catch (err) {
            console.warn("[GramaGlow] Live SSE refresh failed:", err.message);
          }
        };
        ["grievance_created", "grievance_updated", "project_updated", "notice_published", "agenda_updated"].forEach(
          (evtName) => sse.addEventListener(evtName, refreshFromServer)
        );
        sse.onerror = () => {
          console.warn("[GramaGlow] SSE stream interrupted; browser will retry automatically.");
        };
      } catch (err) {
        console.warn("[GramaGlow] SSE initialization failed:", err.message);
      }
    }

    // Automatic Offline Queue Sync on Network Reconnect
    window.addEventListener("online", async () => {
      const syncedCount = await API.flushSyncQueue();
      if (syncedCount > 0) {
        const latest = await API.bootstrap();
        state.data.grievances = latest.grievances || state.data.grievances;
        renderAllViews();
        updateConnectionBadge();
        showToast(
          state.lang === "en"
            ? `Synced ${syncedCount} offline complaint(s) to GramaGlow server!`
            : `${syncedCount} ऑफ़लाइन शिकायतें सर्वर पर सिंक हो गईं!`
        );
      }
    });

    applyTranslations();
  }

  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[GramaGlow] Service Worker registration skipped:", err.message);
      });
    });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
