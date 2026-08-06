const APP_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  configEndpoint: "/.netlify/functions/public-config",
  adminPicksEndpoint: "/.netlify/functions/admin-picks",
  adminBriefsEndpoint: "/.netlify/functions/admin-briefs",
};

const DEMO_KEY = "triplelinea-demo-picks";
const DEMO_BRIEFS_KEY = "triplelinea-demo-briefs";
const state = { supabase: null, session: null, picks: [], briefs: [] };

const mode = document.querySelector("#admin-mode");
const accessCard = document.querySelector("#admin-access");
const accessForm = document.querySelector("#admin-login-form");
const accessStatus = document.querySelector("#admin-access-status");
const editorPanel = document.querySelector("#editor-panel");
const pickForm = document.querySelector("#pick-form");
const gameDate = document.querySelector("#game-date");
const autoDateTime = document.querySelector("#auto-datetime");
const dailyList = document.querySelector("#daily-picks-list");
const previewDate = document.querySelector("#daily-preview-date");
const publishStatus = document.querySelector("#publish-status");
const briefForm = document.querySelector("#brief-form");
const briefDate = document.querySelector("#brief-date");
const briefStatus = document.querySelector("#brief-status");
const briefPreviewDate = document.querySelector("#brief-preview-date");
const dailyBriefList = document.querySelector("#daily-brief-list");

function isConfigured() { return Boolean(APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseAnonKey); }
async function loadRuntimeConfig() {
  try {
    const response = await fetch(APP_CONFIG.configEndpoint, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    APP_CONFIG.supabaseUrl = String(data.supabaseUrl || "");
    APP_CONFIG.supabaseAnonKey = String(data.supabaseAnonKey || "");
  } catch {
    // Sin servidor se conserva el modo de demostración local.
  }
}
function dateParts(date = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
}
function appDate(date = new Date()) { const parts = dateParts(date); return `${parts.year}-${parts.month}-${parts.day}`; }
function readableDate(date = new Date()) { return new Intl.DateTimeFormat("es-US", { dateStyle: "full", timeStyle: "short", timeZone: "America/New_York" }).format(date); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[character])); }
function safeLink(value) { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
function setStatus(target, message, error = false) { target.textContent = message; target.style.color = error ? "#ff9c86" : "#b9d5ac"; }
function readLocal(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } }
function writeLocal(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function deriveTeamName(selection) {
  const trimmed = String(selection || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(moneyline|ml|spread|total|over|under|más de|menos de)\b.*$/i, "")
    .replace(/\s[+-]\d+(?:\.\d+)?\b/g, "")
    .trim();
  return (trimmed || "Selección deportiva").slice(0, 80);
}
function detectOdds(selection) {
  const american = String(selection || "").match(/(?:^|\s)([+-]\d{3,4})(?=\s|\)|$)/);
  if (american) return american[1];
  const decimal = String(selection || "").match(/(?:^|\s)([1-9]\d?\.\d{1,2})(?=\s|\)|$)/);
  return decimal ? decimal[1] : "Pendiente de verificación";
}
function refreshAutomaticDate() {
  const now = new Date();
  pickForm.elements["starts-at"].value = now.toISOString();
  if (!pickForm.elements["pick-id"].value) gameDate.value = appDate(now);
  autoDateTime.textContent = readableDate(now);
  previewDate.textContent = gameDate.value || appDate(now);
}

async function getSupabase() {
  if (!isConfigured()) return null;
  if (state.supabase) return state.supabase;
  const module = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  state.supabase = module.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey);
  return state.supabase;
}

function setMode(label) { mode.textContent = label; }

function renderDailyPicks() {
  previewDate.textContent = gameDate.value || "Fecha actual";
  if (!state.picks.length) {
    dailyList.innerHTML = "<p>No hay publicaciones para esta fecha.</p>";
    return;
  }
  dailyList.innerHTML = state.picks.map((pick, index) => `
    <article class="daily-pick-item">
      <strong>${String(index + 1).padStart(2, "0")} · ${escapeHtml(pick.selection)}</strong>
      <span>${escapeHtml(pick.team_name || deriveTeamName(pick.selection))} · ${escapeHtml(pick.event || "Evento por confirmar")}</span>
      <button type="button" data-edit-pick="${escapeHtml(pick.id)}">Editar</button>
    </article>`).join("");
  dailyList.querySelectorAll("[data-edit-pick]").forEach((button) => button.addEventListener("click", () => editPick(button.dataset.editPick)));
}

