const express = require("express");
const { supabaseForRequest } = require("../supabase/client");

const router = express.Router();

// Жишээ: profiles хүснэгтээс унших (JWT байвал RLS policy чинь ажиллана)
router.get("/", async (req, res) => {
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
router.post("/", async (req, res) => {
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

module.exports = router;
