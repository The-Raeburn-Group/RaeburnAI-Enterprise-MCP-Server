# Architecture

## Runtime

The server runs as a Node.js MCP stdio server. It is intended to be launched by an MCP-compatible host such as an AI desktop client, internal assistant, automation worker, or container runner.

```text
AI assistant / MCP host
        |
        | MCP stdio
        v
RaeburnAI Enterprise MCP Server
        |
        | Connector adapters
        v
Enterprise SaaS APIs
```

## Layers

1. **Configuration**: `src/config.ts` validates all environment variables with Zod.
2. **Connectors**: `src/connectors/*` defines app-specific tools.
3. **Policy**: `src/security/policy.ts` evaluates allow/deny lists and write risk.
4. **Audit**: `src/audit/audit-log.ts` records redacted tool events.
5. **MCP runtime**: `src/mcp/server.ts` exposes tools and resources.

## Connector lifecycle

A connector is only available when:

1. It is enabled by `ENABLED_CONNECTORS`, or the enabled list is empty.
2. Its required credentials are configured.
3. Its tools are not blocked by `ALLOWED_TOOLS` or `DENIED_TOOLS`.

## Data handling

The server does not persist enterprise data by default. It returns API responses to the connected MCP host and writes structured audit events to stdout/stderr through Pino.

## Production deployment patterns

- Local MCP server for founder/developer use
- Containerised internal assistant gateway
- Dedicated per-customer deployment
- Separate development, staging and production credentials

## Adding a connector

1. Create `src/connectors/<name>.ts`.
2. Implement `EnterpriseConnector`.
3. Add tools with strict Zod schemas.
4. Register it in `src/connectors/index.ts`.
5. Document variables in `.env.example` and README.
6. Add tests for policy and schema behaviour.
