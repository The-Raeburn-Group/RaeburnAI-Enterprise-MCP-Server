#!/usr/bin/env node
import { AuditLog } from './audit/audit-log.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createEnterpriseMcpServer, startStdioServer } from './mcp/server.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const auditLog = new AuditLog(logger, config.AUDIT_LOG_ENABLED, config.AUDIT_LOG_REDACT_SECRETS);
  const context = { config, logger };
  const server = createEnterpriseMcpServer(context, auditLog);

  if (config.MCP_TRANSPORT !== 'stdio') {
    throw new Error(`Unsupported transport: ${config.MCP_TRANSPORT}`);
  }

  await startStdioServer(server);
  logger.info('RaeburnAI Enterprise MCP Server started');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
