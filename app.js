/* Public Value Cyber Risk Studio (plain JS)
   - Local storage persistence
   - Scenario CRUD
   - Multi-level public value scoring
   - Simple cost model with uncertainty band
   - Export/import JSON + export Markdown
*/

const STORAGE_KEY = "pvcrs_scenarios_v1";
const SELECTED_KEY = "pvcrs_selected_id_v1";

const VALUE_SETS = {
  individualLevel: [
    ["access", "Access (service availability)"],
    ["equity", "Equity (disproportionate harm)"],
    ["privacy", "Privacy & dignity"],
    ["safety", "Safety & well-being"],
    ["burden", "Burden (time/stress/cost)"]
  ],
  organizationalLevel: [
    ["serviceContinuity", "Service continuity"],
    ["missionIntegrity", "Mission integrity"],
    ["accountability", "Accountability & auditability"],
    ["capacityStrain", "Capacity strain (staff/backlog)"],
    ["interorganizationalTrust", "Interorganizational trust"]
  ],
  societalLevel: [
    ["legitimacy", "Legitimacy & trust"],
    ["socialEquity", "Social equity (system-wide)"],
    ["collectiveSafety", "Collective safety"],
    ["democraticIntegrity", "Democratic integrity"],
    ["resilience", "Societal resilience"]
  ]
};

function uid() {
  return "RS-" + Math.random().toString(16).slice(2, 8).toUpperCase();
}

function nowISO() {
  return new Date().toISOString();
}

function defaultScenario() {
  return {
    id: uid(),
    meta: {
      title: "New Scenario",
      tags: [],
      notes: "",
      createdAt: nowISO(),
      updatedAt: nowISO()
    },
    riskScenario: {
      threatType: "ransomware",
      actorSophistication: "medium",
      intent: ["disruption", "extortion"],
      likelihood: "medium",
      timeHorizon: "short"
    },
    serviceEcosystem: {
      primaryService: "",
      dependentServices: [],
      organizationsInvolved: [],
      dependencyDepth: "medium",
      geographicScope: "regional"
    },
    serviceDisruption: {
      severity: "medium",
      durationHours: 0,
      degradedModeAvailable: false,
      cascadeNotes: ""
    },
    publicValueImpacts: {
      individualLevel: initScores("individualLevel"),
      organizationalLevel: initScores("organizationalLevel"),
      societalLevel: initScores("societalLevel"),
      equityWeight: 1.0,
      equityNotes: ""
    },
    costProfile: {
      inputs: {
        populationAffected: 0,
        timeBurdenHoursPerPerson: 0,
        valueOfTimePerHour: 0,
        orgMultiplier: 1.0,
        socMultiplier: 1.0,
        uncertainty: "medium",
        assumptions: []
      }
    },
    governance: {
      notes: ""
    }
  };
}

function initScores(levelKey) {
  const scores = {};
  for (const [k] of VALUE_SETS[levelKey]) scores[k] = 0;
  return scores;
}

/* ---------- persistence ---------- */

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

function loadSelectedId() {
  return localStorage.getItem(SELECTED_KEY);
}

function saveSelectedId(id) {
  localStorage.setItem(SELECTED_KEY, id);
}

/* ---------- state ---------- */

let scenarios = loadAll();
if (scenarios.length === 0) {
  scenarios = [defaultScenario()];
  saveAll(scenarios);
}
let selectedId = loadSelectedId() || scenarios[0].id;
if (!scenarios.find(s => s.id === selectedId)) selectedId = scenarios[0].id;

function selectedScenario() {
  return scenarios.find(s => s.id === selectedId);
}

/* ---------- DOM refs ---------- */

const el = (id) => document.getElementById(id);

const scenarioList = el("scenarioList");
const searchInput = el("search");

const btnNew = el("btnNew");
const btnDuplicate = el("btnDuplicate");
const btnDelete = el("btnDelete");
const btnSave = el("btnSave");
const saveStatus = el("saveStatus");

