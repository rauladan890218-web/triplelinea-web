/*
  Completa solo las claves públicas antes de publicar.
  La facturación debe conectarse únicamente con un proveedor que haya aprobado
  por escrito este modelo de negocio y la jurisdicción objetivo.
*/
const APP_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  configEndpoint: "/.netlify/functions/public-config",
  startTrialEndpoint: "/.netlify/functions/start-trial",
  memberPicksEndpoint: "/.netlify/functions/member-picks",
  memberLibraryEndpoint: "/.netlify/functions/member-library",
  memberBriefsEndpoint: "/.netlify/functions/member-briefs",
  liveScoresEndpoint: "/.netlify/functions/live-scores",
  paymentCheckoutUrl: "",
};

const AGE_KEY = "triplelinea-legal-age-confirmed";
const DEMO_KEY = "triplelinea-demo-picks";
const DEMO_BRIEFS_KEY = "triplelinea-demo-briefs";
const FAVORITES_KEY = "triplelinea-favorites";
const state = { supabase: null, session: null, toolsEnabled: false, currentPicks: [] };
let liveTimer = null;

const ageDialog = document.querySelector("#age-dialog");
const accountDialog = document.querySelector("#account-dialog");
const accountButton = document.querySelector(".account-button");
const membershipState = document.querySelector("#membership-state");
const picksGrid = document.querySelector("#picks-grid");
const briefFeed = document.querySelector("#brief-feed");
const accountStatus = document.querySelector("#account-status");
const accountNote = document.querySelector("#account-note");
const accountTitle = document.querySelector("#account-title");
const loginForm = document.querySelector("#login-form");
const signupForm = document.querySelector("#signup-form");
const activeSession = document.querySelector("#active-session");
const activeSessionEmail = document.querySelector("#active-session-email");
const toolsLock = document.querySelector("#tools-lock");
const premiumTools = document.querySelector("#premium-tools");
const oddsResult = document.querySelector("#odds-result");
const searchResults = document.querySelector("#search-results");
const favoriteList = document.querySelector("#favorite-list");
const liveScores = document.querySelector("#live-scores");
const liveScoreState = document.querySelector("#live-score-state");
const refreshLive = document.querySelector("#refresh-live");

function configured() { return Boolean(APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseAnonKey); }
async function loadRuntimeConfig() {
  try {
    const response = await fetch(APP_CONFIG.configEndpoint, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    APP_CONFIG.supabaseUrl = String(data.supabaseUrl || "");
    APP_CONFIG.supabaseAnonKey = String(data.supabaseAnonKey || "");
    APP_CONFIG.paymentCheckoutUrl = String(data.paymentCheckoutUrl || APP_CONFIG.paymentCheckoutUrl || "");
  } catch {
    // Sin servidor (por ejemplo, al abrir el HTML directamente) se conserva el modo local.
  }
}
function localDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[character])); }
function escapeXml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" }[character])); }
function safeLink(url) { try { const parsed = new URL(url); return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : ""; } catch { return ""; } }
function readLocal(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } }
function setAccountStatus(message, error = false) { accountStatus.textContent = message; accountStatus.style.color = error ? "#ff9c86" : "#aebdd0"; }
function normalize(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function deriveTeamName(selection) {
  const cleaned = String(selection || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(moneyline|ml|spread|total|over|under|más de|menos de)\b.*$/i, "")
    .replace(/\s[+-]\d+(?:\.\d+)?\b/g, "")
    .trim();
  return (cleaned || "Selección deportiva").slice(0, 80);
}
function initials(name) {
  const words = String(name || "Selección").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 3).map((word) => word[0]).join("") : (words[0] || "TL").slice(0, 3)).toUpperCase();
}
function colorIndex(name) { return Array.from(String(name || "")).reduce((sum, character) => sum + character.codePointAt(0), 0) % 6; }
function defaultTeamCrest(name) {
  const palettes = [["#173c7a", "#6da7ff"], ["#741c42", "#ef7373"], ["#126451", "#55d6aa"], ["#6f4a11", "#ffc76e"], ["#392476", "#a891ff"], ["#093b57", "#41b8ea"]];
  const [base, accent] = palettes[colorIndex(name)];
  const label = escapeXml(initials(name));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 96"><path d="M40 3 74 15v30c0 23-15 40-34 48C21 85 6 68 6 45V15L40 3Z" fill="${base}" stroke="#f6fbff" stroke-width="4"/><path d="M40 10 67 20v25c0 17-10 31-27 39-17-8-27-22-27-39V20L40 10Z" fill="${accent}" opacity=".46"/><path d="M15 29h50M40 16v61" stroke="#fff" stroke-width="2" opacity=".32"/><text x="40" y="55" text-anchor="middle" fill="#fff" font-size="23" font-family="Arial, sans-serif" font-weight="800">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function getSupabase() {
  if (!configured()) return null;
  if (state.supabase) return state.supabase;
  const module = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  state.supabase = module.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return state.supabase;
}