function renderDailyBriefs() {
  briefPreviewDate.textContent = briefDate.value || "Fecha actual";
  if (!state.briefs.length) {
    dailyBriefList.innerHTML = "<p>No hay análisis diarios para esta fecha.</p>";
    return;
  }
  dailyBriefList.innerHTML = state.briefs.map((brief) => `
    <article class="daily-pick-item">
      <strong>${escapeHtml(brief.title)}</strong>
      <span>${escapeHtml(brief.category)} · ${escapeHtml(brief.published_date)}</span>
      <button type="button" data-edit-brief="${escapeHtml(brief.id)}">Editar</button>
    </article>`).join("");
  dailyBriefList.querySelectorAll("[data-edit-brief]").forEach((button) => button.addEventListener("click", () => editBrief(button.dataset.editBrief)));
}

async function loadPicks() {
  const date = gameDate.value;
  if (!date) return;
  setStatus(publishStatus, "");
  if (!isConfigured()) {
    state.picks = readLocal(DEMO_KEY).filter((pick) => pick.game_date === date);
    renderDailyPicks();
    return;
  }
  const response = await fetch(`${APP_CONFIG.adminPicksEndpoint}?date=${encodeURIComponent(date)}`, { headers: { Authorization: `Bearer ${state.session.access_token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { setStatus(publishStatus, data.error || "No pudimos cargar las publicaciones.", true); return; }
  state.picks = data.picks || [];
  renderDailyPicks();
}

async function loadBriefs() {
  const date = briefDate.value;
  if (!date) return;
  setStatus(briefStatus, "");
  if (!isConfigured()) {
    state.briefs = readLocal(DEMO_BRIEFS_KEY).filter((brief) => brief.published_date === date);
    renderDailyBriefs();
    return;
  }
  const response = await fetch(`${APP_CONFIG.adminBriefsEndpoint}?date=${encodeURIComponent(date)}`, { headers: { Authorization: `Bearer ${state.session.access_token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { setStatus(briefStatus, data.error || "No pudimos cargar los análisis.", true); return; }
  state.briefs = data.briefs || [];
  renderDailyBriefs();
}

function editPick(id) {
  const pick = state.picks.find((item) => item.id === id);
  if (!pick) return;
  pickForm.elements["pick-id"].value = pick.id;
  gameDate.value = pick.game_date || appDate();
  pickForm.elements.selection.value = pick.selection || "";
  pickForm.elements.analysis.value = pick.analysis || "";
  pickForm.elements["sport-detail"].value = pick.sport === "Deportes" ? "" : (pick.sport || "");
  pickForm.elements["league-detail"].value = pick.league === "Análisis diario" ? "" : (pick.league || "");
  pickForm.elements["event-detail"].value = pick.event === pick.selection ? "" : (pick.event || "");
  pickForm.elements["team-name-detail"].value = pick.team_name || "";
  pickForm.elements["pick-link"].value = (pick.offers || []).find((offer) => offer.link_url)?.link_url || "";
  refreshAutomaticDate();
  setStatus(publishStatus, "Editando una publicación. Se conservará su fecha original.");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function editBrief(id) {
  const brief = state.briefs.find((item) => item.id === id);
  if (!brief) return;
  briefForm.elements["brief-id"].value = brief.id;
  briefDate.value = brief.published_date || appDate();
  briefForm.elements.category.value = brief.category || "";
  briefForm.elements.title.value = brief.title || "";
  briefForm.elements.summary.value = brief.summary || "";
  briefForm.elements["source-url"].value = brief.source_url || "";
  setStatus(briefStatus, "Editando un análisis diario.");
  window.scrollTo({ top: document.querySelector(".brief-editor").offsetTop - 24, behavior: "smooth" });
}

function resetPickForm() {
  pickForm.reset();
  pickForm.elements["pick-id"].value = "";
  refreshAutomaticDate();
}
function resetBriefForm() {
  const date = briefDate.value || appDate();
  briefForm.reset();
  briefForm.elements["brief-id"].value = "";
  briefDate.value = date;
}

pickForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  refreshAutomaticDate();
  const form = new FormData(pickForm);
  const selection = String(form.get("selection") || "").trim();
  const analysis = String(form.get("analysis") || "").trim();
  const teamName = String(form.get("team-name-detail") || "").trim() || deriveTeamName(selection);
  const rawLink = String(form.get("pick-link") || "").trim();
  const pickLink = rawLink ? safeLink(rawLink) : "";
  if (rawLink && !pickLink) { setStatus(publishStatus, "El enlace debe comenzar con http:// o https://.", true); return; }
  const pick = {
    id: String(form.get("pick-id") || ""),
    game_date: String(form.get("game-date") || appDate()),
    sport: String(form.get("sport-detail") || "").trim() || "Deportes",
    league: String(form.get("league-detail") || "").trim() || "Análisis diario",
    event: String(form.get("event-detail") || "").trim() || selection,
    team_name: teamName,
    team_logo_url: "",
    market: "Selección editorial",
    selection,
    analysis,
    starts_at: String(form.get("starts-at") || new Date().toISOString()),
    offers: [{ book_name: pickLink ? "Abrir enlace de la jugada" : "Cuota publicada", odds: detectOdds(selection), link_url: pickLink }],
  };
  if (!pick.selection || !pick.analysis) { setStatus(publishStatus, "Escribe la jugada y el análisis antes de publicar.", true); return; }
  setStatus(publishStatus, "Guardando publicación…");
  try {
    if (!isConfigured()) {
      const all = readLocal(DEMO_KEY);
      const count = all.filter((item) => item.game_date === pick.game_date && item.id !== pick.id).length;
      if (count >= 3) throw new Error("Ya hay tres publicaciones para esta fecha.");
      const completePick = { ...pick, id: pick.id || `demo-${Date.now()}`, published: true };
      writeLocal(DEMO_KEY, pick.id ? all.map((item) => item.id === pick.id ? completePick : item) : [...all, completePick]);
    } else {
      const response = await fetch(APP_CONFIG.adminPicksEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.session.access_token}` },
        body: JSON.stringify(pick),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No fue posible guardar la publicación.");
    }
    setStatus(publishStatus, "Publicación guardada. Revísala en el sitio de miembros.");
    resetPickForm();
    await loadPicks();
  } catch (error) { setStatus(publishStatus, error.message || "No fue posible guardar la publicación.", true); }
});

briefForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(briefForm);
  const sourceUrl = String(form.get("source-url") || "").trim();
  if (sourceUrl && !safeLink(sourceUrl)) { setStatus(briefStatus, "La fuente debe comenzar con http:// o https://.", true); return; }
  const brief = {
    id: String(form.get("brief-id") || ""),
    published_date: String(form.get("brief-date") || appDate()),
    category: String(form.get("category") || "").trim(),
    title: String(form.get("title") || "").trim(),
    summary: String(form.get("summary") || "").trim(),
    source_url: sourceUrl ? safeLink(sourceUrl) : "",
  };
  if (!brief.category || !brief.title || !brief.summary) { setStatus(briefStatus, "Completa categoría, título y resumen.", true); return; }
  setStatus(briefStatus, "Guardando análisis…");
  try {
    if (!isConfigured()) {
      const all = readLocal(DEMO_BRIEFS_KEY);
      const count = all.filter((item) => item.published_date === brief.published_date && item.id !== brief.id).length;
      if (count >= 6) throw new Error("Ya hay seis análisis para esta fecha.");
      const complete = { ...brief, id: brief.id || `brief-${Date.now()}` };
      writeLocal(DEMO_BRIEFS_KEY, brief.id ? all.map((item) => item.id === brief.id ? complete : item) : [...all, complete]);
    } else {
      const response = await fetch(APP_CONFIG.adminBriefsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.session.access_token}` },
        body: JSON.stringify(brief),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No fue posible guardar el análisis.");
    }
    setStatus(briefStatus, "Análisis diario guardado.");
    resetBriefForm();
    await loadBriefs();
  } catch (error) { setStatus(briefStatus, error.message || "No fue posible guardar el análisis.", true); }
});

briefDate.addEventListener("change", () => { resetBriefForm(); loadBriefs(); });

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isConfigured()) return;
  const form = new FormData(accessForm);
  setStatus(accessStatus, "Entrando…");
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email: form.get("email"), password: form.get("password") });
    if (error) throw error;
    await loadAccess();
  } catch (error) { setStatus(accessStatus, error.message || "No fue posible iniciar sesión.", true); }
});

