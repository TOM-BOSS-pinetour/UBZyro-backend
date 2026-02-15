const express = require("express");
const { supabaseForRequest } = require("../supabase/client");
const orderSchema = require("../schema/order");
const { buildValidator } = require("../schema/validate");

const router = express.Router();

const validateOrder = buildValidator(orderSchema);

const makeKhoroos = (count) =>
  Array.from({ length: count }, (_value, index) => `${index + 1}-р хороо`);

const districts = [
  { name: "Багануур", khoroos: makeKhoroos(5) },
  { name: "Багахангай", khoroos: makeKhoroos(2) },
  { name: "Баянгол", khoroos: makeKhoroos(10) },
  { name: "Баянзүрх", khoroos: makeKhoroos(10) },
  { name: "Налайх", khoroos: makeKhoroos(8) },
  { name: "Сонгинохайрхан", khoroos: makeKhoroos(10) },
  { name: "Сүхбаатар", khoroos: makeKhoroos(10) },
  { name: "Хан-Уул", khoroos: makeKhoroos(10) },
  { name: "Чингэлтэй", khoroos: makeKhoroos(10) },
];

const normalizeOrderPayload = (req, res, next) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const trimIfString = (value) =>
    typeof value === "string" ? value.trim() : value;

  const fieldsToTrim = [
    "service_key",
    "service_label",
    "scheduled_date",
    "district",
    "khoroo",
    "address",
    "description",
    "urgency",
    "status",
  ];

  fieldsToTrim.forEach((field) => {
    if (field in req.body) {
      req.body[field] = trimIfString(req.body[field]);
    }
  });

  if (Array.isArray(req.body.attachment_urls)) {
    req.body.attachment_urls = req.body.attachment_urls
      .map((item) => trimIfString(item))
      .filter((item) => typeof item === "string" && item.length > 0);
  }

  return next();
};

const validateOrderRules = (req, res, next) => {
  const scheduled = new Date(`${req.body.scheduled_date}T00:00:00`);
  if (Number.isNaN(scheduled.getTime())) {
    return res.status(400).json({ error: "Invalid scheduled_date" });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (scheduled < today) {
    return res.status(400).json({
      error: "scheduled_date must be today or later",
    });
  }

  const district = districts.find((item) => item.name === req.body.district);
  if (!district) {
    return res.status(400).json({ error: "Invalid district" });
  }

  if (!district.khoroos.includes(req.body.khoroo)) {
    return res.status(400).json({ error: "Invalid khoroo for district" });
  }

  return next();
};

const normalizeId = (value) =>
  typeof value === "string" ? value.trim() : "";

const getAuthUser = async (supabase) => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) return null;
  return data.user;
};

router.get("/", async (req, res) => {
  try {
    const supabase = supabaseForRequest(req);
    const authUser = await getAuthUser(supabase);
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const workerEmail =
      typeof req.query.worker_email === "string"
        ? req.query.worker_email.trim()
        : "";
    const workerProfileId = normalizeId(req.query.worker_profile_id);
    const userEmail =
      typeof req.query.email === "string" ? req.query.email.trim() : "";
    const userProfileId = normalizeId(req.query.user_profile_id);
    const limitRaw =
      typeof req.query.limit === "string" ? Number(req.query.limit) : null;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;

    const wantsWorker = !!(workerEmail || workerProfileId);
    const wantsUser = !!(userEmail || userProfileId);
    const resolvedWorkerId = wantsWorker ? authUser.id : "";
    const resolvedUserId = !wantsWorker || wantsUser ? authUser.id : "";

    let query = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (resolvedWorkerId) {
      query = query.eq("worker_profile_id", resolvedWorkerId);
    } else {
      query = query.eq("user_profile_id", resolvedUserId);
    }

    const { data, error } = await query;

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const supabase = supabaseForRequest(req);
    const authUser = await getAuthUser(supabase);
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const id = normalizeId(req.params.id);
    const status =
      typeof req.body?.status === "string" ? req.body.status.trim() : "";

    if (!id) return res.status(400).json({ error: "Missing id" });
    if (!status) return res.status(400).json({ error: "Missing status" });

    const allowed = [
      "accepted",
      "rejected",
      "cancelled",
      "en_route",
      "in_progress",
      "completed",
      "pending",
    ];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, user_profile_id, worker_profile_id")
      .eq("id", id)
      .single();

    if (orderError) {
      const statusCode = orderError.code === "PGRST116" ? 404 : 400;
      return res.status(statusCode).json({ error: orderError.message });
    }

    const isParticipant =
      order?.user_profile_id === authUser.id ||
      order?.worker_profile_id === authUser.id;

    if (!isParticipant) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (["accepted", "rejected"].includes(status)) {
      if (order?.worker_profile_id !== authUser.id) {
        return res.status(403).json({ error: "Worker only" });
      }
    }

    const statusTimestampMap = {
      accepted: "accepted_at",
      rejected: "rejected_at",
      cancelled: "cancelled_at",
      en_route: "en_route_at",
      in_progress: "in_progress_at",
      completed: "completed_at",
    };

    const updatePayload = {
      status,
      updated_at: new Date().toISOString(),
    };

    const timestampField = statusTimestampMap[status];
    if (timestampField) {
      updatePayload[timestampField] = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", id)
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
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post(
  "/",
  normalizeOrderPayload,
  validateOrder,
  validateOrderRules,
  async (req, res) => {
  try {
    const supabase = supabaseForRequest(req);
    const authUser = await getAuthUser(supabase);
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const incomingUserId = normalizeId(req.body.user_profile_id);
    if (incomingUserId && incomingUserId !== authUser.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const payload = {
      service_key: req.body.service_key,
      service_label: req.body.service_label,
      scheduled_date: req.body.scheduled_date,
      district: req.body.district,
      khoroo: req.body.khoroo,
      address: req.body.address,
      description: req.body.description,
      urgency: req.body.urgency,
      attachment_urls: req.body.attachment_urls,
      status: "pending",
      user_profile_id: incomingUserId || authUser.id,
      worker_profile_id: req.body.worker_profile_id,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
    };

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) delete payload[key];
    });

    const { data, error } = await supabase
      .from("orders")
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
  },
);

module.exports = router;
