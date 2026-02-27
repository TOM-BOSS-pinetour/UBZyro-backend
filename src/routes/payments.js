const express = require("express");
const { supabaseAdmin } = require("../supabase/client");
const { verifyWebhook } = require("../services/bonum");

const router = express.Router();

router.get("/bonum/webhook", (_req, res) => {
  res
    .status(200)
    .send(
      "Төлбөрийн баталгаажуулалт амжилттай. Апп руугаа буцаж орно уу.",
    );
});

router.post("/bonum/webhook", async (req, res) => {
  try {
    const checksum = req.get("x-checksum-v2");
    const rawBody = req.rawBody || "";
    const rawBodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);
    console.log("Bonum webhook received", {
      at: new Date().toISOString(),
      headers: req.headers,
      body: req.body,
      rawBody: rawBodyStr,
    });
    const { valid, skipped } = verifyWebhook(rawBody, checksum);
    if (!valid && !skipped) {
      return res.status(400).json({ error: "Invalid checksum" });
    }
    if (skipped) {
      console.warn(
        "Bonum webhook checksum validation skipped: BONUM_WEBHOOK_CHECKSUM_KEY not set.",
      );
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Server config error" });
    }

    const payload = req.body || {};
    if (payload.type !== "PAYMENT") {
      return res.status(200).json({ ok: true });
    }

    const body = payload.body || {};
    const statusRaw =
      typeof payload.status === "string"
        ? payload.status
        : typeof body.status === "string"
          ? body.status
          : "";
    const status = statusRaw.trim().toUpperCase();
    const invoiceId = body.invoiceId;
    const transactionId = body.transactionId;
    const paidAt =
      typeof body.completedAt === "string" ? body.completedAt : null;

    if (!invoiceId && !transactionId) {
      return res.status(400).json({ error: "Missing invoiceId" });
    }

    const isPaid = status === "SUCCESS" || status === "PAID";
    const isFailed = status === "FAILED" || status === "CANCELLED";
    if (!isPaid && !isFailed) {
      return res.status(200).json({ ok: true });
    }

    const updatePayload = {
      payment_status: isPaid ? "paid" : "failed",
      payment_paid_at: isPaid ? paidAt || new Date().toISOString() : null,
      payment_transaction_id: transactionId || null,
      updated_at: new Date().toISOString(),
    };

    let query = supabaseAdmin.from("orders").update(updatePayload);
    if (invoiceId) {
      query = query.eq("payment_invoice_id", invoiceId);
    } else {
      query = query.eq("payment_transaction_id", transactionId);
    }

    const { data, error } = await query.select("id, payment_status");
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