const btnExportJSON = el("btnExportJSON");
const fileImport = el("fileImport");
const btnExportMD = el("btnExportMD");

const tabs = Array.from(document.querySelectorAll(".tab"));
const panes = {
  builder: el("tab-builder"),
  values: el("tab-values"),
  costs: el("tab-costs"),
  dashboard: el("tab-dashboard")
};

/* Builder refs */
const metaTitle = el("metaTitle");
const metaTags = el("metaTags");
const metaNotes = el("metaNotes");

const threatType = el("threatType");
const actorSoph = el("actorSoph");
const likelihood = el("likelihood");
const timeHorizon = el("timeHorizon");

const primaryService = el("primaryService");
const dependentServices = el("dependentServices");
const orgsInvolved = el("orgsInvolved");
const dependencyDepth = el("dependencyDepth");
const geoScope = el("geoScope");

const disruptionSeverity = el("disruptionSeverity");
const durationHours = el("durationHours");
const degradedMode = el("degradedMode");
const cascadeNotes = el("cascadeNotes");

/* Values refs */
const valuesIndividual = el("valuesIndividual");
const valuesOrg = el("valuesOrg");
const valuesSoc = el("valuesSoc");
const equityWeight = el("equityWeight");
const equityNotes = el("equityNotes");
const btnSaveValues = el("btnSaveValues");

/* Costs refs */
const popAffected = el("popAffected");
const timeBurden = el("timeBurden");
const valueOfTime = el("valueOfTime");
const orgMultiplier = el("orgMultiplier");
const socMultiplier = el("socMultiplier");
const uncertainty = el("uncertainty");
const assumptions = el("assumptions");
const btnSaveCosts = el("btnSaveCosts");

const kpiInd = el("kpiInd");
const kpiOrg = el("kpiOrg");
const kpiSoc = el("kpiSoc");
const kpiTotal = el("kpiTotal");
const costExplain = el("costExplain");

/* Dashboard refs */
const dashLikelihood = el("dashLikelihood");
const dashSeverity = el("dashSeverity");
const dashEquity = el("dashEquity");
const dashCost = el("dashCost");
const avgInd = el("avgInd");
const avgOrg = el("avgOrg");
const avgSoc = el("avgSoc");
const ecosystemSummary = el("ecosystemSummary");
const cascadeSummary = el("cascadeSummary");
const govNotes = el("govNotes");
const btnSaveGov = el("btnSaveGov");

/* ---------- UI helpers ---------- */