function setTab(tab) {
  const signup = tab === "signup";
  loginForm.hidden = signup;
  signupForm.hidden = !signup;
  document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  accountNote.textContent = signup
    ? "La prueba se inicia una sola vez por cuenta cuando el sistema seguro está configurado."
    : "Entra con tu cuenta para revisar si tu prueba o membresía está activa.";
  setAccountStatus("");
}
function openAccount() {
  if (state.session) {
    accountTitle.textContent = "Mi cuenta";
    loginForm.hidden = true;
    signupForm.hidden = true;
    activeSession.hidden = false;
    document.querySelector(".tabs").hidden = true;
    accountNote.textContent = "Puedes seguir usando la página sin volver a entrar.";
    activeSessionEmail.textContent = state.session.user.email || "Cuenta activa";
    setAccountStatus("Sesión activa.");
  } else {
    accountTitle.textContent = "Entra o crea tu acceso.";
    activeSession.hidden = true;
    document.querySelector(".tabs").hidden = false;
    setTab("login");
  }
  accountDialog.showModal();
}

function renderPlaceholders(message) {
  state.currentPicks = [];
  membershipState.textContent = message;
  picksGrid.innerHTML = ["01", "02", "03"].map((number) => `<article class="pick-placeholder"><span>${number}</span><h3>Acceso de miembros</h3><p>Las publicaciones diarias aparecen aquí cuando tu prueba o membresía esté activa.</p></article>`).join("");
}

function renderPicks(picks, demo = false) {
  state.currentPicks = picks;
  if (!picks.length) {
    membershipState.textContent = "Tu acceso está activo. El editor aún no publicó las tres selecciones de hoy.";
    picksGrid.innerHTML = '<article class="pick-placeholder"><span>—</span><h3>Aún no hay publicaciones</h3><p>Vuelve más tarde; el editor puede subir hasta tres análisis por día.</p></article>';
    return;
  }
  membershipState.textContent = demo ? "Vista previa local: estos datos solo aparecen en este dispositivo hasta conectar la base de datos." : `Acceso activo · ${picks.length} publicación${picks.length === 1 ? "" : "es"} disponible${picks.length === 1 ? "" : "s"} hoy.`;
  picksGrid.innerHTML = picks.map((pick, index) => {
    const offers = Array.isArray(pick.offers) ? pick.offers : [];
    const teamName = pick.team_name || deriveTeamName(pick.selection);
    const teamLogo = safeLink(pick.team_logo_url) || defaultTeamCrest(teamName);
    const teamHeader = `<div class="team-mark"><img src="${teamLogo}" alt="Escudo de ${escapeHtml(teamName)}" /><span>${escapeHtml(teamName)}</span></div>`;
    const bookRows = offers.length ? offers.map((offer) => {
      const link = safeLink(offer.link_url);
      const label = escapeHtml(offer.book_name || "Cuota publicada");
      const odds = escapeHtml(offer.odds || "Consultar cuota");
      return link ? `<a class="book-link" href="${link}" target="_blank" rel="noopener noreferrer sponsored"><span>${label}</span><span class="book-odds">${odds} ↗</span></a>` : `<div class="book-no-link"><span>${label}</span><span class="book-odds">${odds}</span></div>`;
    }).join("") : '<div class="book-no-link"><span>Cuotas pendientes de publicar</span></div>';
    return `<article class="pick-card"><div class="pick-meta"><span>${String(index + 1).padStart(2, "0")} · ${escapeHtml(pick.sport || "Deporte")}</span><span>${escapeHtml(pick.league || "")}</span></div>${teamHeader}<h3>${escapeHtml(pick.selection || "Selección editorial")}</h3><p class="pick-event">${escapeHtml(pick.event || "Evento por confirmar")} · ${escapeHtml(pick.market || "Mercado")}</p><p class="pick-analysis">${escapeHtml(pick.analysis || "El editor aún no agregó el contexto de este análisis.")}</p><div class="book-list">${bookRows}</div></article>`;
  }).join("");
}

