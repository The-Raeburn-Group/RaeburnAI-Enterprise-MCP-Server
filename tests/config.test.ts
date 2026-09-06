import { describe, expect, it } from 'vitest';
import { evaluateToolPolicy } from '../src/security/policy.js';
import { isConnectorEnabled, loadConfig } from '../src/config.js';

describe('configuration', () => {
  it('loads defaults safely', () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.MCP_TRANSPORT).toBe('stdio');
    expect(config.REQUIRE_APPROVAL_FOR_WRITES).toBe(true);
    expect(config.AUDIT_LOG_ENABLED).toBe(true);
    expect(config.AUDIT_LOG_REDACT_SECRETS).toBe(true);
  });

  it('parses enabled connectors from CSV', () => {
    const config = loadConfig({ ENABLED_CONNECTORS: 'github, slack' });
    expect(isConnectorEnabled(config, 'github')).toBe(true);
    expect(isConnectorEnabled(config, 'gmail')).toBe(false);
  });

  it('parses explicit false boolean environment values instead of treating every string as true', () => {
    const config = loadConfig({
      REQUIRE_APPROVAL_FOR_WRITES: 'false',
      AUDIT_LOG_ENABLED: '0',
      AUDIT_LOG_REDACT_SECRETS: 'no'
    });
    expect(config.REQUIRE_APPROVAL_FOR_WRITES).toBe(false);
    expect(config.AUDIT_LOG_ENABLED).toBe(false);
    expect(config.AUDIT_LOG_REDACT_SECRETS).toBe(false);
  });

  it('fails closed without an explicit production tenant', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('MCP_TENANT_ID is required');
  });

  it('does not allow production approval or audit-redaction guardrails to be disabled', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        MCP_TENANT_ID: 'tenant-a',
        REQUIRE_APPROVAL_FOR_WRITES: 'false'
      })
    ).toThrow('REQUIRE_APPROVAL_FOR_WRITES');

    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        MCP_TENANT_ID: 'tenant-a',
        AUDIT_LOG_REDACT_SECRETS: 'false'
      })
    ).toThrow('AUDIT_LOG_REDACT_SECRETS');
  });

  it('requires a strong Chain service credential for production HTTP transport', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        MCP_TRANSPORT: 'http',
        MCP_TENANT_ID: 'tenant-a',
        RAEBURN_CHAIN_SERVICE_TOKEN: 'short'
      })
    ).toThrow('RAEBURN_CHAIN_SERVICE_TOKEN');

    const config = loadConfig({
      NODE_ENV: 'production',
      MCP_TRANSPORT: 'http',
      MCP_TENANT_ID: 'tenant-a',
      RAEBURN_CHAIN_SERVICE_TOKEN: '0123456789abcdefghijklmnop'
    });
    expect(config.MCP_TENANT_ID).toBe('tenant-a');
  });
});

describe('tool policy', () => {
  it('requires review for write tools by default', () => {
    const config = loadConfig({});
    expect(evaluateToolPolicy(config, 'slack.post_message', 'write')).toMatchObject({
      allowed: true,
      approvalRequired: true
    });
  });

  it('blocks denied tools', () => {
    const config = loadConfig({ DENIED_TOOLS: 'github.create_issue' });
    expect(evaluateToolPolicy(config, 'github.create_issue', 'write').allowed).toBe(false);
  });
});