function fmtUSD(n) {
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function parseLines(text) {
  return text
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

function parseTags(text) {
  return text
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function setStatus(msg) {
  saveStatus.textContent = msg;
  setTimeout(() => (saveStatus.textContent = "Saved locally."), 1500);
}

function updateTimestamp(s) {
  s.meta.updatedAt = nowISO();
}

/* ---------- rendering ---------- */

function renderScenarioList() {
  const q = (searchInput.value || "").trim().toLowerCase();
  const filtered = scenarios
    .slice()
    .sort((a, b) => (a.meta.updatedAt < b.meta.updatedAt ? 1 : -1))
    .filter(s => {
      const hay = (s.meta.title + " " + (s.meta.tags || []).join(" ")).toLowerCase();
      return !q || hay.includes(q);
    });

  scenarioList.innerHTML = "";
  filtered.forEach(s => {
    const div = document.createElement("div");
    div.className = "item" + (s.id === selectedId ? " active" : "");
    div.innerHTML = `
      <div class="item-title">${escapeHTML(s.meta.title || "(untitled)")}</div>
      <div class="item-meta">${escapeHTML((s.meta.tags || []).join(", ") || "no tags")} • Updated ${new Date(s.meta.updatedAt).toLocaleString()}</div>
      <div class="item-meta">${escapeHTML(s.riskScenario.threatType)} • ${escapeHTML(s.serviceEcosystem.primaryService || "no primary service")}</div>
    `;
    div.addEventListener("click", () => {
      selectedId = s.id;
      saveSelectedId(selectedId);
      renderAll();
    });
    scenarioList.appendChild(div);
  });
}

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderBuilder() {
  const s = selectedScenario();
  if (!s) return;

  metaTitle.value = s.meta.title || "";
  metaTags.value = (s.meta.tags || []).join(", ");
  metaNotes.value = s.meta.notes || "";

  threatType.value = s.riskScenario.threatType || "ransomware";
  actorSoph.value = s.riskScenario.actorSophistication || "medium";
  likelihood.value = s.riskScenario.likelihood || "medium";
  timeHorizon.value = s.riskScenario.timeHorizon || "short";

  // intents
  document.querySelectorAll("input.intent").forEach(chk => {
    chk.checked = (s.riskScenario.intent || []).includes(chk.value);
  });

  primaryService.value = s.serviceEcosystem.primaryService || "";
  dependentServices.value = (s.serviceEcosystem.dependentServices || []).join("\n");
  orgsInvolved.value = (s.serviceEcosystem.organizationsInvolved || []).join("\n");
  dependencyDepth.value = s.serviceEcosystem.dependencyDepth || "medium";
  geoScope.value = s.serviceEcosystem.geographicScope || "regional";

  disruptionSeverity.value = s.serviceDisruption.severity || "medium";
  durationHours.value = s.serviceDisruption.durationHours ?? 0;
  degradedMode.value = String(!!s.serviceDisruption.degradedModeAvailable);
  cascadeNotes.value = s.serviceDisruption.cascadeNotes || "";
}

function renderSliders(container, levelKey) {
  container.innerHTML = "";
  const s = selectedScenario();
  const scores = s.publicValueImpacts[levelKey];

  for (const [k, label] of VALUE_SETS[levelKey]) {
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML = `
      <div>
        <label>${escapeHTML(label)}</label>
        <input type="range" min="0" max="5" step="1" value="${scores[k] ?? 0}" data-k="${k}" data-level="${levelKey}" />
      </div>
      <div>
        <input class="input" style="padding:8px 10px" type="number" min="0" max="5" step="1" value="${scores[k] ?? 0}" data-k="${k}" data-level="${levelKey}" />
      </div>
    `;
    container.appendChild(row);
  }

  // wire events: range <-> number mirror
  container.querySelectorAll("input[type='range']").forEach(r => {
    r.addEventListener("input", (e) => {
      const { k, level } = e.target.dataset;
      const v = Number(e.target.value);
      const num = container.querySelector(`input[type='number'][data-k='${k}'][data-level='${level}']`);
      if (num) num.value = String(v);
      s.publicValueImpacts[level][k] = v;
      updateTimestamp(s);
      persist();
      renderDashboard(); // live update
    });
  });

  container.querySelectorAll("input[type='number']").forEach(n => {
    n.addEventListener("input", (e) => {
      const { k, level } = e.target.dataset;
      let v = Number(e.target.value);
      if (!Number.isFinite(v)) v = 0;
      v = Math.max(0, Math.min(5, Math.round(v)));
      e.target.value = String(v);
      const rng = container.querySelector(`input[type='range'][data-k='${k}'][data-level='${level}']`);
      if (rng) rng.value = String(v);
      s.publicValueImpacts[level][k] = v;
      updateTimestamp(s);
      persist();
      renderDashboard();
    });
  });
}

function renderValues() {
  const s = selectedScenario();
  renderSliders(valuesIndividual, "individualLevel");
  renderSliders(valuesOrg, "organizationalLevel");
  renderSliders(valuesSoc, "societalLevel");
  equityWeight.value = s.publicValueImpacts.equityWeight ?? 1.0;
  equityNotes.value = s.publicValueImpacts.equityNotes || "";
}

function uncertaintyPct(key) {
  if (key === "low") return 0.15;
  if (key === "high") return 0.60;
  return 0.35; // medium
}

function computeCosts(s) {
  const inp = s.costProfile.inputs;
  const eqW = Number(s.publicValueImpacts.equityWeight ?? 1.0);

  const pop = Number(inp.populationAffected || 0);
  const hrs = Number(inp.timeBurdenHoursPerPerson || 0);
  const vot = Number(inp.valueOfTimePerHour || 0);
  const orgM = Number(inp.orgMultiplier || 0);
  const socM = Number(inp.socMultiplier || 0);

  const baseInd = pop * hrs * vot * eqW; // simple, transparent

  const baseOrg = baseInd * orgM;
  const baseSoc = baseInd * socM;

  const pct = uncertaintyPct(inp.uncertainty || "medium");
  const band = (x) => [x * (1 - pct), x * (1 + pct)];

  const ind = band(baseInd);
  const org = band(baseOrg);
  const soc = band(baseSoc);
  const total = [ind[0] + org[0] + soc[0], ind[1] + org[1] + soc[1]];

  return { ind, org, soc, total, baseInd, baseOrg, baseSoc, pct };
}

function renderCosts() {
  const s = selectedScenario();
  const inp = s.costProfile.inputs;

  popAffected.value = inp.populationAffected ?? 0;
  timeBurden.value = inp.timeBurdenHoursPerPerson ?? 0;
  valueOfTime.value = inp.valueOfTimePerHour ?? 0;
  orgMultiplier.value = inp.orgMultiplier ?? 1.0;
  socMultiplier.value = inp.socMultiplier ?? 1.0;
  uncertainty.value = inp.uncertainty ?? "medium";
  assumptions.value = (inp.assumptions || []).join("\n");

  const out = computeCosts(s);

  kpiInd.textContent = `${fmtUSD(out.ind[0])} – ${fmtUSD(out.ind[1])}`;
  kpiOrg.textContent = `${fmtUSD(out.org[0])} – ${fmtUSD(out.org[1])}`;
  kpiSoc.textContent = `${fmtUSD(out.soc[0])} – ${fmtUSD(out.soc[1])}`;
  kpiTotal.textContent = `${fmtUSD(out.total[0])} – ${fmtUSD(out.total[1])}`;

  costExplain.innerHTML = `
    <div><strong>Base individual time-cost</strong> = population × hours/person × $/hour × equity weight</div>
    <div class="small muted">${Math.round(inp.populationAffected || 0).toLocaleString()} × ${Number(inp.timeBurdenHoursPerPerson || 0)} × ${fmtUSD(Number(inp.valueOfTimePerHour || 0))}/hr × ${Number(s.publicValueImpacts.equityWeight || 1).toFixed(1)}</div>
    <div style="margin-top:8px"><strong>Org proxy</strong> = baseInd × orgMultiplier (${Number(inp.orgMultiplier || 0).toFixed(1)})</div>
    <div><strong>Soc proxy</strong> = baseInd × socMultiplier (${Number(inp.socMultiplier || 0).toFixed(1)})</div>
    <div style="margin-top:8px"><strong>Uncertainty band</strong> = ±${Math.round(out.pct*100)}%</div>
  `;
}

function avgScore(obj) {
  const vals = Object.values(obj || {}).map(Number).filter(Number.isFinite);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function renderDashboard() {
  const s = selectedScenario();
  if (!s) return;

  dashLikelihood.textContent = s.riskScenario.likelihood || "—";
  dashSeverity.textContent = s.serviceDisruption.severity || "—";
  dashEquity.textContent = (Number(s.publicValueImpacts.equityWeight ?? 1.0)).toFixed(1);

  const out = computeCosts(s);
  dashCost.textContent = `${fmtUSD(out.total[0])} – ${fmtUSD(out.total[1])}`;

  const aInd = avgScore(s.publicValueImpacts.individualLevel);
  const aOrg = avgScore(s.publicValueImpacts.organizationalLevel);
  const aSoc = avgScore(s.publicValueImpacts.societalLevel);

  avgInd.textContent = aInd.toFixed(1);
  avgOrg.textContent = aOrg.toFixed(1);
  avgSoc.textContent = aSoc.toFixed(1);

  ecosystemSummary.innerHTML = `
    <div><strong>Primary service:</strong> ${escapeHTML(s.serviceEcosystem.primaryService || "—")}</div>
    <div><strong>Dependent services:</strong> ${escapeHTML((s.serviceEcosystem.dependentServices || []).join(", ") || "—")}</div>
    <div><strong>Organizations:</strong> ${escapeHTML((s.serviceEcosystem.organizationsInvolved || []).join(", ") || "—")}</div>
    <div><strong>Dependency depth / scope:</strong> ${escapeHTML(s.serviceEcosystem.dependencyDepth)} / ${escapeHTML(s.serviceEcosystem.geographicScope)}</div>
  `;

  cascadeSummary.innerHTML = `
    <div><strong>Duration:</strong> ${Number(s.serviceDisruption.durationHours || 0)} hours</div>
    <div><strong>Degraded mode:</strong> ${s.serviceDisruption.degradedModeAvailable ? "Yes" : "No"}</div>
    <div style="margin-top:8px">${escapeHTML(s.serviceDisruption.cascadeNotes || "—")}</div>
  `;

  govNotes.value = s.governance.notes || "";
}

function renderAll() {
  renderScenarioList();
  renderBuilder();
  renderValues();
  renderCosts();
  renderDashboard();
}

/* ---------- events ---------- */

tabs.forEach(t => {
  t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const which = t.dataset.tab;
    Object.values(panes).forEach(p => p.classList.remove("active"));
    panes[which].classList.add("active");

    // refresh computed views on entry
    if (which === "costs") renderCosts();
    if (which === "dashboard") renderDashboard();
  });
});

searchInput.addEventListener("input", renderScenarioList);

btnNew.addEventListener("click", () => {
  const s = defaultScenario();
  scenarios.push(s);
  selectedId = s.id;
  saveSelectedId(selectedId);
  persist();
  renderAll();
});

btnDuplicate.addEventListener("click", () => {
  const s = selectedScenario();
  if (!s) return;
  const copy = JSON.parse(JSON.stringify(s));
  copy.id = uid();
  copy.meta.title = (s.meta.title || "Scenario") + " (copy)";
  copy.meta.createdAt = nowISO();
  copy.meta.updatedAt = nowISO();
  scenarios.push(copy);
  selectedId = copy.id;
  saveSelectedId(selectedId);
  persist();
  renderAll();
});

btnDelete.addEventListener("click", () => {
  if (scenarios.length <= 1) {
    alert("Keep at least one scenario.");
    return;
  }
  const s = selectedScenario();
  if (!s) return;
  const ok = confirm(`Delete "${s.meta.title}"? This cannot be undone.`);
  if (!ok) return;
  scenarios = scenarios.filter(x => x.id !== s.id);
  selectedId = scenarios[0].id;
  saveSelectedId(selectedId);
  persist();
  renderAll();
});

function persist() {
  saveAll(scenarios);
}

btnSave.addEventListener("click", () => {
  const s = selectedScenario();
  if (!s) return;

  s.meta.title = metaTitle.value.trim() || "Untitled Scenario";
  s.meta.tags = parseTags(metaTags.value);
  s.meta.notes = metaNotes.value;

  s.riskScenario.threatType = threatType.value;
  s.riskScenario.actorSophistication = actorSoph.value;
  s.riskScenario.likelihood = likelihood.value;
  s.riskScenario.timeHorizon = timeHorizon.value;
  s.riskScenario.intent = Array.from(document.querySelectorAll("input.intent"))
    .filter(x => x.checked)
    .map(x => x.value);

  s.serviceEcosystem.primaryService = primaryService.value.trim();
  s.serviceEcosystem.dependentServices = parseLines(dependentServices.value);
  s.serviceEcosystem.organizationsInvolved = parseLines(orgsInvolved.value);
  s.serviceEcosystem.dependencyDepth = dependencyDepth.value;
  s.serviceEcosystem.geographicScope = geoScope.value;

  s.serviceDisruption.severity = disruptionSeverity.value;
  s.serviceDisruption.durationHours = Number(durationHours.value || 0);
  s.serviceDisruption.degradedModeAvailable = degradedMode.value === "true";
  s.serviceDisruption.cascadeNotes = cascadeNotes.value;

  updateTimestamp(s);
  persist();
  renderAll();
  setStatus("Saved.");
});

btnSaveValues.addEventListener("click", () => {
  const s = selectedScenario();
  if (!s) return;
  const ew = Number(equityWeight.value || 1.0);
  s.publicValueImpacts.equityWeight = Number.isFinite(ew) ? ew : 1.0;
  s.publicValueImpacts.equityNotes = equityNotes.value;
  updateTimestamp(s);
  persist();
  renderDashboard();
  setStatus("Saved.");
});

btnSaveCosts.addEventListener("click", () => {
  const s = selectedScenario();
  if (!s) return;
  const inp = s.costProfile.inputs;

  inp.populationAffected = Number(popAffected.value || 0);
  inp.timeBurdenHoursPerPerson = Number(timeBurden.value || 0);
  inp.valueOfTimePerHour = Number(valueOfTime.value || 0);
  inp.orgMultiplier = Number(orgMultiplier.value || 0);
  inp.socMultiplier = Number(socMultiplier.value || 0);
  inp.uncertainty = uncertainty.value;
  inp.assumptions = parseLines(assumptions.value);

  updateTimestamp(s);
  persist();
  renderCosts();
  renderDashboard();
  setStatus("Saved.");
});

btnSaveGov.addEventListener("click", () => {
  const s = selectedScenario();
  if (!s) return;
  s.governance.notes = govNotes.value;
  updateTimestamp(s);
  persist();
  setStatus("Saved.");
});

/* ---------- export / import ---------- */

btnExportJSON.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(scenarios, null, 2)], { type: "application/json" });
  downloadBlob(blob, "pvcrs-scenarios.json");
});

