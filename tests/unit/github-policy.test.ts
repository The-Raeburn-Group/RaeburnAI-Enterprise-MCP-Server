import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import {
  assertGitHubClassicScopePosture,
  assertGitHubRepositoryAllowed,
  githubConnector,
  isGitHubRepositoryAllowed,
  normalizeGitHubRepository,
  resolveGitHubReadToken,
  resolveGitHubWriteToken
} from '../../src/connectors/github.js';
import type { ConnectorContext } from '../../src/connectors/types.js';

function contextFor(env: NodeJS.ProcessEnv): ConnectorContext {
  return {
    config: loadConfig(env),
    logger: {} as ConnectorContext['logger'],
    identity: {
      tenantId: 'tenant-a',
      actorId: 'actor-a',
      requestId: 'request-a',
      source: 'chain-http'
    }
  };
}

describe('GitHub repository boundaries', () => {
  it('normalizes repository names and matches allowlists case-insensitively', () => {
    expect(normalizeGitHubRepository('The-Raeburn-Group', 'RaeburnAI-AgentOS')).toBe(
      'the-raeburn-group/raeburnai-agentos'
    );
    expect(
      isGitHubRepositoryAllowed(
        ['the-raeburn-group/raeburnai-agentos'],
        'THE-RAEBURN-GROUP',
        'RAEBURNAI-AGENTOS'
      )
    ).toBe(true);
  });

  it('rejects repositories outside the exact allowlist rather than accepting prefix lookalikes', () => {
    expect(
      isGitHubRepositoryAllowed(
        ['the-raeburn-group/raeburnai-agentos'],
        'the-raeburn-group',
        'raeburnai-agentos-evil'
      )
    ).toBe(false);
    expect(() =>
      assertGitHubRepositoryAllowed(
        ['the-raeburn-group/raeburnai-agentos'],
        'the-raeburn-group',
        'raeburnai-agentos-evil',
        'read'
      )
    ).toThrow('outside the configured repository allowlist');
  });
});

describe('GitHub credential posture', () => {
  it('keeps the legacy token available only outside production', () => {
    const development = loadConfig({ GITHUB_TOKEN: 'legacy-development-token' });
    expect(resolveGitHubReadToken(development)).toBe('legacy-development-token');

    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        MCP_TENANT_ID: 'tenant-a',
        GITHUB_TOKEN: 'legacy-production-token'
      })
    ).toThrow('development-only compatibility setting');
  });

  it('requires a production repository allowlist for the read credential', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        MCP_TENANT_ID: 'tenant-a',
        GITHUB_READ_TOKEN: 'fine-grained-read-token'
      })
    ).toThrow('GITHUB_ALLOWED_REPOSITORIES');
  });

  it('requires an independent write credential and write allowlist when writes are enabled', () => {
    expect(() =>
      loadConfig({
        GITHUB_ENABLE_WRITES: 'true',
        GITHUB_ALLOWED_REPOSITORIES: 'raebu/repo-a'
      })
    ).toThrow('GITHUB_WRITE_TOKEN');

    expect(() =>
      loadConfig({
        GITHUB_ENABLE_WRITES: 'true',
        GITHUB_WRITE_TOKEN: 'write-token',
        GITHUB_ALLOWED_REPOSITORIES: 'raebu/repo-a'
      })
    ).toThrow('GITHUB_WRITE_ALLOWED_REPOSITORIES');
  });

  it('requires every write repository to stay inside the read boundary', () => {
    expect(() =>
      loadConfig({
        GITHUB_ENABLE_WRITES: 'true',
        GITHUB_WRITE_TOKEN: 'write-token',
        GITHUB_ALLOWED_REPOSITORIES: 'raebu/repo-a',
        GITHUB_WRITE_ALLOWED_REPOSITORIES: 'raebu/repo-b'
      })
    ).toThrow('must also be present in GITHUB_ALLOWED_REPOSITORIES');
  });

  it('rejects broad classic repository scopes in production but accepts fine-grained/App-style empty scope headers', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      MCP_TENANT_ID: 'tenant-a',
      GITHUB_READ_TOKEN: 'fine-grained-read-token',
      GITHUB_ALLOWED_REPOSITORIES: 'raebu/repo-a'
    });

    expect(() =>
      assertGitHubClassicScopePosture({ 'x-oauth-scopes': 'repo, read:user' }, config, 'read')
    ).toThrow('broad classic OAuth/PAT scopes');
    expect(() => assertGitHubClassicScopePosture({}, config, 'read')).not.toThrow();
  });
});

describe('GitHub tool exposure', () => {
  it('does not expose write tools until writes are explicitly enabled', () => {
    const context = contextFor({
      GITHUB_READ_TOKEN: 'read-token',
      GITHUB_ALLOWED_REPOSITORIES: 'raebu/repo-a'
    });
    expect(githubConnector.tools(context).map((item) => item.name)).not.toContain('github.create_issue');
    expect(() => resolveGitHubWriteToken(context.config)).toThrow('GitHub write tools are disabled');
  });

  it('exposes the write tool only with a separate write credential and write allowlist', () => {
    const context = contextFor({
      GITHUB_READ_TOKEN: 'read-token',
      GITHUB_ALLOWED_REPOSITORIES: 'raebu/repo-a',
      GITHUB_ENABLE_WRITES: 'true',
      GITHUB_WRITE_TOKEN: 'write-token',
      GITHUB_WRITE_ALLOWED_REPOSITORIES: 'raebu/repo-a'
    });
    expect(githubConnector.tools(context).map((item) => item.name)).toContain('github.create_issue');
    expect(resolveGitHubWriteToken(context.config)).toBe('write-token');
  });
});
