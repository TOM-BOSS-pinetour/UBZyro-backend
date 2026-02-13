const express = require("express");
const { supabaseAdmin } = require("../supabase/client");

const router = express.Router();

// Admin endpoint жишээ (cron/ops г.м).
// ⚠️ ЭНД өөрийн хамгаалалт заавал нэм (API key / IP allowlist / auth middleware)
router.get("/stats", async (req, res) => {
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

module.exports = router;
