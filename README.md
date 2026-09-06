# RaeburnAI Enterprise MCP Server

[![CI](https://github.com/The-Raeburn-Group/RaeburnAI-Enterprise-MCP-Server/actions/workflows/ci.yml/badge.svg)](https://github.com/The-Raeburn-Group/RaeburnAI-Enterprise-MCP-Server/actions/workflows/ci.yml) ![Licence](https://img.shields.io/badge/licence-Apache--2.0-blue)

## One-line positioning statement

A governed enterprise MCP gateway connecting AI assistants to business systems through one secure, auditable server.

## Short product description

RaeburnAI Enterprise MCP Server is an open-source Model Context Protocol server for Gmail, Calendar, GitHub, Slack, SharePoint, Salesforce, HubSpot, Notion, Google Drive and Supabase. It gives AI assistants a controlled integration layer with typed tools, validation, audit logging, least-privilege configuration and write-action approval controls.

## Part of the RaeburnAI Platform

RaeburnAI is a modular enterprise AI platform for building, governing and operating practical AI systems across a business. Each project works independently, but together they form a complete operating layer for AI-enabled organisations.

| Layer         | Project                         | Role                                                                |
| ------------- | ------------------------------- | ------------------------------------------------------------------- |
| Governance    | RaeburnAI Compliance Engine     | AI governance, GDPR, ISO 42001, ISO 27001 and EU AI Act readiness   |
| Knowledge     | Universal AI Knowledge Graph    | AI-searchable business knowledge across documents, systems and data |
| Operations    | OpenAI Operations Dashboard     | Usage, cost, quality, safety and audit monitoring                   |
| Executive     | RaeburnAI Executive             | CEO briefing, KPIs, risks and suggested actions                     |
| Integration   | RaeburnAI Enterprise MCP Server | Secure connector layer between AI assistants and enterprise tools   |
| Workflow      | RaeburnAI Workflow Auditor      | Automation opportunity discovery and savings estimates              |
| Meetings      | RaeburnAI Meeting Intelligence  | Decisions, actions, owners and follow-up automation                 |
| Proposals     | RaeburnAI Proposal Generator    | Proposals, roadmaps, pricing and ROI estimates                      |
| Business Twin | RaeburnAI Business Twin         | Digital model of operations, risks and processes                    |
| Agent OS      | RaeburnAI AgentOS               | Multi-agent orchestration, approvals and control                    |

## Core features

- MCP stdio server for enterprise AI assistants
- Connectors for Gmail, Calendar, GitHub, Slack, SharePoint, Salesforce, HubSpot, Notion, Google Drive and Supabase
- Zod input validation for every tool
- Tool allowlisting and denylisting with wildcard support
- Human approval guard for write/admin tools
- Structured logging and redacted audit events
- Output-size limits and least-privilege deployment guidance
- CI, CodeQL, Dependabot, Docker and Docker Compose

## Architecture

```text
AI assistant / MCP host -> RaeburnAI Enterprise MCP Server -> policy, audit and connector adapters -> enterprise SaaS APIs
```

More detail: `docs/ARCHITECTURE.md`.

## Quick start

```bash
git clone https://github.com/The-Raeburn-Group/RaeburnAI-Enterprise-MCP-Server.git
cd RaeburnAI-Enterprise-MCP-Server
cp .env.example .env
npm install
npm run check
npm run build
npm start
```

Docker:

```bash
docker compose up --build
```

## Environment variables

See `.env.example`. Key controls include `ENABLED_CONNECTORS`, `ALLOWED_TOOLS`, `DENIED_TOOLS`, `REQUIRE_APPROVAL_FOR_WRITES`, `AUDIT_LOG_ENABLED`, `MAX_TOOL_RESULT_BYTES` and connector-specific OAuth/API credentials.

GitHub production deployments use `GITHUB_READ_TOKEN` plus an explicit `GITHUB_ALLOWED_REPOSITORIES` boundary. Writes remain disabled unless `GITHUB_ENABLE_WRITES=true`; when enabled they require a separate `GITHUB_WRITE_TOKEN` and the narrower `GITHUB_WRITE_ALLOWED_REPOSITORIES` list. The legacy `GITHUB_TOKEN` setting is development-only.

## Usage examples

See `examples/mcp-client-config.json` and `examples/demo-data.json`.

## Security model

- All tools are classified as `read`, `write` or `admin`.
- Write/admin tools require human approval by default.
- Production mode refuses to start if write approval is disabled.
- Audit logs redact secret-like fields and secret-like string values.
- Google Workspace validates actual issued token scopes and rejects broader API scopes.
- GitHub production access is repository-allowlisted, rejects broad classic repository scopes and separates read/write credentials.
- Salesforce is read-only; Supabase can be table-allowlisted.
- Use organisation-owned apps, service accounts and least-privilege scopes.

More detail: `SECURITY.md` and `docs/PRODUCTION_CHECKLIST.md`.

## Production readiness

This is a hardened open-source foundation suitable for controlled pilots with organisation-owned credentials and MCP host-level human approval. Live enterprise rollout still requires real OAuth apps, tenant-specific scopes, secret management, sandbox connector tests and operational monitoring.

## Roadmap

See `ROADMAP.md`.

## Contributing

See `CONTRIBUTING.md`.

## Licence

Apache-2.0. See `LICENSE`.
