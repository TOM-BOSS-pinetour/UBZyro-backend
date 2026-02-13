const express = require("express");
const { supabaseAdmin, supabaseForRequest } = require("../supabase/client");
const workerSchema = require("../schema/worker");
const { buildValidator } = require("../schema/validate");

const router = express.Router();

const validateWorker = buildValidator(workerSchema);

router.get("/", async (req, res) => {
  try {
    const supabase = supabaseAdmin || supabaseForRequest(req);
    const typeKey =
      typeof req.query.typeKey === "string" ? req.query.typeKey.trim() : "";
    const district =
      typeof req.query.district === "string" ? req.query.district.trim() : "";
    const limitRaw =
      typeof req.query.limit === "string" ? Number(req.query.limit) : null;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, first_name, last_name, work_types, service_area, rating, orders, years, created_at",
      )
      .eq("role", "worker")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(400).json({
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }

    const normalizeList = (value) => {
      if (Array.isArray(value)) return value.filter(Boolean).map(String);
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return [];
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.filter(Boolean).map(String);
          }
        } catch {
          // fall through to split
        }
        return trimmed
          .split(/[;,]/)
          .map((item) => item.trim())
          .filter(Boolean);
      }
      return [];
    };

    let filtered = Array.isArray(data) ? data : [];
    if (typeKey) {
      filtered = filtered.filter((item) =>
        normalizeList(item?.work_types).includes(typeKey),
      );
    }
    if (district) {
      filtered = filtered.filter((item) =>
        normalizeList(item?.service_area).includes(district),
      );
    }

    return res.json({ data: filtered });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const supabase = supabaseAdmin || supabaseForRequest(req);
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) return res.status(400).json({ error: "Missing id" });

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, first_name, last_name, work_types, service_area, rating, orders, years, created_at",
      )
      .eq("id", id)
      .eq("role", "worker")
      .single();

    if (error) {
      const status = error.code === "PGRST116" ? 404 : 400;
      return res.status(status).json({
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }

    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

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
