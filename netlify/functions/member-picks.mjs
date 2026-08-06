import { createClient } from "@supabase/supabase-js";

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export default async (request) => {
  if (request.method !== "GET") return json(405, { error: "Método no permitido." });
  try {
    const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta la configuración segura de Supabase.");
    const header = request.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return json(401, { error: "Inicia sesión para abrir las publicaciones." });
    const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await publicClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "La sesión no es válida." });
    const isOwner = String(authData.user.email || "").trim().toLowerCase() === "rauladan890218@gmail.com";
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: access, error: accessError } = await admin.from("member_access").select("status, trial_ends_at").eq("user_id", authData.user.id).maybeSingle();
    if (accessError) throw accessError;
    if (!isOwner && !access) return json(403, { error: "Inicia tu prueba para abrir las publicaciones." });
    if (!isOwner && access.status === "trialing" && access.trial_ends_at && new Date(access.trial_ends_at) <= new Date()) {
      await admin.from("member_access").update({ status: "trial_expired", updated_at: new Date().toISOString() }).eq("user_id", authData.user.id);
      return json(402, { code: "trial_expired", error: "Tu prueba gratuita terminó." });
    }
    if (!isOwner && !["trialing", "active"].includes(access.status)) return json(403, { error: "No tienes una membresía activa." });
    const requestedDate = new URL(request.url).searchParams.get("date");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || "") ? requestedDate : today();
    const { data: picks, error: picksError } = await admin.from("daily_picks").select("id, sport, league, event, team_name, team_logo_url, market, selection, analysis, starts_at").eq("game_date", date).eq("published", true).order("created_at", { ascending: true }).limit(3);
    if (picksError) throw picksError;
    const ids = (picks || []).map((pick) => pick.id);
    const { data: offers, error: offersError } = ids.length ? await admin.from("pick_offers").select("pick_id, book_name, odds, link_url").in("pick_id", ids).order("created_at", { ascending: true }) : { data: [], error: null };
    if (offersError) throw offersError;
    const offersByPick = new Map();
    (offers || []).forEach((offer) => offersByPick.set(offer.pick_id, [...(offersByPick.get(offer.pick_id) || []), offer]));
    return json(200, { date, picks: (picks || []).map((pick) => ({ ...pick, offers: offersByPick.get(pick.id) || [] })) });
  } catch (error) {
    return json(500, { error: error.message || "No pudimos cargar las publicaciones." });
  }
};
