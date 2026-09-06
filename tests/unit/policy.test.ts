import { describe, expect, it } from 'vitest';
import {
  evaluateToolPolicy,
  limitToolResult,
  maskSecrets,
  redactSecretText,
  sanitizeToolOutput
} from '../../src/security/policy.js';
import { loadConfig } from '../../src/config.js';

describe('tool policy', () => {
  it('requires review for risky tools by default', () => {
    const config = loadConfig({});
    expect(evaluateToolPolicy(config, 'slack.post_message', 'write')).toMatchObject({
      allowed: true,
      approvalRequired: true
    });
  });

  it('supports wildcard allow lists', () => {
    const config = loadConfig({ ALLOWED_TOOLS: 'github.*' });
    expect(evaluateToolPolicy(config, 'github.list_issues', 'read').allowed).toBe(true);
    expect(evaluateToolPolicy(config, 'slack.search_messages', 'read').allowed).toBe(false);
  });

  it('redacts nested credential fields without masking unrelated key substrings', () => {
    expect(
      maskSecrets({
        nested: { credential: 'abc', safe: 'value' },
        monkey: 'visible',
        apiKey: 'secret-value'
      })
    ).toEqual({
      nested: { credential: '[redacted]', safe: 'value' },
      monkey: 'visible',
      apiKey: '[redacted]'
    });
  });

  it('redacts secret-like values embedded in ordinary text', () => {
    const text = [
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      'github_pat_abcdefghijklmnopqrstuvwxyz123456',
      'password=hunter2-secret'
    ].join('\n');
    const redacted = redactSecretText(text);

    expect(redacted).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('hunter2-secret');
    expect(redacted).toContain('[redacted]');
  });

  it('truncates oversized tool results to the actual UTF-8 byte budget', () => {
    const limited = limitToolResult('🙂'.repeat(20), 20);
    expect(Buffer.byteLength(limited, 'utf8')).toBeLessThanOrEqual(20);
    expect(limited).toContain('trunc');
    expect(limited).not.toContain('\uFFFD');
  });

  it('sanitizes structured outputs and wraps oversized results without returning raw data', () => {
    const result = sanitizeToolOutput(
      {
        apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz',
        message: 'Bearer abcdefghijklmnopqrstuvwxyz',
        payload: 'x'.repeat(5000)
      },
      1024
    );

    expect(result.truncated).toBe(true);
    expect(result.originalBytes).toBeGreaterThan(1024);
    expect(result.returnedBytes).toBeLessThanOrEqual(1024);
    expect(result.text).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(result.output).toMatchObject({ truncated: true });
    expect(JSON.stringify(result.output)).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz');
  });
});
