# Production Deployment

## Recommended pattern

Run the server as a private enterprise integration gateway launched by an MCP-compatible host. Use one deployment per environment and separate credentials for development, staging and production.

## Deployment checklist

1. Create organisation-owned OAuth apps and service accounts.
2. Configure least-privilege scopes for each connector.
3. Store secrets in a managed secret store.
4. Set `NODE_ENV=production`.
5. Keep `REQUIRE_APPROVAL_FOR_WRITES=true`.
6. Set `ENABLED_CONNECTORS` to only the required connectors.
7. Set `ALLOWED_TOOLS` to a strict production allowlist.
8. Route logs to a secure log platform.
9. Run `npm run check`, `npm run build` and `npm run docker:build` in CI.
10. Test each connector with a sandbox tenant before production use.

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

## Least-privilege guidance

- Gmail: read-only message metadata unless message body access is explicitly needed.
- Calendar: read-only calendar event scopes for v0.1.
- GitHub: fine-grained repository read permissions or GitHub App installation token.
- Slack: search/read scopes plus posting only where approved.
- SharePoint: restrict Graph app permissions to required sites where possible.
- Salesforce: read-only connected app profile.
- HubSpot: contact/company read scopes for v0.1.
- Notion: grant the integration access only to required pages/databases.
- Supabase: prefer a dedicated database role or restricted service key proxy; set `SUPABASE_ALLOWED_TABLES`.

## Health checks

The current MCP transport is stdio, so health is exposed through the `enterprise.health` MCP tool rather than an HTTP endpoint. A future HTTP sidecar is tracked in `ROADMAP.md`.
