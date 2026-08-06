import { createClient } from "@supabase/supabase-js";

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function config() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta la configuración segura de Supabase.");
  return { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };
}

function validText(value, maximum) {
  const text = String(value || "").trim();
  return text && text.length <= maximum ? text : "";
}

function validHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

async function editorFromRequest(request, settings) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: json(401, { error: "Inicia sesión como editor." }) };
  const publicClient = createClient(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !authData.user) return { error: json(401, { error: "La sesión no es válida." }) };
  const admin = createClient(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileError } = await admin.from("profiles").select("is_admin").eq("user_id", authData.user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.is_admin) return { error: json(403, { error: "Esta cuenta no tiene permisos de editor." }) };
  return { user: authData.user, admin };
}

async function picksWithOffers(admin, gameDate) {
  const { data: picks, error: picksError } = await admin.from("daily_picks").select("id, game_date, sport, league, event, team_name, team_logo_url, market, selection, analysis, starts_at, published").eq("game_date", gameDate).order("created_at", { ascending: true });
  if (picksError) throw picksError;
  const ids = (picks || []).map((pick) => pick.id);
  const { data: offers, error: offersError } = ids.length ? await admin.from("pick_offers").select("id, pick_id, book_name, odds, link_url").in("pick_id", ids).order("created_at", { ascending: true }) : { data: [], error: null };
  if (offersError) throw offersError;
  const offersByPick = new Map();
  (offers || []).forEach((offer) => offersByPick.set(offer.pick_id, [...(offersByPick.get(offer.pick_id) || []), offer]));
  return (picks || []).map((pick) => ({ ...pick, offers: offersByPick.get(pick.id) || [] }));
}

export default async (request) => {
  try {
    const settings = config();
    const identity = await editorFromRequest(request, settings);
    if (identity.error) return identity.error;
    if (request.method === "GET") {
      const gameDate = new URL(request.url).searchParams.get("date") || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) return json(400, { error: "La fecha no es válida." });
      return json(200, { picks: await picksWithOffers(identity.admin, gameDate) });
    }
    if (request.method !== "POST") return json(405, { error: "Método no permitido." });
    const body = await request.json();
    const gameDate = String(body.game_date || "");
    const pickId = String(body.id || "").trim();
    const suppliedStart = body.starts_at ? new Date(body.starts_at) : null;
    if (suppliedStart && Number.isNaN(suppliedStart.getTime())) return json(400, { error: "La hora del evento no es válida." });
    const pick = {
      game_date: /^\d{4}-\d{2}-\d{2}$/.test(gameDate) ? gameDate : "",
      sport: validText(body.sport, 40),
      league: validText(body.league, 60),
      event: validText(body.event, 100),
      team_name: body.team_name ? validText(body.team_name, 80) : null,
      team_logo_url: body.team_logo_url ? validHttpUrl(body.team_logo_url) : null,
      market: validText(body.market, 80),
      selection: validText(body.selection, 100),
      analysis: validText(body.analysis, 700),
      starts_at: suppliedStart ? suppliedStart.toISOString() : null,
      published: true,
      updated_at: new Date().toISOString(),
    };
    if (!pick.game_date || !pick.sport || !pick.league || !pick.event || !pick.market || !pick.selection || !pick.analysis || (body.team_logo_url && !pick.team_logo_url)) {
      return json(400, { error: "Completa todos los datos de la publicación con valores válidos." });
    }
    const rawOffers = Array.isArray(body.offers) ? body.offers.slice(0, 12) : [];
    const offers = rawOffers.map((offer) => ({
      book_name: validText(offer.book_name, 60),
      odds: validText(offer.odds, 30),
      link_url: offer.link_url ? validHttpUrl(offer.link_url) : null,
    }));
    if (!offers.length || offers.some((offer, index) => !offer.book_name || !offer.odds || (rawOffers[index].link_url && !offer.link_url))) {
      return json(400, { error: "Agrega al menos una cuota válida; los enlaces deben usar http o https." });
    }
    let stored;
    if (pickId) {
      const { count, error: countError } = await identity.admin.from("daily_picks").select("id", { count: "exact", head: true }).eq("game_date", pick.game_date).neq("id", pickId);
      if (countError) throw countError;
      if ((count || 0) >= 3) return json(409, { error: "Ya existen tres publicaciones para esta fecha." });
      const { data, error } = await identity.admin.from("daily_picks").update(pick).eq("id", pickId).select("id").maybeSingle();
      if (error || !data) return json(404, { error: "No encontramos la publicación para actualizar." });
      stored = data;
      const { error: deleteError } = await identity.admin.from("pick_offers").delete().eq("pick_id", pickId);
      if (deleteError) throw deleteError;
    } else {
      const { count, error: countError } = await identity.admin.from("daily_picks").select("id", { count: "exact", head: true }).eq("game_date", pick.game_date);
      if (countError) throw countError;
      if ((count || 0) >= 3) return json(409, { error: "Ya existen tres publicaciones para esta fecha." });
      const { data, error } = await identity.admin.from("daily_picks").insert({ ...pick, created_by: identity.user.id }).select("id").single();
      if (error) throw error;
      stored = data;
    }
    const { error: offerError } = await identity.admin.from("pick_offers").insert(offers.map((offer) => ({ ...offer, pick_id: stored.id })));
    if (offerError) throw offerError;
    return json(200, { ok: true, pickId: stored.id });
  } catch (error) {
    return json(500, { error: error.message || "No pudimos guardar la publicación." });
  }
};
