# Bonum Integration - Function by Function

This document explains how Bonum works in this project and includes the core function code blocks.

## 1) End-to-end flow

1. Worker creates payment info from app (`bank_app` or `cash`).
2. Backend `POST /orders/:id/complete` saves payment fields.
3. If `bank_app`, backend creates Bonum invoice and stores `invoiceId` + `followUpLink`.
4. User opens `followUpLink` and pays in Bonum.
5. Bonum sends webhook to `POST /payments/bonum/webhook`.
6. Backend verifies checksum and updates `orders.payment_status` to `paid` or `failed`.

---

## 2) Environment config used by Bonum

File: `back/src/config/env.js`

```js
const {
  BONUM_API_BASE_URL,
  BONUM_APP_SECRET,
  BONUM_TERMINAL_ID,
  BONUM_WEBHOOK_CHECKSUM_KEY,
  BONUM_INVOICE_CALLBACK_URL,
} = process.env;
```

Required in practice:

- `BONUM_APP_SECRET`
- `BONUM_TERMINAL_ID`
- `BONUM_INVOICE_CALLBACK_URL`

Strongly recommended in production:

- `BONUM_WEBHOOK_CHECKSUM_KEY`

Optional:

- `BONUM_API_BASE_URL` (defaults to test URL)

---

## 3) Bonum service functions

File: `back/src/services/bonum.js`

### 3.1 `getApiBaseUrl`

Purpose: Returns Bonum API base URL (env override or default test URL).

```js
const defaultApiBaseUrl = "https://testapi.bonum.mn";
const getApiBaseUrl = () => BONUM_API_BASE_URL || defaultApiBaseUrl;
```

### 3.2 `getTokenHeaders`

Purpose: Builds auth headers for token creation endpoint.

```js
const getTokenHeaders = () => {
  if (!BONUM_APP_SECRET || !BONUM_TERMINAL_ID) {
    throw new Error("Missing BONUM_APP_SECRET or BONUM_TERMINAL_ID");
  }
  return {
    Authorization: `AppSecret ${BONUM_APP_SECRET}`,
    "X-TERMINAL-ID": BONUM_TERMINAL_ID,
  };
};
```

### 3.3 `fetchAccessToken`

Purpose: Gets a fresh Bonum access token and caches expiry time.

```js
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
```

### 3.4 `getAccessToken`

Purpose: Uses cached token if valid, otherwise fetches a new one.

```js
const getAccessToken = async () => {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return fetchAccessToken();
};
```

### 3.5 `isTokenInvalid`

Purpose: Detects token-expired/invalid responses.

```js
const isTokenInvalid = (response, payload) => {
  if (response?.status === 401) return true;
  const message = payload?.message || payload?.error || "";
  return typeof message === "string" && message.toLowerCase().includes("token");
};
```

### 3.6 `sendCreateInvoice`

Purpose: Calls Bonum invoice API.

```js
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
```

### 3.7 `createInvoice`

Purpose: Main public function to create Bonum invoice with retry on invalid token.

```js
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
```

### 3.8 `buildChecksum`

Purpose: Creates HMAC SHA256 checksum from raw request body.

```js
const buildChecksum = (rawBody, secretKey) =>
  crypto.createHmac("sha256", secretKey).update(rawBody).digest("hex");
```

### 3.9 `verifyWebhook`

Purpose: Verifies Bonum webhook checksum.

```js
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
```

### 3.10 Exports

```js
module.exports = {
  createInvoice,
  verifyWebhook,
};
```

---

## 4) Where `createInvoice` is used

File: `back/src/routes/orders.js` in `POST /:id/complete`

This endpoint:

- validates user and payment input
- sets order `status = completed`
- sets `payment_status = pending`
- if method is `bank_app`, calls `createInvoice(...)`
- stores `payment_invoice_id` and `payment_followup_link`

Core part:

```js
if (paymentMethod === "bank_app") {
  const invoice = await createInvoice({
    amount: paymentAmount,
    transactionId: id,
    expiresInSeconds: 1800,
  });
  updatePayload.payment_invoice_id = invoice.invoiceId;
  updatePayload.payment_followup_link = invoice.followUpLink;
}
```

---

## 5) Where `verifyWebhook` is used

File: `back/src/routes/payments.js` in `POST /bonum/webhook`

This endpoint:

- reads checksum from `x-checksum-v2`
- verifies checksum with `verifyWebhook`
- ignores non-payment events
- reads `invoiceId`, `transactionId`, `status`
- updates order payment status:
  - `SUCCESS` / `PAID` -> `paid`
  - `FAILED` / `CANCELLED` -> `failed`

Core part:

```js
const { valid, skipped } = verifyWebhook(rawBody, checksum);
if (!valid && !skipped) {
  return res.status(400).json({ error: "Invalid checksum" });
}
```

```js
const isPaid = status === "SUCCESS" || status === "PAID";
const isFailed = status === "FAILED" || status === "CANCELLED";
```

```js
const { data, error } = await supabaseAdmin
  .from("orders")
  .update(updatePayload)
  .or(orFilters.join(","))
  .select("id, payment_status, payment_invoice_id, payment_transaction_id");
```

---

## 6) Raw body capture for checksum verification

File: `back/src/app.js`

Webhook checksum needs the exact raw JSON body, so app stores `req.rawBody`:

```js
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);
```

---

## 7) Order table payment fields used by Bonum

File: `back/sql/orders_add_payment_fields.sql`

```sql
alter table public.orders
  add column if not exists payment_amount numeric,
  add column if not exists payment_method text,
  add column if not exists payment_status text,
  add column if not exists payment_provider text,
  add column if not exists payment_invoice_id text,
  add column if not exists payment_followup_link text,
  add column if not exists payment_transaction_id text,
  add column if not exists payment_paid_at timestamptz;
```

---

## 8) Quick test checklist

1. Worker creates payment with `bank_app` in app.
2. DB should have `payment_status = pending`, and link fields filled.
3. User opens `payment_followup_link` and pays.
4. Webhook should hit `/payments/bonum/webhook`.
5. DB should become `payment_status = paid` and `payment_paid_at` filled.

