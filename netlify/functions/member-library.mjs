import { createClient } from "@supabase/supabase-js";

function json(status, payload) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }

export default async (request) => {
  if (request.method !== "GET") return json(405, { error: "Método no permitido." });
  try {
    const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta la configuración segura de Supabase.");
    const header = request.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return json(401, { error: "Inicia sesión para usar el buscador." });
    const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await publicClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "La sesión no es válida." });
    const isOwner = String(authData.user.email || "").trim().toLowerCase() === "rauladan890218@gmail.com";
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: access, error: accessError } = await admin.from("member_access").select("status, trial_ends_at").eq("user_id", authData.user.id).maybeSingle();
    if (accessError) throw accessError;
    if (!isOwner && (!access || !["trialing", "active"].includes(access.status) || (access.status === "trialing" && access.trial_ends_at && new Date(access.trial_ends_at) <= new Date()))) return json(403, { error: "Necesitas una prueba o membresía activa." });
    const requested = new URL(request.url).searchParams.get("q") || "";
    const term = requested.replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().slice(0, 80);
    if (!term) return json(400, { error: "Escribe una búsqueda válida." });
    const like = `%${term}%`;
    const { data: picks, error: picksError } = await admin.from("daily_picks").select("id, game_date, sport, league, event, team_name, team_logo_url, market, selection, analysis").eq("published", true).or(`sport.ilike.${like},league.ilike.${like},event.ilike.${like},team_name.ilike.${like},market.ilike.${like},selection.ilike.${like}`).order("game_date", { ascending: false }).limit(24);
    if (picksError) throw picksError;
    const ids = (picks || []).map((pick) => pick.id);
    const { data: offers, error: offersError } = ids.length ? await admin.from("pick_offers").select("pick_id, book_name, odds, link_url").in("pick_id", ids).order("created_at", { ascending: true }) : { data: [], error: null };
    if (offersError) throw offersError;
    const offersByPick = new Map();
    (offers || []).forEach((offer) => offersByPick.set(offer.pick_id, [...(offersByPick.get(offer.pick_id) || []), offer]));
    return json(200, { picks: (picks || []).map((pick) => ({ ...pick, offers: offersByPick.get(pick.id) || [] })) });
  } catch (error) {
    return json(500, { error: error.message || "No pudimos buscar publicaciones." });
  }
};
