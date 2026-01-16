# Operations

## Monitoring
- Health endpoints:
  - `GET /health` and `GET /api/v1/health` (basic)
  - `GET /api/v1/health/infra` (Postgres/Redis/gateway summary)
- Optional protection: set `HEALTH_CHECK_TOKEN` and send header `x-health-token`.
- Gateway fleet: `GET /api/v1/admin/gateways/health` (super admin session required).
- WhatsApp disconnect alert: set notifier session id in super admin settings.
- Gateway down/over-capacity alerts: uses notifier session and optional `ALERT_WEBHOOK_URL`.
- Contact sync queue state stored in Redis key `wa:sync:queue`.

## Backup (Postgres)
- Quick backup:
  - `pg_dump "$DATABASE_URL" > backup_$(date +%F).sql`
- Compressed backup:
  - `pg_dump -Fc "$DATABASE_URL" > backup_$(date +%F).dump`

## Restore (Postgres)
- From SQL:
  - `psql "$DATABASE_URL" < backup_YYYY-MM-DD.sql`
- From dump:
  - `pg_restore -d "$DATABASE_URL" backup_YYYY-MM-DD.dump`

## Load readiness
- Set `GATEWAY_MAX_SESSIONS` to flag over-capacity gateways.
- Gateway auto-assign happens on tenant session_id updates when gateway_url is empty.
- Tune sync/queue knobs:
  - `CONTACT_SYNC_*`, `MESSAGE_SEND_*`, `MAX_MESSAGES_PER_BATCH`.
