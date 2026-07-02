# RaeburnAI Enterprise MCP Server

A production-oriented open-source Model Context Protocol server that connects AI assistants to enterprise systems through one governed interface.

## What it connects to

- Gmail
- Google Calendar
- GitHub
- Slack
- SharePoint / Microsoft Graph
- Salesforce
- HubSpot
- Notion
- Google Drive
- Supabase

## Why this exists

Most organisations do not need another isolated assistant. They need a secure, auditable layer that lets approved AI tools read from and act across the systems people already use.

RaeburnAI Enterprise MCP Server provides:

- One MCP server for enterprise integrations
- Typed connector framework
- Strict environment validation
- Tool allow/deny policy
- Approval guard for write tools
- Audit logs with secret redaction
- Docker image
- GitHub Actions CI
- Open-source governance docs

## Quick start

```bash
git clone https://github.com/Raebu/RaeburnAI-Enterprise-MCP-Server.git
cd RaeburnAI-Enterprise-MCP-Server
cp .env.example .env
npm install
npm run build
npm start
```

## Configure an MCP client

Example local MCP client configuration:

```json
{
  "mcpServers": {
    "raeburnai-enterprise": {
      "command": "node",
      "args": ["/absolute/path/to/RaeburnAI-Enterprise-MCP-Server/dist/index.js"],
      "env": {
        "ENABLED_CONNECTORS": "github,slack,google-drive",
        "GITHUB_TOKEN": "...",
        "SLACK_BOT_TOKEN": "..."
      }
    }
  }
}
```

## Security model

Write-capable tools are marked as `write` risk and are held by the policy layer by default. For production, deploy with least-privilege OAuth scopes, organisation-owned service accounts, and environment-specific secrets.

Recommended controls:

- Use `ENABLED_CONNECTORS` to expose only required connectors.
- Use `ALLOWED_TOOLS` for strict tool allowlisting.
- Use `DENIED_TOOLS` for emergency shutoff.
- Keep `REQUIRE_APPROVAL_FOR_WRITES=true` unless your host client provides a separate human approval workflow.
- Keep audit logs enabled.
- Do not use personal tokens in production.

## Available tools in v0.1

| Connector | Tools |
|---|---|
| Enterprise | `enterprise.health` |
| Gmail | `gmail.search_messages`, `gmail.get_message` |
| Calendar | `calendar.list_events` |
| GitHub | `github.search_repositories`, `github.list_issues` |
| Slack | `slack.search_messages`, `slack.post_message` |
| SharePoint | `sharepoint.search_sites` |
| Salesforce | `salesforce.soql_query` |
| HubSpot | `hubspot.search_contacts` |
| Notion | `notion.search` |
| Google Drive | `google_drive.search_files` |
| Supabase | `supabase.select` |

## Environment variables

See `.env.example` for all supported variables.

## Development

```bash
npm run dev
npm run check
npm run build
```

## Docker

```bash
docker build -t raeburnai-enterprise-mcp .
docker run --rm --env-file .env raeburnai-enterprise-mcp
```

## Roadmap

- OAuth device-code setup wizard
- Human approval callback adapters
- Fine-grained per-user permissions
- Read/write Salesforce and HubSpot workflows
- Jira, Linear and ServiceNow connectors
- Tenant-aware cloud deployment mode
- OpenTelemetry traces and metrics
- Policy-as-code with OPA/Rego

## License

Apache-2.0. See `LICENSE`.
