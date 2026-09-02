# RecoverAI: Production Deployment & Hosting Guide

This guide covers deploying **RecoverAI** to modern serverless and containerized cloud providers (Vercel, Railway, Render, Fly.io, or AWS ECS), configuring Razorpay Webhooks, and connecting Google Gemini AI.

---

## 1. Prerequisites & Environment Variables

| Variable Name | Description | Example / Default |
| :--- | :--- | :--- |
| `RAZORPAY_KEY_ID` | Razorpay Key ID (from Razorpay Dashboard > Settings > API Keys) | `rzp_test_...` or `rzp_live_...` |
| `RAZORPAY_KEY_SECRET` | Razorpay Key Secret | `sec_...` |
| `RAZORPAY_WEBHOOK_SECRET` | A secret **you choose** and enter in both places: the Razorpay webhook form and this variable. Razorpay does not issue it and it has no fixed format | any high-entropy string |
| `GEMINI_API_KEY` | Google Gemini API Key (from Google AI Studio) | `AIza...` |
| `DATABASE_URL` | `file:` for a local SQLite file, `libsql://` or `https://` for Turso | `file:./data/recoverai.db` |
| `DATABASE_AUTH_TOKEN` | Turso token. **Required** whenever `DATABASE_URL` is remote; startup fails without it | `turso db tokens create <db>` |
| `SESSION_SECRET` | Signing key for the dashboard session cookie. Every page and API route except the webhook is behind it (RA-05) | 32+ random bytes |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Dashboard login | — |
| `RECOVERAI_MODE` | `mock` (no outbound calls) or `live` (real Razorpay/Gemini) | `mock` |
| `RECOVERAI_DEMO_MODE` | `true` exposes `/api/simulator/*` on a production build, so a visitor can drive the demo. `/api/simulator/seed` still requires a dashboard session, so the batch cannot be truncated by anyone but you. Leave unset for a deployment handling live Razorpay traffic | unset |
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

The driver is chosen from the `DATABASE_URL` scheme (`src/lib/db/index.ts`): `file:` uses
`better-sqlite3`, `libsql://` and `https://` use `@libsql/client`. Anything else fails at startup
with a message naming the two it accepts, rather than being silently treated as a filename.

**Migrations are not applied on boot for a remote database.** On a serverless host every cold
start would race every other cold start to migrate the one shared database. Apply them once, at
deploy time:

```bash
# 1. Create the database and a token
turso db create recoverai
turso db show recoverai --url          # → libsql://recoverai-<org>.turso.io
turso db tokens create recoverai       # → the DATABASE_AUTH_TOKEN value

# 2. Apply the migrations from your machine (drizzle.config.ts switches to the
#    Turso dialect automatically when DATABASE_URL is remote)
DATABASE_URL=libsql://recoverai-<org>.turso.io \
DATABASE_AUTH_TOKEN=<token> \
  npm run db:migrate

# 3. Confirm the schema landed, and optionally seed the demo batch
DATABASE_URL=libsql://recoverai-<org>.turso.io \
DATABASE_AUTH_TOKEN=<token> \
  npm run db:verify                    # add SEED=1 to populate the 150-failure batch
```

`npm run db:verify` reports how many migrations are applied and which tables exist, so a
forgotten migrate step surfaces as a sentence naming the fix instead of `no such table:
customers` at the first dashboard request.

**Then deploy.** Set every variable from §1 in the Vercel project. Set `RECOVERAI_DEMO_MODE=true`
only if the deployment is meant to be an interactive demo: it opens `/api/simulator/*` so a
visitor can inject a signed webhook, pay, reply and move the clock. Reseeding stays behind a
dashboard session either way, so the batch cannot be reset by a passer-by.

Local development is unchanged: no `DATABASE_URL` at all still means `file:./data/recoverai.db`,
created and migrated on first connection with no separate step.

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
5. Subscribe to **`payment.failed`** only.

   That is the sole event the handler acts on — `payload.event` is tested once, at
   `src/app/api/webhooks/razorpay/route.ts:115`. Any other subscribed event is verified,
   recorded in `webhook_events`, marked `processed`, and has **no effect on any journey**:
   Razorpay's delivery log shows green while nothing happens. In particular `payment_link.paid`
   does *not* resolve a recovery journey today, so a customer paying through a recovery link is
   not reflected on the dashboard by this route.
6. Trigger a delivery from the dashboard to confirm the wiring end to end.

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
