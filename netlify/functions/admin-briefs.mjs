import { createClient } from "@supabase/supabase-js";

function json(status, payload) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }
function text(value, max) { const clean = String(value || "").trim(); return clean && clean.length <= max ? clean : ""; }
function url(value) { if (!value) return null; try { const parsed = new URL(String(value)); return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null; } catch { return null; } }

async function requireEditor(request) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta la configuración segura de Supabase.");
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: json(401, { error: "Inicia sesión como editor." }) };
  const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !authData.user) return { error: json(401, { error: "La sesión no es válida." }) };
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileError } = await admin.from("profiles").select("is_admin").eq("user_id", authData.user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.is_admin) return { error: json(403, { error: "Esta cuenta no tiene permisos de editor." }) };
  return { admin, user: authData.user };
}

export default async (request) => {
  try {
    const identity = await requireEditor(request);
    if (identity.error) return identity.error;
    if (request.method === "GET") {
      const date = new URL(request.url).searchParams.get("date") || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { error: "La fecha no es válida." });
      const { data, error } = await identity.admin.from("daily_briefs").select("id, published_date, category, title, summary, source_url").eq("published_date", date).order("created_at", { ascending: true });
      if (error) throw error;
      return json(200, { briefs: data || [] });
    }
    if (request.method !== "POST") return json(405, { error: "Método no permitido." });
    const body = await request.json();
    const suppliedUrl = String(body.source_url || "").trim();
    const brief = {
      published_date: /^\d{4}-\d{2}-\d{2}$/.test(String(body.published_date || "")) ? String(body.published_date) : "",
      category: text(body.category, 50),
      title: text(body.title, 120),
      summary: text(body.summary, 1000),
      source_url: suppliedUrl ? url(suppliedUrl) : null,
      published: true,
      updated_at: new Date().toISOString(),
    };
    if (!brief.published_date || !brief.category || !brief.title || !brief.summary || (suppliedUrl && !brief.source_url)) return json(400, { error: "Completa los datos y usa una URL http/https válida si agregas una fuente." });
    const id = String(body.id || "").trim();
    if (id) {
      const { data, error } = await identity.admin.from("daily_briefs").update(brief).eq("id", id).select("id").maybeSingle();
      if (error || !data) return json(404, { error: "No encontramos el análisis para actualizar." });
    } else {
      const { count, error: countError } = await identity.admin.from("daily_briefs").select("id", { count: "exact", head: true }).eq("published_date", brief.published_date);
      if (countError) throw countError;
      if ((count || 0) >= 6) return json(409, { error: "Ya hay seis análisis para esta fecha." });
      const { error } = await identity.admin.from("daily_briefs").insert({ ...brief, created_by: identity.user.id });
      if (error) throw error;
    }
    return json(200, { ok: true });
  } catch (error) { return json(500, { error: error.message || "No pudimos guardar el análisis." }); }
};
