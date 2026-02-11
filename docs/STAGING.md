# Staging Runbook

## Goal

Safe pre-production validation with isolated bot, domain, and database.

## Required isolation

- Separate Railway project for staging
- Separate PostgreSQL instance
- Separate Telegram bot token
- Separate webhook secret

## Required env values

- `NEXT_PUBLIC_APP_ENV=staging`
- `NEXT_PUBLIC_SITE_URL=https://<staging-domain>`
- `TELEGRAM_BOT_TOKEN=<staging-bot-token>`
- `TELEGRAM_WEBHOOK_SECRET=<staging-secret>`
- `DATABASE_URL=<staging-db-url>`

## Validation checklist

1. `GET /api/health` returns `ok: true`.
2. `GET /api/ready` returns `db: up`.
3. Telegram login works in WebApp and browser fallback.
4. Top-up invoice is created.
5. Purchase creates RESERVED deal and locks TC.
6. Confirm releases escrow.
7. Dispute path works and admin can resolve/refund.
8. Reports appear in admin moderation queue.
