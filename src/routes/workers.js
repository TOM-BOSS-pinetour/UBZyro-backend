const express = require("express");
const { supabaseAdmin, supabaseForRequest } = require("../supabase/client");
const workerSchema = require("../schema/worker");
const { buildValidator } = require("../schema/validate");

const router = express.Router();

const validateWorker = buildValidator(workerSchema);

router.post("/", validateWorker, async (req, res) => {
  try {
    const supabase = supabaseAdmin || supabaseForRequest(req);

    const { data, error } = await supabase
      .from("workers")
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