document.querySelector("#admin-logout").addEventListener("click", async () => {
  const supabase = await getSupabase();
  if (supabase) await supabase.auth.signOut();
  state.session = null;
  editorPanel.hidden = true;
  accessCard.hidden = false;
  setMode("ACCESO REQUERIDO");
});

async function loadAccess() {
  if (!gameDate.value) gameDate.value = appDate();
  if (!briefDate.value) briefDate.value = appDate();
  refreshAutomaticDate();
  if (!isConfigured()) {
    setMode("MODO DEMOSTRACIÓN LOCAL");
    accessCard.hidden = true;
    editorPanel.hidden = false;
    await Promise.all([loadPicks(), loadBriefs()]);
    return;
  }
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { setMode("ACCESO REQUERIDO"); accessCard.hidden = false; editorPanel.hidden = true; return; }
  // Las funciones privadas vuelven a comprobar el permiso con la clave segura.
  // Evita bloquear aquí a un editor válido por retrasos de sesión o de RLS.
  state.session = session;
  setMode("EDITOR ACTIVO");
  accessCard.hidden = true;
  editorPanel.hidden = false;
  await Promise.all([loadPicks(), loadBriefs()]);
}

loadRuntimeConfig()
  .then(loadAccess)
  .catch(() => setStatus(accessStatus, "No pudimos cargar el panel.", true));
