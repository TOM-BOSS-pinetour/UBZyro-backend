const express = require("express");
const { supabaseAdmin, supabaseForRequest } = require("../supabase/client");
const orderSchema = require("../schema/order");
const { buildValidator } = require("../schema/validate");
const { createInvoice } = require("../services/bonum");

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

const normalizeComment = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeRating = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    return Number(value);
  }
  return NaN;
};

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

router.post("/:id/complete", async (req, res) => {
  try {
    const supabase = supabaseForRequest(req);
    const authUser = await getAuthUser(supabase);
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = normalizeId(req.params.id);
    if (!id) return res.status(400).json({ error: "Missing id" });

    const amountRaw = req.body?.payment_amount;
    const paymentAmount =
      typeof amountRaw === "number" ? amountRaw : Number(amountRaw);
    const paymentMethod =
      typeof req.body?.payment_method === "string"
        ? req.body.payment_method.trim()
        : "";

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment_amount" });
    }

    const allowedMethods = ["cash", "bank_app"];
    if (!allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({ error: "Invalid payment_method" });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, worker_profile_id, payment_status")
      .eq("id", id)
      .single();

    if (orderError) {
      const statusCode = orderError.code === "PGRST116" ? 404 : 400;
      return res.status(statusCode).json({ error: orderError.message });
    }

    if (order?.worker_profile_id !== authUser.id) {
      return res.status(403).json({ error: "Worker only" });
    }

    if (["cancelled", "rejected"].includes(order?.status)) {
      return res.status(400).json({ error: "Order cannot be completed" });
    }
    if (order?.payment_status === "paid") {
      return res.status(400).json({ error: "Order already paid" });
    }

    const updatePayload = {
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      payment_amount: paymentAmount,
      payment_method: paymentMethod,
      payment_status: "pending",
      payment_provider: paymentMethod === "bank_app" ? "bonum" : null,
      payment_invoice_id: null,
      payment_followup_link: null,
      payment_transaction_id: id,
      payment_paid_at: null,
    };

    if (paymentMethod === "bank_app") {
      const invoice = await createInvoice({
        amount: paymentAmount,
        transactionId: id,
        expiresInSeconds: 1800,
      });
      updatePayload.payment_invoice_id = invoice.invoiceId;
      updatePayload.payment_followup_link = invoice.followUpLink;
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

router.post("/:id/payment/confirm-cash", async (req, res) => {
  try {
    const supabase = supabaseForRequest(req);
    const authUser = await getAuthUser(supabase);
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = normalizeId(req.params.id);
    if (!id) return res.status(400).json({ error: "Missing id" });

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, worker_profile_id, payment_method, payment_status")
      .eq("id", id)
      .single();

    if (orderError) {
      const statusCode = orderError.code === "PGRST116" ? 404 : 400;
      return res.status(statusCode).json({ error: orderError.message });
    }

    if (order?.worker_profile_id !== authUser.id) {
      return res.status(403).json({ error: "Worker only" });
    }

    if (order?.status !== "completed") {
      return res.status(400).json({ error: "Order is not completed" });
    }

    if (order?.payment_method !== "cash") {
      return res.status(400).json({ error: "Payment method is not cash" });
    }

    if (order?.payment_status !== "pending") {
      return res.status(400).json({ error: "Payment status is not pending" });
    }

    const { data, error } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        payment_paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
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

router.post("/:id/review", async (req, res) => {
  try {
    const supabase = supabaseForRequest(req);
    const authUser = await getAuthUser(supabase);
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = normalizeId(req.params.id);
    if (!id) return res.status(400).json({ error: "Missing id" });

    const rating = normalizeRating(req.body?.rating);
    const comment = normalizeComment(req.body?.comment);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "rating must be an integer 1-5" });
    }

    if (!comment) {
      return res.status(400).json({ error: "comment is required" });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, status, payment_status, user_profile_id, worker_profile_id, review_rating, review_comment, reviewed_at",
      )
      .eq("id", id)
      .single();

    if (orderError) {
      const statusCode = orderError.code === "PGRST116" ? 404 : 400;
      return res.status(statusCode).json({ error: orderError.message });
    }

    if (order?.user_profile_id !== authUser.id) {
      return res.status(403).json({ error: "User only" });
    }

    if (order?.status !== "completed") {
      return res.status(400).json({ error: "Order is not completed" });
    }

    if (order?.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment is not completed" });
    }

    const hasExistingReview =
      (order?.review_rating !== null && order?.review_rating !== undefined) ||
      (typeof order?.review_comment === "string" &&
        order.review_comment.trim().length > 0) ||
      !!order?.reviewed_at;

    if (hasExistingReview) {
      return res.status(400).json({ error: "Review already submitted" });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("orders")
      .update({
        review_rating: rating,
        review_comment: comment,
        reviewed_at: now,
        updated_at: now,
      })
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

    const workerId =
      typeof data?.worker_profile_id === "string"
        ? data.worker_profile_id
        : typeof order?.worker_profile_id === "string"
          ? order.worker_profile_id
          : "";

    if (workerId) {
      const aggregateClient = supabaseAdmin || supabase;
      const { data: ratingsData, error: ratingsError } = await aggregateClient
        .from("orders")
        .select("review_rating")
        .eq("worker_profile_id", workerId)
        .not("review_rating", "is", null);

      if (!ratingsError && Array.isArray(ratingsData) && ratingsData.length > 0) {
        const values = ratingsData
          .map((item) =>
            typeof item?.review_rating === "number" ? item.review_rating : null,
          )
          .filter((value) => typeof value === "number");

        if (values.length > 0) {
          const average = Number(
            (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2),
          );
          await aggregateClient
            .from("profiles")
            .update({ rating: average })
            .eq("id", workerId);
        }
      }
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
