#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { AuditLog } from './audit/audit-log.js';
import { loadConfig } from './config.js';
import { startTenantBoundHttpServer } from './http/server.js';
import { createLogger } from './logger.js';
import { createEnterpriseMcpServer, startStdioServer } from './mcp/server.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const auditLog = new AuditLog(logger, config.AUDIT_LOG_ENABLED, config.AUDIT_LOG_REDACT_SECRETS);

  if (config.MCP_TRANSPORT === 'http') {
    await startTenantBoundHttpServer(config, logger, auditLog);
    return;
  }

  const tenantId = config.MCP_TENANT_ID ?? (config.NODE_ENV === 'production' ? undefined : 'local-development');
  if (!tenantId) throw new Error('MCP_TENANT_ID is required for stdio execution in production.');

  const context = {
    config,
    logger,
    identity: {
      tenantId,
      actorId: 'stdio-client',
      requestId: randomUUID(),
      source: 'stdio' as const
    }
  };
  const server = createEnterpriseMcpServer(context, auditLog);
  await startStdioServer(server);
  logger.info({ tenantId }, 'RaeburnAI Enterprise MCP stdio server started');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
