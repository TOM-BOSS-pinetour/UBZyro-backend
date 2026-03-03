const express = require("express");
const { supabaseAdmin, supabaseForRequest } = require("../supabase/client");
const workerSchema = require("../schema/worker");
const { buildValidator } = require("../schema/validate");

const router = express.Router();

const validateWorker = buildValidator(workerSchema);
const withProfileUrl = (item) => ({
  ...item,
  profile_url:
    typeof item?.profile_url === "string"
      ? item.profile_url
      : typeof item?.avatar_url === "string"
        ? item.avatar_url
        : null,
});
const normalizeName = (firstName, lastName) => {
  const first = typeof firstName === "string" ? firstName.trim() : "";
  const last = typeof lastName === "string" ? lastName.trim() : "";
  return `${first} ${last}`.trim() || "Хэрэглэгч";
};

const buildWorkerAggregateMap = async (supabase, workerIds) => {
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(workerIds) ? workerIds : [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean),
    ),
  );

  if (normalizedIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("orders")
    .select("worker_profile_id, review_rating")
    .in("worker_profile_id", normalizedIds);

  if (error) {
    throw error;
  }

  const aggregateMap = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    const workerId =
      typeof row?.worker_profile_id === "string"
        ? row.worker_profile_id.trim()
        : "";
    if (!workerId) continue;

    const current = aggregateMap.get(workerId) ?? {
      orderCount: 0,
      reviewCount: 0,
      reviewSum: 0,
    };

    current.orderCount += 1;
    if (typeof row?.review_rating === "number") {
      current.reviewCount += 1;
      current.reviewSum += row.review_rating;
    }

    aggregateMap.set(workerId, current);
  }

  return aggregateMap;
};

const withWorkerStats = (item, aggregate) => {
  const fallbackOrders = typeof item?.orders === "number" ? item.orders : null;
  const fallbackRating = typeof item?.rating === "number" ? item.rating : null;
  const reviewCount =
    typeof aggregate?.reviewCount === "number" ? aggregate.reviewCount : 0;

  const rating =
    reviewCount > 0
      ? Number((aggregate.reviewSum / reviewCount).toFixed(2))
      : fallbackRating;
  const orders =
    typeof aggregate?.orderCount === "number"
      ? aggregate.orderCount
      : fallbackOrders;

  return {
    ...item,
    rating,
    orders,
    review_count: reviewCount,
  };
};

const loadWorkerReviews = async (supabase, workerId) => {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, review_rating, review_comment, reviewed_at, user_profile_id, status, payment_status",
    )
    .eq("worker_profile_id", workerId)
    .eq("status", "completed")
    .eq("payment_status", "paid")
    .not("review_rating", "is", null)
    .not("review_comment", "is", null)
    .order("reviewed_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const userIds = Array.from(
    new Set(
      rows
        .map((item) =>
          typeof item?.user_profile_id === "string"
            ? item.user_profile_id.trim()
            : "",
        )
        .filter(Boolean),
    ),
  );

  const authorByUserId = new Map();
  if (userIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", userIds);

    if (!profileError && Array.isArray(profileRows)) {
      for (const profile of profileRows) {
        const id = typeof profile?.id === "string" ? profile.id.trim() : "";
        if (!id) continue;
        authorByUserId.set(
          id,
          normalizeName(profile?.first_name, profile?.last_name),
        );
      }
    }
  }

  return rows
    .filter(
      (item) =>
        typeof item?.review_rating === "number" &&
        typeof item?.review_comment === "string" &&
        item.review_comment.trim().length > 0,
    )
    .map((item) => {
      const userId =
        typeof item?.user_profile_id === "string"
          ? item.user_profile_id.trim()
          : "";
      return {
        id: String(item?.id ?? ""),
        author: authorByUserId.get(userId) ?? "Хэрэглэгч",
        rating: item.review_rating,
        text: item.review_comment.trim(),
        date: typeof item?.reviewed_at === "string" ? item.reviewed_at : null,
      };
    });
};

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
      .select("*")
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

    const withImages = filtered.map(withProfileUrl);
    const aggregateMap = await buildWorkerAggregateMap(
      supabase,
      withImages.map((item) => String(item?.id ?? "")),
    );
    const enriched = withImages.map((item) =>
      withWorkerStats(
        item,
        aggregateMap.get(typeof item?.id === "string" ? item.id : ""),
      ),
    );

    return res.json({ data: enriched });
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
      .select("*")
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

    const worker = withProfileUrl(data);
    const aggregateMap = await buildWorkerAggregateMap(supabase, [id]);
    const reviews = await loadWorkerReviews(supabase, id);
    const enriched = withWorkerStats(worker, aggregateMap.get(id));

    return res.json({ data: { ...enriched, reviews } });
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
