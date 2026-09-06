import { describe, expect, it } from 'vitest';
import { evaluateToolPolicy, limitToolResult, maskSecrets } from '../../src/security/policy.js';
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

  it('redacts nested credential fields', () => {
    expect(maskSecrets({ nested: { credential: 'abc', safe: 'value' } })).toEqual({
      nested: { credential: '[redacted]', safe: 'value' }
    });
  });

  it('truncates oversized tool results', () => {
    expect(limitToolResult('abcdef', 3)).toContain('truncated');
  });
});
