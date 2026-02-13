const express = require("express");
const { supabaseAdmin, supabaseForRequest } = require("../supabase/client");
const userSchema = require("../schema/user");
const { buildValidator } = require("../schema/validate");

const router = express.Router();

const validateUser = buildValidator(userSchema);

router.post("/", validateUser, async (req, res) => {
  try {
    const supabase = supabaseAdmin || supabaseForRequest(req);

    const { data, error } = await supabase
      .from("users")
      .insert(req.body)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
