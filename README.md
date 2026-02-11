# TradeBay

Telegram Web App marketplace for game-item listings with Trade Coin balance, escrow, dispute flow, and admin moderation.

## Features

- Telegram auth (WebApp initData and Telegram Login fallback)
- Listings: sale/trade, catalog filters, favorites, share links
- Wallet top-up in Telegram Stars (`XTR`) with idempotency
- Escrow flow: reserve -> confirm -> release to seller
- Dispute flow: buyer/seller can open dispute, admin resolves (release/refund)
- Moderation: user reports, auto-hide threshold, admin report queue
- Health endpoints and structured error reporting

## Local setup (Windows PowerShell)

1. Copy env file:

```powershell
copy .env.example .env
```

2. Fill required values in `.env`:

- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_IDS`
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
- `NEXT_PUBLIC_SITE_URL`
- `SESSION_SECRET`
- `TELEGRAM_WEBHOOK_SECRET`

3. Install dependencies and generate client:

```powershell
npm ci
npm run prisma:generate
```

4. Apply migrations:

```powershell
npm run prisma:migrate
```

5. Run app:

```powershell
npm run dev
```

## Railway deploy

1. Connect GitHub repo to Railway service.
2. Attach PostgreSQL plugin.
3. Set environment variables from `.env.example`.
4. Deploy. Start command is already configured:

```bash
npm run start
```

`start` runs `prisma migrate deploy` before `next start`.

## Telegram webhook

Set webhook to your production domain:

```powershell
iwr -Method Post -Uri "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" `
  -ContentType "application/json" `
  -Body '{"url":"https://<YOUR_DOMAIN>/api/telegram/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
```

## Internal cron (escrow timeout reconcile)

Call endpoint from Railway cron / GitHub Actions every 5-10 minutes:

- `POST https://<YOUR_DOMAIN>/api/internal/escrow/reconcile`
- Header: `x-internal-cron-secret: <INTERNAL_CRON_SECRET>`

## Health checks

- Liveness: `GET /api/health`
- Readiness (DB): `GET /api/ready`

## Staging

Recommended setup:

- Separate Railway project and separate PostgreSQL database
- Separate Telegram bot token for staging
- `NEXT_PUBLIC_APP_ENV=staging` for visible staging badge in UI
- Separate webhook URL and secret for staging bot

## Backups

Use PowerShell backup script (requires `pg_dump` in PATH):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/db-backup.ps1
```

Optional env vars for backup script:

- `DATABASE_URL` (required)
- `BACKUP_DIR` (default: `backups`)
- `BACKUP_RETENTION_DAYS` (default: `14`)

## Legal pages

- Terms: `/terms`
- Privacy: `/privacy`

## Notes

- Admin routes require Telegram auth and user ID in `TELEGRAM_ADMIN_IDS`.
- Images are stored in Postgres, up to 5 images per listing.
- Keep secrets out of git history.

## Additional docs

- `docs/STAGING.md`
- `docs/OPERATIONS.md`
