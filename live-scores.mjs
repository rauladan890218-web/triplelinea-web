import { createClient } from "@supabase/supabase-js";

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function activeMember(request, settings) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: json(401, { error: "Inicia sesión para ver los marcadores." }) };
  const publicClient = createClient(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !authData.user) return { error: json(401, { error: "La sesión no es válida." }) };
  const admin = createClient(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: access, error } = await admin.from("member_access").select("status, trial_ends_at").eq("user_id", authData.user.id).maybeSingle();
  if (error) throw error;
  if (!access || !["trialing", "active"].includes(access.status)) return { error: json(403, { error: "No tienes una membresía activa." }) };
  if (access.status === "trialing" && access.trial_ends_at && new Date(access.trial_ends_at) <= new Date()) {
    await admin.from("member_access").update({ status: "trial_expired", updated_at: new Date().toISOString() }).eq("user_id", authData.user.id);
    return { error: json(402, { error: "Tu prueba gratuita terminó." }) };
  }
  return { user: authData.user };
}

function toScore(event) {
  return {
    id: String(event.idEvent || event.id || ""),
    event: String(event.strEvent || event.event || ""),
    home_team: String(event.strHomeTeam || event.homeTeam || ""),
    away_team: String(event.strAwayTeam || event.awayTeam || ""),
    home_score: event.intHomeScore ?? event.homeScore ?? null,
    away_score: event.intAwayScore ?? event.awayScore ?? null,
    status: String(event.strStatus || event.strProgress || event.status || "EN VIVO"),
    minute: String(event.strTime || event.intTime || event.minute || ""),
  };
}

export default async (request) => {
  if (request.method !== "GET") return json(405, { error: "Método no permitido." });
  try {
    const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, THESPORTSDB_API_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta la configuración segura de Supabase.");
    const membership = await activeMember(request, { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY });
    if (membership.error) return membership.error;
    if (!THESPORTSDB_API_KEY) {
      return json(200, { configured: false, scores: [], message: "El seguimiento en vivo está listo; falta añadir la clave de la fuente de resultados." });
    }
    const response = await fetch("https://www.thesportsdb.com/api/v2/json/livescore/soccer", {
      headers: { "X-API-KEY": THESPORTSDB_API_KEY, Accept: "application/json" },
    });
    if (!response.ok) return json(502, { error: "La fuente de resultados no respondió correctamente." });
    const payload = await response.json();
    const events = Array.isArray(payload?.events) ? payload.events : (Array.isArray(payload?.livescores) ? payload.livescores : []);
    return json(200, { configured: true, scores: events.map(toScore), updated_at: new Date().toISOString() });
  } catch (error) {
    return json(500, { error: error.message || "No pudimos cargar los resultados en vivo." });
  }
};
