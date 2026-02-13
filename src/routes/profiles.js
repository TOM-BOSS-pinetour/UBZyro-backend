const express = require("express");
const { supabaseAdmin, supabaseForRequest } = require("../supabase/client");
const profileSchema = require("../schema/profile");
const { buildValidator } = require("../schema/validate");

const router = express.Router();
const validateProfile = buildValidator(profileSchema);

const prepareProfileUpdate = async (req, res, next) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  if (!email) {
    return res.status(400).json({ error: "Missing email" });
  }

  try {
    const supabase = supabaseAdmin || supabaseForRequest(req);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return res.status(400).json({ error: error.message });
    const existing = data?.[0] ?? null;
    res.locals.existingProfile = existing;

    const hasWorkerFields =
      (Array.isArray(req.body?.work_types) && req.body.work_types.length > 0) ||
      !!req.body?.service_area;

    const role =
      req.body.role ??
      (hasWorkerFields ? "worker" : existing?.role ?? "user");

    const nextBody = {
      ...req.body,
      role,
    };

    if (role === "worker") {
      if (nextBody.work_types === undefined && existing?.work_types) {
        nextBody.work_types = existing.work_types;
      }
      if (nextBody.service_area === undefined && existing?.service_area) {
        nextBody.service_area = existing.service_area;
      }
    } else {
      delete nextBody.work_types;
      delete nextBody.service_area;
    }

    req.body = nextBody;
    return next();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

// Жишээ: profiles хүснэгтээс унших (JWT байвал RLS policy чинь ажиллана)
router.get("/", async (req, res) => {
  try {
    const supabase = supabaseAdmin || supabaseForRequest(req);

    const email =
      typeof req.query.email === "string" ? req.query.email.trim() : "";

    if (email) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .ilike("email", email)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) return res.status(400).json({ error: error.message });
      if (!data || data.length === 0) {
        return res.status(404).json({ error: "Profile not found" });
      }
      return res.json({ data: data[0] });
    }

    const { data, error } = await supabase.from("profiles").select("*").limit(50);

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

// update (email-аар хамгийн сүүлийн профайлыг шинэчилнэ, байхгүй бол үүсгэнэ)
router.put("/", prepareProfileUpdate, validateProfile, async (req, res) => {
  try {
    const supabase = supabaseAdmin || supabaseForRequest(req);
    const existing = res.locals.existingProfile ?? null;
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

    if (!existing) {
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
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", existing.id)
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
    return res.status(200).json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