function renderBriefs(briefs, demo = false) {
  if (!briefs.length) {
    briefFeed.innerHTML = '<article class="brief-placeholder"><span>ACTUALIZACIÓN DIARIA</span><h3>Análisis pendiente de publicación</h3><p>La nota editorial del día aparecerá aquí para miembros activos.</p></article><article class="brief-placeholder"><span>CONTEXTO</span><h3>Lectura de la jornada</h3><p>El editor podrá destacar novedades relevantes y fuentes verificadas.</p></article>';
    return;
  }
  briefFeed.innerHTML = briefs.map((brief) => {
    const source = safeLink(brief.source_url);
    return `<article class="brief-card"><span class="brief-meta">${escapeHtml(brief.category || "ANÁLISIS")} · ${escapeHtml(brief.published_date || "HOY")}${demo ? " · VISTA PREVIA" : ""}</span><h3>${escapeHtml(brief.title)}</h3><p>${escapeHtml(brief.summary)}</p>${source ? `<a href="${source}" target="_blank" rel="noopener noreferrer">Abrir fuente ↗</a>` : ""}</article>`;
  }).join("");
}

function matchingScore(pick, scores) {
  const pickText = normalize(`${pick.event || ""} ${pick.team_name || ""} ${pick.selection || ""}`);
  return scores.find((score) => {
    const home = normalize(score.home_team || score.homeTeam || "");
    const away = normalize(score.away_team || score.awayTeam || "");
    const event = normalize(score.event || score.name || "");
    if (event && pickText.includes(event)) return true;
    const hasHome = home && pickText.includes(home);
    const hasAway = away && pickText.includes(away);
    return hasHome && hasAway;
  });
}
function scoreValue(value) { return value === 0 || value ? escapeHtml(value) : "—"; }
function renderLiveScores(picks, scores = [], options = {}) {
  const { connected = false, message = "" } = options;
  if (!picks.length) {
    liveScoreState.textContent = message || "Inicia tu prueba para activar el seguimiento.";
    liveScores.innerHTML = '<article class="score-placeholder"><span>EN VIVO</span><h3>Seguimiento disponible para miembros</h3><p>Al conectar una fuente autorizada de resultados, aquí se mostrarán los eventos activos de las publicaciones del día.</p></article>';
    return;
  }
  liveScoreState.textContent = connected ? (message || "Fuente de resultados conectada.") : (message || "Marcadores en espera de conexión.");
  liveScores.innerHTML = picks.map((pick) => {
    const match = matchingScore(pick, scores);
    const teamName = pick.team_name || deriveTeamName(pick.selection);
    const crest = safeLink(pick.team_logo_url) || defaultTeamCrest(teamName);
    if (!match) return `<article class="score-card score-waiting"><div class="score-card-top"><span>SEGUIMIENTO</span><span>EN ESPERA</span></div><div class="score-title"><img src="${crest}" alt="" /><div><strong>${escapeHtml(pick.event || teamName)}</strong><small>${escapeHtml(pick.selection)}</small></div></div><p>Aún no hay un marcador activo o coincidencia confirmada para esta publicación.</p></article>`;
    const home = match.home_team || match.homeTeam || "Local";
    const away = match.away_team || match.awayTeam || "Visitante";
    const phase = match.status || match.phase || "EN VIVO";
    const minute = match.minute ? ` · ${escapeHtml(match.minute)}′` : "";
    return `<article class="score-card"><div class="score-card-top"><span>RESULTADO</span><span class="score-live">${escapeHtml(phase)}${minute}</span></div><div class="score-match"><span>${escapeHtml(home)}</span><b>${scoreValue(match.home_score ?? match.homeScore)}<i>–</i>${scoreValue(match.away_score ?? match.awayScore)}</b><span>${escapeHtml(away)}</span></div><p>${escapeHtml(pick.selection)} · ${escapeHtml(pick.event || teamName)}</p></article>`;
  }).join("");
}

