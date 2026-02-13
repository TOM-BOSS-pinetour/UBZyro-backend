const { createClient } = require("@supabase/supabase-js");
const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
} = require("../config/env");

// Admin client (service_role) — зөвхөн server дээр!
// ⚠️ Энэ key-г frontend/mobile руу хэзээ ч битгий гарга
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Request бүр дээр хэрэглэгчийн JWT-ээр "user scoped" client үүсгэнэ (RLS мөрдөнө)
function supabaseForRequest(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  return createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    token
      ? { global: { headers: { Authorization: `Bearer ${token}` } } }
      : undefined,
  );
}

module.exports = { supabaseAdmin, supabaseForRequest };
