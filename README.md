# TradeBay

Telegram Web App marketplace for game items. Sellers publish listings, buyers browse and contact via Telegram.

## Local setup

1) Copy envs:
```bash
copy .env.example .env
```

2) Fill values in `.env`:
- `DATABASE_URL` (Postgres)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_IDS`

3) Generate Prisma client + run migrations:
```bash
npm run prisma:generate
npm run prisma:migrate
```

4) Run dev server:
```bash
npm run dev
```

## Railway deploy (high level)
- Create Postgres in Railway and set `DATABASE_URL`.
- Add environment variables from `.env.example`.
- Deploy service from GitHub repo.
- Run `npm run prisma:deploy` once after the database is attached.

## Notes
- Admin endpoints require Telegram initData + user ID in `TELEGRAM_ADMIN_IDS`.
- Public catalog is editable via admin API endpoints.
- Images are stored in Postgres (up to 5 images, 2MB each by default).