function setToolsEnabled(enabled, demo = false) {
  state.toolsEnabled = enabled;
  toolsLock.hidden = enabled;
  premiumTools.hidden = !enabled;
  if (enabled) {
    renderFavorites();
    if (demo) searchResults.innerHTML = "<p>Modo demostración: puedes buscar las publicaciones creadas desde el panel local.</p>";
  }
}

async function loadMemberPicks(session) {
  const response = await fetch(APP_CONFIG.memberPicksEndpoint, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.code === "trial_expired") renderPlaceholders("Tu prueba terminó. Consulta el método de pago aprobado para continuar con la membresía.");
    else renderPlaceholders(data.error || "Tu acceso de miembros todavía no está activo.");
    return { active: false, picks: [] };
  }
  const picks = data.picks || [];
  renderPicks(picks);
  return { active: true, picks };
}
async function loadMemberBriefs(session) {
  const response = await fetch(APP_CONFIG.memberBriefsEndpoint, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const data = await response.json().catch(() => ({}));
  if (response.ok) renderBriefs(data.briefs || []);
}
async function loadLiveScores(session, picks = state.currentPicks) {
  if (!picks.length) { renderLiveScores([], [], { message: "No hay publicaciones que seguir hoy." }); return; }
  if (!configured() || !session) { renderLiveScores(picks, [], { message: "Modo de demostración: conecta una fuente de resultados para ver marcadores reales." }); return; }
  liveScoreState.textContent = "Actualizando resultados…";
  try {
    const response = await fetch(APP_CONFIG.liveScoresEndpoint, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No pudimos actualizar los resultados.");
    renderLiveScores(picks, data.scores || [], { connected: Boolean(data.configured), message: data.message || (data.configured ? "Actualizado desde la fuente de resultados." : "Añade la clave de resultados para activar marcadores reales.") });
  } catch (error) { renderLiveScores(picks, [], { message: error.message || "No pudimos actualizar los resultados." }); }
}
function stopLiveRefresh() {
  if (liveTimer) window.clearInterval(liveTimer);
  liveTimer = null;
}
function startLiveRefresh(session) {
  stopLiveRefresh();
  if (!configured() || !session) return;
  liveTimer = window.setInterval(() => {
    if (!document.hidden) loadLiveScores(session, state.currentPicks);
  }, 120000);
}

async function refreshMembership() {
  if (!configured()) {
    stopLiveRefresh();
    accountButton.textContent = "Mi cuenta";
    const demoPicks = readLocal(DEMO_KEY).filter((pick) => pick.game_date === localDate());
    renderPicks(demoPicks, true);
    renderBriefs(readLocal(DEMO_BRIEFS_KEY).filter((brief) => brief.published_date === localDate()), true);
    setToolsEnabled(true, true);
    await loadLiveScores(null, demoPicks);
    return;
  }
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  state.session = session;
  if (!session) {
    stopLiveRefresh();
    accountButton.textContent = "Mi cuenta";
    renderPlaceholders("Crea una cuenta e inicia la prueba para abrir las publicaciones.");
    renderBriefs([]);
    renderLiveScores([], [], { message: "Inicia tu prueba para activar el seguimiento." });
    setToolsEnabled(false);
    return;
  }
  const userName = session.user.user_metadata?.name || session.user.email?.split("@")[0] || "Mi cuenta";
  accountButton.textContent = userName;
  const result = await loadMemberPicks(session);
  setToolsEnabled(result.active);
  if (result.active) {
    await Promise.all([loadMemberBriefs(session), loadLiveScores(session, result.picks)]);
    startLiveRefresh(session);
  } else {
    stopLiveRefresh();
    renderBriefs([]);
    renderLiveScores([], [], { message: "Tu acceso de miembros todavía no está activo." });
  }
}

async function startTrial() {
  if (!configured()) {
    openAccount();
    setAccountStatus("Antes de registrar usuarios, completa la configuración de Supabase y del proveedor de cobro autorizado en README.md.", true);
    return;
  }
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { openAccount(); setTab("signup"); setAccountStatus("Crea tu cuenta para iniciar la prueba."); return; }
  membershipState.textContent = "Iniciando tu prueba de 30 días…";
  const response = await fetch(APP_CONFIG.startTrialEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { membershipState.textContent = data.error || "No fue posible iniciar la prueba."; return; }
  await refreshMembership();
}
function openApprovedCheckout() {
  const checkoutUrl = safeLink(APP_CONFIG.paymentCheckoutUrl);
  if (!checkoutUrl) {
    openAccount();
    setAccountStatus("El checkout todavía no está habilitado. Solo debes añadir un enlace de pago después de que el proveedor apruebe este negocio y sus métodos permitidos.", true);
    return;
  }
  window.location.assign(checkoutUrl);
}

function parseOdds(rawValue) {
  const value = String(rawValue || "").trim().replace(",", ".");
  if (!value) return null;
  if (/^[+-]\d+(\.\d+)?$/.test(value)) {
    const american = Number(value);
    if (!american || Math.abs(american) < 100) return null;
    return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
  }
  const decimal = Number(value);
  return Number.isFinite(decimal) && decimal > 1 ? decimal : null;
}
function toAmerican(decimal) { const raw = decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1); return `${raw > 0 ? "+" : ""}${Math.round(raw)}`; }
function calculateOdds() {
  const decimal = parseOdds(document.querySelector("#odds-input").value);
  const stake = Number(document.querySelector("#stake-input").value || 0);
  if (!decimal) { oddsResult.textContent = "Escribe una cuota americana, como -110 o +150, o una cuota decimal mayor que 1."; return; }
  const probability = 100 / decimal;
  const gross = stake > 0 ? stake * decimal : null;
  const net = gross !== null ? gross - stake : null;
  oddsResult.innerHTML = `<strong>Cuota decimal: ${decimal.toFixed(2)} · Cuota americana aproximada: ${toAmerican(decimal)}</strong><br />Probabilidad implícita matemática: ${probability.toFixed(1)}%.${gross !== null ? `<br />Ejemplo con US$${stake.toFixed(2)}: retorno bruto US$${gross.toFixed(2)} y diferencia neta US$${net.toFixed(2)}.` : ""}<br /><small>Es un cálculo informativo; no mide probabilidad real ni asegura un resultado.</small>`;
}
function offerDecimal(offer) { return parseOdds(offer.odds); }
function bestOfferText(offers) {
  const candidates = offers.map((offer) => ({ offer, decimal: offerDecimal(offer) })).filter((item) => item.decimal);
  if (!candidates.length) return "Cuotas disponibles para comparar manualmente.";
  const best = candidates.sort((a, b) => b.decimal - a.decimal)[0];
  return `Mayor cuota numérica publicada: ${best.offer.book_name} (${best.offer.odds}). Verifica disponibilidad y legalidad antes de visitar un enlace.`;
}
function getFavorites() { return readLocal(FAVORITES_KEY); }
function renderFavorites() {
  const favorites = getFavorites();
  favoriteList.innerHTML = favorites.length ? favorites.map((pick) => `<div class="favorite-item"><span>${escapeHtml(pick.selection)} · ${escapeHtml(pick.event)}</span><button type="button" data-remove-favorite="${escapeHtml(pick.id)}">Quitar</button></div>`).join("") : "<p>Aún no guardaste publicaciones.</p>";
  favoriteList.querySelectorAll("[data-remove-favorite]").forEach((button) => button.addEventListener("click", () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(getFavorites().filter((pick) => pick.id !== button.dataset.removeFavorite)));
    renderFavorites();
  }));
}
function saveFavorite(pick) {
  const favorites = getFavorites();
  if (favorites.some((item) => item.id === pick.id)) { renderFavorites(); return; }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites, { id: pick.id, selection: pick.selection, event: pick.event, sport: pick.sport }]));
  renderFavorites();
}
function renderSearchResults(picks) {
  if (!picks.length) { searchResults.innerHTML = "<p>No encontramos publicaciones con esa búsqueda.</p>"; return; }
  searchResults.innerHTML = picks.map((pick) => `<article class="search-result"><div><strong>${escapeHtml(pick.selection)} · ${escapeHtml(pick.event)}</strong><span>${escapeHtml(pick.sport)} · ${escapeHtml(pick.league)} · ${escapeHtml(pick.market)}</span></div><button type="button" data-save-favorite="${escapeHtml(pick.id)}">Guardar</button><p class="compare-summary">${escapeHtml(bestOfferText(pick.offers || []))}</p></article>`).join("");
  searchResults.querySelectorAll("[data-save-favorite]").forEach((button) => button.addEventListener("click", () => {
    const pick = picks.find((item) => item.id === button.dataset.saveFavorite);
    if (pick) saveFavorite(pick);
  }));
}
async function searchPicks() {
  const query = document.querySelector("#pick-search").value.trim();
  if (!query) { searchResults.innerHTML = "<p>Escribe un deporte, liga, evento, mercado o selección.</p>"; return; }
  if (!configured()) {
    const lower = query.toLowerCase();
    renderSearchResults(readLocal(DEMO_KEY).filter((pick) => [pick.sport, pick.league, pick.event, pick.team_name, pick.market, pick.selection].join(" ").toLowerCase().includes(lower)).slice(0, 24));
    return;
  }
  if (!state.session || !state.toolsEnabled) { searchResults.innerHTML = "<p>Inicia tu prueba o membresía para usar el buscador.</p>"; return; }
  searchResults.innerHTML = "<p>Buscando publicaciones verificadas…</p>";
  const response = await fetch(`${APP_CONFIG.memberLibraryEndpoint}?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${state.session.access_token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { searchResults.innerHTML = `<p>${escapeHtml(data.error || "No pudimos buscar publicaciones.")}</p>`; return; }
  renderSearchResults(data.picks || []);
}

document.querySelectorAll("[data-open-account]").forEach((button) => button.addEventListener("click", openAccount));
document.querySelectorAll("[data-start-trial]").forEach((button) => button.addEventListener("click", startTrial));
document.querySelectorAll("[data-open-checkout]").forEach((button) => button.addEventListener("click", openApprovedCheckout));
document.querySelector("[data-close-account]").addEventListener("click", () => accountDialog.close());
document.querySelector("#account-logout").addEventListener("click", async () => {
  const supabase = await getSupabase();
  if (supabase) await supabase.auth.signOut();
  state.session = null;
  accountDialog.close();
  await refreshMembership();
});
document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
document.querySelector("#calculate-odds").addEventListener("click", calculateOdds);
document.querySelector("#search-picks").addEventListener("click", searchPicks);
document.querySelector("#pick-search").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); searchPicks(); } });
refreshLive.addEventListener("click", () => loadLiveScores(state.session, state.currentPicks));

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!configured()) { setAccountStatus("Falta configurar Supabase antes de aceptar registros reales.", true); return; }
  const form = new FormData(loginForm); setAccountStatus("Entrando…");
  try { const supabase = await getSupabase(); const { error } = await supabase.auth.signInWithPassword({ email: form.get("email"), password: form.get("password") }); if (error) throw error; accountDialog.close(); await refreshMembership(); } catch (error) { setAccountStatus(error.message || "No fue posible iniciar sesión.", true); }
});
signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!configured()) { setAccountStatus("Falta configurar Supabase antes de aceptar registros reales.", true); return; }
  const form = new FormData(signupForm); setAccountStatus("Creando tu cuenta…");
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signUp({ email: form.get("email"), password: form.get("password"), options: { data: { name: String(form.get("name") || "").trim() } } });
    if (error) throw error;
    if (data.session) { accountDialog.close(); await startTrial(); }
    else setAccountStatus("Revisa tu correo para confirmar la cuenta y luego inicia sesión para activar la prueba.");
  } catch (error) { setAccountStatus(error.message || "No fue posible crear la cuenta.", true); }
});

if (!localStorage.getItem(AGE_KEY)) ageDialog.showModal();
document.querySelector("#confirm-age").addEventListener("click", () => { localStorage.setItem(AGE_KEY, "yes"); ageDialog.close(); });
document.querySelector("#deny-age").addEventListener("click", () => { document.querySelector("#age-message").textContent = "No puedes usar esta plataforma sin confirmar la edad legal aplicable."; });

// Al volver del panel de administrador, muestra de inmediato cada jugada recién publicada.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshMembership().catch(() => {});
});

loadRuntimeConfig()
  .then(async () => {
    await refreshMembership();
    const supabase = await getSupabase();
    if (supabase) supabase.auth.onAuthStateChange(() => refreshMembership().catch(() => {}));
  })
  .catch(() => { renderPlaceholders("No pudimos verificar el acceso en este momento."); renderBriefs([]); renderLiveScores([], [], { message: "No pudimos cargar el seguimiento." }); setToolsEnabled(false); });
