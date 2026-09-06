import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import type { AuditLog } from '../audit/audit-log.js';
import { allTools } from '../connectors/index.js';
import type { ConnectorContext, ExecutionIdentity } from '../connectors/types.js';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logger.js';
import { connectorStatus, executeEnterpriseTool } from '../mcp/server.js';

const InvokeSchema = z.object({
  tool: z.string().min(1).max(200),
  input: z.unknown().default({})
});

export class ChainRequestError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 413,
    public readonly code: string
  ) {
    super(code);
    this.name = 'ChainRequestError';
  }
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  return value?.trim() || undefined;
}

function equalSecret(provided: string, expected: string): boolean {
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function authenticateChainRequest(headers: IncomingHttpHeaders, config: AppConfig): ExecutionIdentity {
  const expectedToken = config.RAEBURN_CHAIN_SERVICE_TOKEN;
  if (!expectedToken) throw new ChainRequestError(401, 'chain_service_auth_unconfigured');

  const authorization = header(headers, 'authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined;
  if (!token || !equalSecret(token, expectedToken)) {
    throw new ChainRequestError(401, 'invalid_chain_service_token');
  }

  const tenantId = header(headers, 'x-tenant-id');
  const actorId = header(headers, 'x-actor-id');
  const requestId = header(headers, 'x-request-id');
  const approvalId = header(headers, 'x-raeburn-approval-id');
  if (!tenantId || !actorId || !requestId) {
    throw new ChainRequestError(400, 'missing_trusted_execution_context');
  }
  if (!config.MCP_TENANT_ID) {
    throw new ChainRequestError(403, 'mcp_tenant_unconfigured');
  }
  if (tenantId !== config.MCP_TENANT_ID) {
    throw new ChainRequestError(403, 'tenant_mismatch');
  }

  return {
    tenantId,
    actorId,
    requestId,
    ...(approvalId ? { approvalId } : {}),
    source: 'chain-http'
  };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store'
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage, maxBytes = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new ChainRequestError(413, 'request_body_too_large');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new ChainRequestError(400, 'invalid_json');
  }
}

export function createTenantBoundHttpServer(
  baseContext: Pick<ConnectorContext, 'config' | 'logger'>,
  auditLog: AuditLog
) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://mcp.local');
      if (request.method === 'GET' && url.pathname === '/health') {
        return json(response, 200, {
          status: 'ok',
          service: 'raeburnai-enterprise-mcp',
          transport: 'http',
          tenantBound: Boolean(baseContext.config.MCP_TENANT_ID)
        });
      }

      const identity = authenticateChainRequest(request.headers, baseContext.config);
      const context: ConnectorContext = { ...baseContext, identity };

      if (request.method === 'GET' && url.pathname === '/v1/tools') {
        return json(response, 200, {
          ...connectorStatus(context),
          tools: allTools(context).map((item) => ({
            name: item.name,
            connector: item.connector,
            risk: item.risk,
            description: item.description
          }))
        });
      }

      if (request.method === 'POST' && url.pathname === '/v1/tools/invoke') {
        const body = InvokeSchema.parse(await readJson(request));
        const enterpriseTool = allTools(context).find((item) => item.name === body.tool);
        if (!enterpriseTool) throw new ChainRequestError(404, 'tool_not_found');
        const result = await executeEnterpriseTool(enterpriseTool, body.input, context, auditLog);
        return json(response, result.ok ? 200 : 403, {
          ok: result.ok,
          tool: enterpriseTool.name,
          tenantId: identity.tenantId,
          requestId: identity.requestId,
          ...(result.security ? { security: result.security } : {}),
          ...(result.ok
            ? { output: result.output }
            : { error: result.security ? result.text : (result.reason ?? result.text) })
        });
      }

      throw new ChainRequestError(404, 'not_found');
    } catch (error) {
      if (error instanceof ChainRequestError) {
        return json(response, error.status, { error: error.code });
      }
      if (error instanceof z.ZodError) {
        return json(response, 400, { error: 'invalid_request', issues: error.issues });
      }
      baseContext.logger.error({ err: error }, 'mcp_http_request_failed');
      return json(response, 500, { error: 'internal_error' });
    }
  });
}

export async function startTenantBoundHttpServer(config: AppConfig, logger: Logger, auditLog: AuditLog): Promise<void> {
  const server = createTenantBoundHttpServer({ config, logger }, auditLog);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.MCP_HTTP_PORT, config.MCP_HTTP_HOST, () => resolve());
  });
  logger.info(
    {
      host: config.MCP_HTTP_HOST,
      port: config.MCP_HTTP_PORT,
      tenantId: config.MCP_TENANT_ID
    },
    'RaeburnAI Enterprise MCP HTTP bridge started'
  );
}
