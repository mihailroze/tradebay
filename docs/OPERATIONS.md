# Operations

## Cron jobs

### Escrow timeout reconcile

- Endpoint: `POST /api/internal/escrow/reconcile`
- Header: `x-internal-cron-secret: <INTERNAL_CRON_SECRET>`
- Suggested cadence: every 5-10 minutes

## Backup

### Manual backup (PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/db-backup.ps1
```

### Restore (example)

```powershell
pg_restore --clean --if-exists --dbname \"$env:DATABASE_URL\" \"backups\\tradebay-<timestamp>.dump\"
```

## Alerts

- Telegram alerts: configure `TELEGRAM_ALERT_CHAT_ID`
- Optional email webhook: `ALERT_EMAIL_WEBHOOK_URL`
- Optional Sentry DSN: `SENTRY_DSN`
