const express = require("express");
const { supabaseAdmin, supabaseForRequest } = require("../supabase/client");

const router = express.Router();

// DB connection check (HTTP endpoint)
router.get("/db-check", async (req, res) => {
  try {
    const sb = supabaseAdmin || supabaseForRequest(req);

    const { data, error } = await sb.from("profiles").select("*").limit(1);

    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true, sample: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