fileImport.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Expected an array of scenarios.");
    // minimal validation
    const cleaned = parsed.filter(x => x && x.id && x.meta && x.riskScenario && x.publicValueImpacts);
    if (cleaned.length === 0) throw new Error("No valid scenarios found.");
    scenarios = cleaned;
    selectedId = scenarios[0].id;
    saveSelectedId(selectedId);
    persist();
    renderAll();
    alert(`Imported ${scenarios.length} scenario(s).`);
  } catch (err) {
    alert("Import failed: " + err.message);
  } finally {
    e.target.value = "";
  }
});

btnExportMD.addEventListener("click", () => {
  const s = selectedScenario();
  if (!s) return;
  const md = scenarioToMarkdown(s);
  const blob = new Blob([md], { type: "text/markdown" });
  const safeTitle = (s.meta.title || "scenario").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  downloadBlob(blob, `pvcrs-${safeTitle}.md`);
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function scenarioToMarkdown(s) {
  const out = computeCosts(s);
  const pv = s.publicValueImpacts;

  const lines = [];
  lines.push(`# Public Value Cyber Risk Scenario`);
  lines.push(``);
  lines.push(`## Metadata`);
  lines.push(`- **ID:** ${s.id}`);
  lines.push(`- **Title:** ${s.meta.title}`);
  lines.push(`- **Tags:** ${(s.meta.tags || []).join(", ") || "—"}`);
  lines.push(`- **Updated:** ${s.meta.updatedAt}`);
  lines.push(``);
  if (s.meta.notes) {
    lines.push(`**Notes:** ${s.meta.notes}`);
    lines.push(``);
  }

  lines.push(`## Threat scenario`);
  lines.push(`- **Type:** ${s.riskScenario.threatType}`);
  lines.push(`- **Actor sophistication:** ${s.riskScenario.actorSophistication}`);
  lines.push(`- **Intent:** ${(s.riskScenario.intent || []).join(", ") || "—"}`);
  lines.push(`- **Likelihood:** ${s.riskScenario.likelihood}`);
  lines.push(`- **Time horizon:** ${s.riskScenario.timeHorizon}`);
  lines.push(``);

  lines.push(`## Service ecosystem`);
  lines.push(`- **Primary service:** ${s.serviceEcosystem.primaryService || "—"}`);
  lines.push(`- **Dependent services:** ${(s.serviceEcosystem.dependentServices || []).join(", ") || "—"}`);
  lines.push(`- **Organizations involved:** ${(s.serviceEcosystem.organizationsInvolved || []).join(", ") || "—"}`);
  lines.push(`- **Dependency depth:** ${s.serviceEcosystem.dependencyDepth}`);
  lines.push(`- **Geographic scope:** ${s.serviceEcosystem.geographicScope}`);
  lines.push(``);

  lines.push(`## Service disruption`);
  lines.push(`- **Severity:** ${s.serviceDisruption.severity}`);
  lines.push(`- **Duration (hours):** ${Number(s.serviceDisruption.durationHours || 0)}`);
  lines.push(`- **Degraded mode available:** ${s.serviceDisruption.degradedModeAvailable ? "Yes" : "No"}`);
  lines.push(`- **Cascade notes:** ${s.serviceDisruption.cascadeNotes || "—"}`);
  lines.push(``);

  lines.push(`## Public value impacts (0–5)`);
  lines.push(`### Individual level`);
  for (const [k, label] of VALUE_SETS.individualLevel) lines.push(`- **${label}:** ${pv.individualLevel[k] ?? 0}`);
  lines.push(``);
  lines.push(`### Organizational level`);
  for (const [k, label] of VALUE_SETS.organizationalLevel) lines.push(`- **${label}:** ${pv.organizationalLevel[k] ?? 0}`);
  lines.push(``);
  lines.push(`### Societal level`);
  for (const [k, label] of VALUE_SETS.societalLevel) lines.push(`- **${label}:** ${pv.societalLevel[k] ?? 0}`);
  lines.push(``);
  lines.push(`- **Equity weight:** ${(Number(pv.equityWeight ?? 1)).toFixed(1)}`);
  lines.push(`- **Equity notes:** ${pv.equityNotes || "—"}`);
  lines.push(``);

  lines.push(`## Cost profile (scenario-based, transparent assumptions)`);
  lines.push(`- **Individual cost range:** ${fmtUSD(out.ind[0])} – ${fmtUSD(out.ind[1])}`);
  lines.push(`- **Organizational cost range:** ${fmtUSD(out.org[0])} – ${fmtUSD(out.org[1])}`);
  lines.push(`- **Societal cost range:** ${fmtUSD(out.soc[0])} – ${fmtUSD(out.soc[1])}`);
  lines.push(`- **Total ecosystem cost range:** ${fmtUSD(out.total[0])} – ${fmtUSD(out.total[1])}`);
  lines.push(`- **Uncertainty band:** ±${Math.round(out.pct * 100)}%`);
  lines.push(``);
  const inp = s.costProfile.inputs;
  lines.push(`### Inputs`);
  lines.push(`- Population affected: ${Number(inp.populationAffected || 0).toLocaleString()}`);
  lines.push(`- Time burden (hours/person): ${Number(inp.timeBurdenHoursPerPerson || 0)}`);
  lines.push(`- Value of time ($/hour): ${Number(inp.valueOfTimePerHour || 0)}`);
  lines.push(`- Org multiplier: ${Number(inp.orgMultiplier || 0)}`);
  lines.push(`- Soc multiplier: ${Number(inp.socMultiplier || 0)}`);
  lines.push(``);
  lines.push(`### Assumptions`);
  (inp.assumptions || []).forEach(a => lines.push(`- ${a}`));
  if (!(inp.assumptions || []).length) lines.push(`- —`);
  lines.push(``);

  lines.push(`## Governance implications (notes)`);
  lines.push(s.governance.notes ? s.governance.notes : "—");
  lines.push(``);

  return lines.join("\n");
}

/* ---------- init ---------- */

function init() {
  saveSelectedId(selectedId);
  renderAll();
}

init();
