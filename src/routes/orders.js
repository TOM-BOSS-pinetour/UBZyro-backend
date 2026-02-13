const express = require("express");
const { supabaseAdmin, supabaseForRequest } = require("../supabase/client");
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

router.post(
  "/",
  normalizeOrderPayload,
  validateOrder,
  validateOrderRules,
  async (req, res) => {
  try {
    const supabase = supabaseAdmin || supabaseForRequest(req);
    const payload = {
      service_key: req.body.service_key,
      service_label: req.body.service_label,
      scheduled_date: req.body.scheduled_date,
      district: req.body.district,
      khoroo: req.body.khoroo,
      address: req.body.address,
      description: req.body.description,
      urgency: req.body.urgency,
      status: req.body.status,
      attachment_urls: req.body.attachment_urls,
      user_profile_id: req.body.user_profile_id,
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
