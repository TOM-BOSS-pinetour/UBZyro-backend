const express = require("express");
const { supabaseForRequest } = require("../supabase/client");
const pushRegisterSchema = require("../schema/push-register");
const { buildValidator } = require("../schema/validate");

const router = express.Router();

const validatePushRegister = buildValidator(pushRegisterSchema);

const normalizeToken = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizePlatform = (value) => {
  if (value === "ios" || value === "android" || value === "web") return value;
  return null;
};

const getAuthUser = async (supabase) => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) return null;
  return data.user;
};

const sendExpoPushMessages = async (messages) => {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload,
    };
  }

  return {
    ok: true,
    status: response.status,
    payload,
  };
};

router.post("/register", validatePushRegister, async (req, res) => {
  try {
    const supabase = supabaseForRequest(req);
    const authUser = await getAuthUser(supabase);
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = normalizeToken(req.body?.token);
    const platform = normalizePlatform(req.body?.platform);

    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const { data, error } = await supabase
      .from("push_tokens")
      .upsert(
        {
          user_id: authUser.id,
          email: authUser.email ?? null,
          token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "token" },
      )
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

router.post("/unregister", async (req, res) => {
  try {
    const supabase = supabaseForRequest(req);
    const authUser = await getAuthUser(supabase);
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = normalizeToken(req.body?.token);
    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const { error } = await supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", authUser.id)
      .eq("token", token);

    if (error) {
      return res.status(400).json({
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }

    return res.status(200).json({ data: { success: true } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/send-me", async (req, res) => {
  try {
    const supabase = supabaseForRequest(req);
    const authUser = await getAuthUser(supabase);
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const title =
      typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const data = req.body?.data;

    if (!title || !body) {
      return res.status(400).json({ error: "Missing title or body" });
    }

    const { data: tokens, error } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", authUser.id);

    if (error) {
      return res.status(400).json({
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }

    const tokenList = Array.isArray(tokens)
      ? tokens
          .map((item) =>
            typeof item?.token === "string" ? item.token.trim() : "",
          )
          .filter((item) => item.length > 0)
      : [];

    if (tokenList.length === 0) {
      return res
        .status(404)
        .json({ error: "Push token бүртгэгдээгүй байна." });
    }

    const messages = tokenList.map((token) => ({
      to: token,
      sound: "default",
      title,
      body,
      ...(data && typeof data === "object" ? { data } : {}),
    }));

    const pushResult = await sendExpoPushMessages(messages);
    if (!pushResult.ok) {
      return res.status(pushResult.status).json({
        error: "Expo push request failed",
        details: pushResult.payload,
      });
    }

    return res.status(200).json({
      data: pushResult.payload,
      count: tokenList.length,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
