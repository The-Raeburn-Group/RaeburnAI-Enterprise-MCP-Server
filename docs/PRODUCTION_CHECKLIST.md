# Production Checklist

## Before launch

- [ ] Use organisation-owned OAuth apps and service accounts.
- [ ] Confirm each connector has least-privilege scopes.
- [ ] Configure only needed connectors with `ENABLED_CONNECTORS`.
- [ ] Configure `ALLOWED_TOOLS` for production allowlisting.
- [ ] Keep write approval enabled unless the MCP host has equivalent controls.
- [ ] Route logs to a secure log system.
- [ ] Verify logs redact secrets.
- [ ] Set up API rate-limit monitoring.
- [ ] Run `npm run check` and `npm run build` in CI.
- [ ] Build and scan the Docker image.
- [ ] Create an incident response process for credential rotation.

## Connector review

| Connector | Review item |
|---|---|
| Google Workspace | OAuth consent screen, restricted scopes, refresh-token storage |
| GitHub | Fine-grained token or GitHub App permissions |
| Slack | Bot scopes, channel visibility, posting guardrails |
| SharePoint | Microsoft Graph application permissions |
| Salesforce | Connected app policy and IP restrictions |
| HubSpot | Private app scopes |
| Notion | Integration page/database access |
| Supabase | Service role key storage and RLS posture |

## First production run

1. Start with read-only tools.
2. Run `enterprise.health`.
3. Test one connector at a time.
4. Confirm audit events are generated.
5. Add write tools only after approval flow validation.
