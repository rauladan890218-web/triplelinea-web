function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export default async (request) => {
  if (request.method !== "GET") return json(405, { error: "Método no permitido." });

  const { SUPABASE_URL, SUPABASE_ANON_KEY, PAYMENT_CHECKOUT_URL = "" } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(503, { error: "Falta configurar Supabase en Netlify." });
  }

  // La clave anon es pública por diseño. La service-role nunca se envía al navegador.
  return json(200, {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    paymentCheckoutUrl: PAYMENT_CHECKOUT_URL,
  });
};
