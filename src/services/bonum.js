const crypto = require("crypto");
const {
  BONUM_API_BASE_URL,
  BONUM_APP_SECRET,
  BONUM_TERMINAL_ID,
  BONUM_WEBHOOK_CHECKSUM_KEY,
  BONUM_INVOICE_CALLBACK_URL,
} = require("../config/env");

const defaultApiBaseUrl = "https://testapi.bonum.mn";

let cachedToken = null;
let tokenExpiresAt = 0;

const getApiBaseUrl = () => BONUM_API_BASE_URL || defaultApiBaseUrl;

const getTokenHeaders = () => {
  if (!BONUM_APP_SECRET || !BONUM_TERMINAL_ID) {
    throw new Error("Missing BONUM_APP_SECRET or BONUM_TERMINAL_ID");
  }
  return {
    Authorization: `AppSecret ${BONUM_APP_SECRET}`,
    "X-TERMINAL-ID": BONUM_TERMINAL_ID,
  };
};

const fetchAccessToken = async () => {
  const response = await fetch(
    `${getApiBaseUrl()}/bonum-gateway/ecommerce/auth/create`,
    {
      method: "GET",
      headers: getTokenHeaders(),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.message ?? payload?.error ?? `HTTP ${response.status}`;
    throw new Error(message);
  }

  const accessToken = payload?.accessToken;
  const expiresIn = Number(payload?.expiresIn ?? 0);
  if (!accessToken || !Number.isFinite(expiresIn)) {
    throw new Error("Invalid Bonum token response");
  }

  cachedToken = accessToken;
  tokenExpiresAt = Date.now() + Math.max(expiresIn - 60, 60) * 1000;
  return accessToken;
};

const getAccessToken = async () => {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return fetchAccessToken();
};

const isTokenInvalid = (response, payload) => {
  if (response?.status === 401) return true;
  const message = payload?.message || payload?.error || "";
  return typeof message === "string" && message.toLowerCase().includes("token");
};

const sendCreateInvoice = async ({
  amount,
  transactionId,
  expiresInSeconds,
  token,
}) => {
  const response = await fetch(
    `${getApiBaseUrl()}/bonum-gateway/ecommerce/invoices`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept-Language": "mn",
      },
      body: JSON.stringify({
        amount,
        callback: BONUM_INVOICE_CALLBACK_URL,
        transactionId,
        expiresIn: expiresInSeconds,
      }),
    },
  );
  const payload = await response.json().catch(() => null);
  return { response, payload };
};

const createInvoice = async ({ amount, transactionId, expiresInSeconds }) => {
  if (!BONUM_INVOICE_CALLBACK_URL) {
    throw new Error("Missing BONUM_INVOICE_CALLBACK_URL");
  }
  let token = await getAccessToken();
  let { response, payload } = await sendCreateInvoice({
    amount,
    transactionId,
    expiresInSeconds,
    token,
  });

  if (!response.ok && isTokenInvalid(response, payload)) {
    token = await fetchAccessToken();
    ({ response, payload } = await sendCreateInvoice({
      amount,
      transactionId,
      expiresInSeconds,
      token,
    }));
  }

  if (!response.ok) {
    const message =
      payload?.message ?? payload?.error ?? `HTTP ${response.status}`;
    throw new Error(message);
  }

  const invoiceId = payload?.invoiceId;
  const followUpLink = payload?.followUpLink;
  if (!invoiceId || !followUpLink) {
    throw new Error("Invalid Bonum invoice response");
  }

  return { invoiceId, followUpLink };
};

const buildChecksum = (rawBody, secretKey) =>
  crypto.createHmac("sha256", secretKey).update(rawBody).digest("hex");

const verifyWebhook = (rawBody, checksumHeader) => {
  if (!BONUM_WEBHOOK_CHECKSUM_KEY) {
    return { valid: true, skipped: true };
  }
  if (!rawBody || !checksumHeader) {
    return { valid: false, skipped: false };
  }
  const expected = buildChecksum(rawBody, BONUM_WEBHOOK_CHECKSUM_KEY);
  return { valid: expected === checksumHeader, skipped: false };
};

module.exports = {
  createInvoice,
  verifyWebhook,
};
