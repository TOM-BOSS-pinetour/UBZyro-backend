const express = require("express");
const { supabaseAdmin, supabaseForRequest } = require("../supabase/client");
const profileSchema = require("../schema/profile");
const { buildValidator } = require("../schema/validate");

const router = express.Router();
const validateProfile = buildValidator(profileSchema);

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

// insert (service_role байвал admin-аар, эсвэл JWT-ээр)
router.post("/", (req, res, next) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  if (!req.body?.role) {
    const hasWorkerFields =
      (Array.isArray(req.body?.work_types) && req.body.work_types.length > 0) ||
      !!req.body?.service_area;
    req.body.role = hasWorkerFields ? "worker" : "user";
  }
  if (!req.body.role) {
    return res.status(400).json({ error: "Missing role" });
  }
  return next();
}, validateProfile, async (req, res) => {
  try {
    const supabase = supabaseAdmin || supabaseForRequest(req);
    const payload = {
      role: req.body.role,
      email: req.body.email,
      phone_number: req.body.phone_number,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      ...(req.body.work_types !== undefined
        ? { work_types: req.body.work_types }
        : {}),
      ...(req.body.service_area !== undefined
        ? { service_area: req.body.service_area }
        : {}),
    };
    if (!payload.role) {
      return res.status(400).json({ error: "Missing role" });
    }

    const { data, error } = await supabase
      .from("profiles")
      .insert(payload)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }
    return res.status(201).json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
