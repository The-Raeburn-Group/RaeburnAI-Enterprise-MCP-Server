import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.js';
import { loadConfig } from '../../src/config.js';
import { authenticateChainRequest, createTenantBoundHttpServer } from '../../src/http/server.js';
import { createLogger } from '../../src/logger.js';

const token = '0123456789abcdefghijklmnop';

function config() {
  return loadConfig({
    MCP_TRANSPORT: 'http',
    MCP_TENANT_ID: 'tenant-a',
    RAEBURN_CHAIN_SERVICE_TOKEN: token,
    LOG_LEVEL: 'silent'
  });
}

function trustedHeaders(overrides: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${token}`,
    'x-tenant-id': 'tenant-a',
    'x-actor-id': 'actor-a',
    'x-request-id': 'request-a',
    ...overrides
  };
}

describe('Chain request authentication', () => {
  it('accepts only the configured tenant and preserves trusted provenance', () => {
    const identity = authenticateChainRequest(
      { ...trustedHeaders(), 'x-raeburn-approval-id': 'approval-1' },
      config()
    );
    expect(identity).toEqual({
      tenantId: 'tenant-a',
      actorId: 'actor-a',
      requestId: 'request-a',
      approvalId: 'approval-1',
      source: 'chain-http'
    });
  });

  it('rejects an invalid service token', () => {
    expect(() =>
      authenticateChainRequest(
        trustedHeaders({ authorization: 'Bearer definitely-wrong-token-value' }),
        config()
      )
    ).toThrow('invalid_chain_service_token');
  });

  it('rejects a valid Chain token carrying another tenant', () => {
    expect(() =>
      authenticateChainRequest(trustedHeaders({ 'x-tenant-id': 'tenant-b' }), config())
    ).toThrow('tenant_mismatch');
  });
});

describe('tenant-bound HTTP bridge', () => {
  const servers: ReturnType<typeof createTenantBoundHttpServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          )
      )
    );
  });

  it('keeps health public but protects tool discovery with service and tenant identity', async () => {
    const currentConfig = config();
    const logger = createLogger(currentConfig);
    const auditLog = new AuditLog(logger, true, true);
    const server = createTenantBoundHttpServer({ config: currentConfig, logger }, auditLog);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);

    const unauthorized = await fetch(`http://127.0.0.1:${port}/v1/tools`);
    expect(unauthorized.status).toBe(401);

    const crossTenant = await fetch(`http://127.0.0.1:${port}/v1/tools`, {
      headers: trustedHeaders({ 'x-tenant-id': 'tenant-b' })
    });
    expect(crossTenant.status).toBe(403);
    await expect(crossTenant.json()).resolves.toMatchObject({ error: 'tenant_mismatch' });

    const allowed = await fetch(`http://127.0.0.1:${port}/v1/tools`, {
      headers: trustedHeaders()
    });
    expect(allowed.status).toBe(200);
    await expect(allowed.json()).resolves.toMatchObject({ tenantId: 'tenant-a' });
  });
});
