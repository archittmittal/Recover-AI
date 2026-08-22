# RecoverAI: Production Deployment & Hosting Guide

This guide covers deploying **RecoverAI** to modern serverless and containerized cloud providers (Vercel, Railway, Render, Fly.io, or AWS ECS), configuring Razorpay Webhooks, and connecting Google Gemini AI.

---

## 1. Prerequisites & Environment Variables

| Variable Name | Description | Example / Default |
| :--- | :--- | :--- |
| `RAZORPAY_KEY_ID` | Razorpay Key ID (from Razorpay Dashboard > Settings > API Keys) | `rzp_test_...` or `rzp_live_...` |
| `RAZORPAY_KEY_SECRET` | Razorpay Key Secret | `sec_...` |
| `RAZORPAY_WEBHOOK_SECRET` | Secret configured on Razorpay Webhook settings | `wh_sec_...` |
| `GEMINI_API_KEY` | Google Gemini API Key (from Google AI Studio) | `AIzaSy...` |
| `DATABASE_URL` | SQLite file path or remote Turso/libSQL connection URL | `file:./data/recoverai.db` |
| `NEXT_PUBLIC_APP_URL` | Production public URL of the deployment | `https://recoverai.yourdomain.com` |

---

## 2. Database Portability (SQLite WAL & Turso / libSQL)

RecoverAI uses Drizzle ORM and runs out-of-the-box on SQLite with **Write-Ahead Logging (WAL)** enabled for serialized, non-blocking concurrency:

```bash
sqlite.pragma('journal_mode = WAL');
```

### Option A: Persistent Volume Deployment (Railway / Render / Fly.io / Docker)
- Deploy using the standard Node.js runtime (`Node >= 22`).
- Mount a persistent volume at `/app/data` to persist `./data/recoverai.db`.
- Start command:
  ```bash
  npm run start
  ```

### Option B: Serverless Deployment (Vercel + Turso libSQL)
- Create a free database on [Turso](https://turso.tech).
- Set `DATABASE_URL=libsql://your-db-name.turso.io` and `DATABASE_AUTH_TOKEN=your-token`.
- RecoverAI automatically handles schema migrations on boot.

---

## 3. Configuring Razorpay Webhooks

To receive live transaction events and trigger autonomous recovery:

1. Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Navigate to **Settings > Webhooks > Add New Webhook**.
3. Set **Webhook URL**:
   ```
   https://recoverai.yourdomain.com/api/webhooks/razorpay
   ```
4. Enter a strong secret and save it to your `RAZORPAY_WEBHOOK_SECRET` environment variable.
5. Subscribe to the following **Active Events**:
   - `payment.failed` (triggers failure classification and dunning initiation)
   - `payment.captured` (triggers payment resolution and stops outreach)
   - `subscription.pending` (triggers mandate recovery)
   - `subscription.halted` (triggers invoice reminders)
   - `payment_link.paid` (resolves recovery journeys)
6. Save and test using Razorpay's **Send Test Webhook** button.

---

## 4. OpenSSF Production Security Checklist

Before directing production live traffic to RecoverAI:
- [x] **Timing-Safe HMAC Verification**: All incoming webhooks are validated with `crypto.timingSafeEqual`.
- [x] **Idempotency Protection**: Duplicate webhook deliveries are rejected via `webhook_events` SHA-256 hash checks.
- [x] **Zero PII Leakage**: Credit card PANs, CVVs, and raw phone fragments are stripped before LLM prompting.
- [x] **RBI Contact Hours Enforcement**: Active contact window (8:00 AM – 7:00 PM IST) is mathematically enforced.
- [x] **Immutable Audit Trail**: All recovery actions, Gemini reasoning traces, and payment links are recorded in append-only SQLite `audit_logs`.

---

## 5. Deployment Verification & Health Check

Run the following sanity checks post-deployment:

```bash
# 1. Check API Health and Metrics Aggregation
curl -s https://recoverai.yourdomain.com/api/metrics | jq .

# 2. Check Customer Recovery Directory
curl -s https://recoverai.yourdomain.com/api/customers | jq .

# 3. Trigger Abandonment Sweep Cron
curl -X POST https://recoverai.yourdomain.com/api/recovery/sweep | jq .
```
