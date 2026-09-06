import { describe, expect, it } from 'vitest';
import { allTools, configuredConnectors, enabledConnectors } from '../../src/connectors/index.js';
import { loadConfig } from '../../src/config.js';
import { createLogger } from '../../src/logger.js';

function context(env: Record<string, string>) {
  const config = loadConfig(env);
  return {
    config,
    logger: createLogger({ ...config, LOG_LEVEL: 'silent' }),
    identity: {
      tenantId: 'tenant-test',
      actorId: 'test-runner',
      requestId: 'connector-test',
      source: 'stdio' as const
    }
  };
}

describe('connector registry', () => {
  it('shows enabled connectors even before credentials are configured', () => {
    const ctx = context({ ENABLED_CONNECTORS: 'github,slack' });
    expect(enabledConnectors(ctx).map((connector) => connector.name)).toEqual(['github', 'slack']);
  });

  it('only registers tools for configured connectors', () => {
    const ctx = context({ ENABLED_CONNECTORS: 'github', GITHUB_TOKEN: 'test-token' });
    expect(configuredConnectors(ctx).map((connector) => connector.name)).toEqual(['github']);
    expect(allTools(ctx).map((tool) => tool.name)).toContain('github.list_issues');
  });
});
