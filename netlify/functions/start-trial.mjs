import { createClient } from "@supabase/supabase-js";

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function configuration() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Falta la configuración segura de Supabase.");
  return { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };
}

async function authenticatedUser(request, config) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Método no permitido." });
  try {
    const config = configuration();
    const user = await authenticatedUser(request, config);
    if (!user) return json(401, { error: "Inicia sesión para comenzar una prueba." });
    const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: existing, error: existingError } = await admin.from("member_access").select("status, trial_ends_at").eq("user_id", user.id).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return json(409, { error: "Esta cuenta ya utilizó o tiene activa su prueba/membresía." });
    const started = new Date();
    const ends = new Date(started.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { error } = await admin.from("member_access").insert({
      user_id: user.id,
      status: "trialing",
      trial_started_at: started.toISOString(),
      trial_ends_at: ends.toISOString(),
      updated_at: started.toISOString(),
    });
    if (error) throw error;
    return json(200, { ok: true, status: "trialing", trialEndsAt: ends.toISOString() });
  } catch (error) {
    return json(500, { error: error.message || "No fue posible iniciar la prueba." });
  }
};
