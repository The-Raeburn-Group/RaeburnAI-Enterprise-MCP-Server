# RaeburnAI Enterprise MCP Server

> Maintained by **Raeburn Technologies**, part of **The Raeburn Group**.
>
> Group: https://theraeburngroup.com · Technology: https://technology.theraeburngroup.com · Trust: https://trust.theraeburngroup.com

## Overview

RaeburnAI Enterprise MCP Server is an open-source Model Context Protocol gateway for connecting AI assistants to selected enterprise systems through a controlled integration layer.

The project is part of the RaeburnAI technology initiative within the wider Raeburn Technologies portfolio.

## Current maturity

**Status: controlled-pilot foundation / active development.**

The repository includes typed tools, connector controls, input validation, audit logging, allowlists, human approval controls for write/admin actions, Docker assets, CI, CodeQL and Dependabot. Live enterprise deployment still requires organisation-owned OAuth applications, tenant-specific scopes, production secret management, connector sandbox testing and operational monitoring.

## Supported integration areas

The current implementation includes connector patterns for services such as:

- Gmail and Google Calendar
- GitHub
- Slack
- SharePoint
- Salesforce
- HubSpot
- Notion
- Google Drive
- Supabase

Availability and production suitability should be assessed per connector and deployment environment.

## Core controls

- MCP stdio server for enterprise AI assistants
- Typed connector tools and Zod input validation
- Tool allowlisting and denylisting
- Human approval guard for write/admin actions
- Structured logging with redacted audit events
- Output-size controls
- Least-privilege deployment guidance
- CI, CodeQL and dependency maintenance configuration
- Docker and Docker Compose assets

## Architecture

```text
AI assistant / MCP host
        ↓
RaeburnAI Enterprise MCP Server
        ↓
Policy + approval + audit controls
        ↓
Connector adapters
        ↓
Enterprise SaaS APIs
```

See `docs/ARCHITECTURE.md` for implementation detail.

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

## Configuration

See `.env.example`. Important controls include:

- `ENABLED_CONNECTORS`
- `ALLOWED_TOOLS`
- `DENIED_TOOLS`
- `REQUIRE_APPROVAL_FOR_WRITES`
- `AUDIT_LOG_ENABLED`
- `MAX_TOOL_RESULT_BYTES`
- connector-specific OAuth/API credentials

GitHub deployments can be constrained through repository allowlists. Write access should remain disabled unless explicitly required and separately authorised.

## Security model

- Tools are classified as read, write or admin.
- Write/admin actions require human approval by default.
- Production mode rejects configurations that disable required write approval.
- Audit logging redacts secret-like fields and values.
- Connector credentials should use organisation-owned, least-privilege scopes.
- Production access should be restricted to explicitly approved repositories, tenants and resources.

See `SECURITY.md` and `docs/PRODUCTION_CHECKLIST.md` for the authoritative security and deployment requirements.

Repository controls do not constitute independent security certification or assurance.

## Related published projects

- [RaeburnAI AgentOS](https://github.com/The-Raeburn-Group/RaeburnAI-AgentOS)
- [Universal AI Knowledge Graph](https://github.com/The-Raeburn-Group/Universal-AI-Knowledge-Graph)
- [RaeburnAI Business Twin](https://github.com/The-Raeburn-Group/RaeburnAI-Business-Twin)
- [RaeburnAI Workflow Auditor](https://github.com/The-Raeburn-Group/RaeburnAI-Workflow-Auditor)

Only currently published repositories are listed here.

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Apache-2.0. See [LICENSE](LICENSE).

---

**Raeburn Technologies · The Raeburn Group**
