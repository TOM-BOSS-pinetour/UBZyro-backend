require("dotenv").config();

const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } =
  process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
}

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

// Startup үед DB шалгаад terminal дээр хэвлэх
async function checkDatabaseConnection() {
  try {
    const sb = supabaseAdmin;

    if (!sb) {
      console.log("⚠️ No service role key, skipping DB admin check");
      return;
    }

    const { error } = await sb.from("profiles").select("*").limit(1);

    if (error) {
      console.error("❌ Database connection failed:", error.message);
    } else {
      console.log("✅ Database connection success");
    }
  } catch (e) {
    console.error("❌ Database connection error:", e.message);
  }
}

// ---------- Routes ----------

app.get("/health", (req, res) => res.json({ ok: true }));

// DB connection check (HTTP endpoint)
app.get("/db-check", async (req, res) => {
  try {
    const sb = supabaseAdmin || supabaseForRequest(req);

    const { data, error } = await sb.from("profiles").select("*").limit(1);

    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true, sample: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Жишээ: profiles хүснэгтээс унших (JWT байвал RLS policy чинь ажиллана)
app.get("/profiles", async (req, res) => {
  try {
    const supabase = supabaseForRequest(req);

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .limit(50);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Жишээ: insert (JWT байгаа үед RLS зөвшөөрвөл)
app.post("/profiles", async (req, res) => {
  try {
    const supabase = supabaseForRequest(req);
    const { display_name } = req.body;

    const { data, error } = await supabase
      .from("profiles")
      .insert({ display_name })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Admin endpoint жишээ (cron/ops г.м).
// ⚠️ ЭНД өөрийн хамгаалалт заавал нэм (API key / IP allowlist / auth middleware)
app.get("/admin/stats", async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res
        .status(500)
        .json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
    }

    const { count, error } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ profiles_count: count });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---------- Start ----------
checkDatabaseConnection();

const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`🚀 API running on http://localhost:${port}`),
);
