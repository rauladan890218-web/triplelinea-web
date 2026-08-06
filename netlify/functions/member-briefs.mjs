import { createClient } from "@supabase/supabase-js";

function json(status, payload) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }

export default async (request) => {
  if (request.method !== "GET") return json(405, { error: "Método no permitido." });
  try {
    const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta la configuración segura de Supabase.");
    const header = request.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return json(401, { error: "Inicia sesión para abrir los análisis." });
    const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await publicClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "La sesión no es válida." });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: access, error: accessError } = await admin.from("member_access").select("status, trial_ends_at").eq("user_id", authData.user.id).maybeSingle();
    if (accessError) throw accessError;
    if (!access || !["trialing", "active"].includes(access.status)) return json(403, { error: "Necesitas una prueba o membresía activa." });
    if (access.status === "trialing" && access.trial_ends_at && new Date(access.trial_ends_at) <= new Date()) {
      await admin.from("member_access").update({ status: "trial_expired", updated_at: new Date().toISOString() }).eq("user_id", authData.user.id);
      return json(402, { code: "trial_expired", error: "Tu prueba gratuita terminó." });
    }
    const { data: briefs, error } = await admin.from("daily_briefs").select("id, published_date, category, title, summary, source_url").eq("published", true).order("published_date", { ascending: false }).order("created_at", { ascending: false }).limit(6);
    if (error) throw error;
    return json(200, { briefs: briefs || [] });
  } catch (error) {
    return json(500, { error: error.message || "No pudimos cargar los análisis." });
  }
};
