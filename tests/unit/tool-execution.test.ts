import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.js';
import type { ConnectorContext, EnterpriseTool } from '../../src/connectors/types.js';
import { loadConfig } from '../../src/config.js';
import { createLogger } from '../../src/logger.js';
import { executeEnterpriseTool } from '../../src/mcp/server.js';

function context(approvalId?: string, overrides: NodeJS.ProcessEnv = {}): ConnectorContext {
  const config = loadConfig({
    MCP_TENANT_ID: 'tenant-a',
    LOG_LEVEL: 'silent',
    REQUIRE_APPROVAL_FOR_WRITES: 'true',
    ...overrides
  });
  return {
    config,
    logger: createLogger(config),
    identity: {
      tenantId: 'tenant-a',
      actorId: 'actor-a',
      requestId: 'request-a',
      ...(approvalId ? { approvalId } : {}),
      source: 'chain-http'
    }
  };
}

function writeTool(run: ReturnType<typeof vi.fn>): EnterpriseTool {
  return {
    name: 'test.write',
    description: 'A test write tool',
    connector: 'github',
    risk: 'write',
    inputSchema: z.object({ value: z.string() }),
    run
  };
}

describe('governed tool execution', () => {
  it('does not execute a write tool without an authenticated approval reference', async () => {
    const run = vi.fn(async () => ({ ok: true }));
    const ctx = context();
    const auditLog = new AuditLog(ctx.logger, true, true);
    const result = await executeEnterpriseTool(writeTool(run), { value: 'x' }, ctx, auditLog);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('approval');
    expect(run).not.toHaveBeenCalled();
  });

  it('executes the exact tool when the authenticated Chain context carries approval provenance', async () => {
    const run = vi.fn(async (input: { value: string }, ctx: ConnectorContext) => ({
      value: input.value,
      tenantId: ctx.identity.tenantId,
      approvalId: ctx.identity.approvalId
    }));
    const ctx = context('approval-123');
    const auditLog = new AuditLog(ctx.logger, true, true);
    const result = await executeEnterpriseTool(writeTool(run), { value: 'approved' }, ctx, auditLog);

    expect(result.ok).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual({
      value: 'approved',
      tenantId: 'tenant-a',
      approvalId: 'approval-123'
    });
  });

  it('never returns raw connector secrets through structured output or MCP text', async () => {
    const run = vi.fn(async () => ({
      apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz',
      note: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      safe: 'visible'
    }));
    const ctx = context('approval-123');
    const auditLog = new AuditLog(ctx.logger, true, true);
    const result = await executeEnterpriseTool(writeTool(run), { value: 'approved' }, ctx, auditLog);

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.output)).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(result.output)).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(result.text).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(result.output).toMatchObject({ apiKey: '[redacted]', safe: 'visible' });
  });

  it('wraps oversized structured output instead of bypassing the configured result limit', async () => {
    const run = vi.fn(async () => ({ payload: 'x'.repeat(5000) }));
    const ctx = context('approval-123', { MAX_TOOL_RESULT_BYTES: '1024' });
    const auditLog = new AuditLog(ctx.logger, true, true);
    const result = await executeEnterpriseTool(writeTool(run), { value: 'approved' }, ctx, auditLog);

    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.output).toMatchObject({ truncated: true });
    expect(Buffer.byteLength(result.text, 'utf8')).toBeLessThanOrEqual(1024);
  });

  it('redacts secret-bearing upstream error messages before logging or returning them', async () => {
    const run = vi.fn(async () => {
      throw new Error('upstream Authorization: Bearer abcdefghijklmnopqrstuvwxyz');
    });
    const ctx = context('approval-123');
    const auditLog = new AuditLog(ctx.logger, true, true);
    const result = await executeEnterpriseTool(writeTool(run), { value: 'approved' }, ctx, auditLog);

    expect(result.ok).toBe(false);
    expect(result.reason).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(result.reason).toContain('[redacted]');
  });
});
