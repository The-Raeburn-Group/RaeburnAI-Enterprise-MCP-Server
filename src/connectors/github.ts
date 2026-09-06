import { Octokit } from '@octokit/rest';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { EnterpriseConnector, EnterpriseTool } from './types.js';
import { tool } from './types.js';

type GitHubResponseHeaders = Record<string, string | undefined>;

const BROAD_CLASSIC_REPOSITORY_SCOPES = new Set([
  'repo',
  'public_repo',
  'write:org',
  'admin:org',
  'delete_repo',
  'workflow'
]);

function makeGitHubClient(token: string) {
  return new Octokit({ auth: token });
}

export function normalizeGitHubRepository(owner: string, repo: string): string {
  return `${owner.trim()}/${repo.trim()}`.toLowerCase();
}

export function isGitHubRepositoryAllowed(repositories: string[], owner: string, repo: string): boolean {
  if (repositories.length === 0) return true;
  return repositories.includes(normalizeGitHubRepository(owner, repo));
}

export function assertGitHubRepositoryAllowed(
  repositories: string[],
  owner: string,
  repo: string,
  capability: 'read' | 'write'
): void {
  const fullName = normalizeGitHubRepository(owner, repo);
  if (!isGitHubRepositoryAllowed(repositories, owner, repo)) {
    throw new Error(`GitHub ${capability} access to ${fullName} is outside the configured repository allowlist.`);
  }
}

export function assertGitHubClassicScopePosture(
  headers: GitHubResponseHeaders,
  config: AppConfig,
  capability: 'read' | 'write'
): void {
  if (config.NODE_ENV !== 'production') return;

  const rawScopes = headers['x-oauth-scopes'];
  if (!rawScopes) return;

  const scopes = rawScopes
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
  const broadScopes = scopes.filter((scope) => BROAD_CLASSIC_REPOSITORY_SCOPES.has(scope));
  if (broadScopes.length > 0) {
    throw new Error(
      `GitHub ${capability} credential exposes broad classic OAuth/PAT scopes (${broadScopes.join(', ')}). ` +
        'Use a fine-grained personal access token or GitHub App installation token restricted to the configured repositories.'
    );
  }
}

export function resolveGitHubReadToken(config: AppConfig): string {
  const token = config.GITHUB_READ_TOKEN ?? (config.NODE_ENV === 'production' ? undefined : config.GITHUB_TOKEN);
  if (!token) {
    throw new Error(
      config.NODE_ENV === 'production'
        ? 'GITHUB_READ_TOKEN is not configured.'
        : 'GITHUB_READ_TOKEN or development-only GITHUB_TOKEN is not configured.'
    );
  }
  return token;
}

export function resolveGitHubWriteToken(config: AppConfig): string {
  if (!config.GITHUB_ENABLE_WRITES) {
    throw new Error(
      'GitHub write tools are disabled. Set GITHUB_ENABLE_WRITES=true only after approval controls are validated.'
    );
  }
  if (!config.GITHUB_WRITE_TOKEN) throw new Error('GITHUB_WRITE_TOKEN is not configured.');
  return config.GITHUB_WRITE_TOKEN;
}

function filterAllowedRepositoryResults<T extends { full_name: string }>(repositories: string[], items: T[]): T[] {
  if (repositories.length === 0) return items;
  const allowed = new Set(repositories);
  return items.filter((item) => allowed.has(item.full_name.toLowerCase()));
}

async function preflightRepository(
  client: Octokit,
  config: AppConfig,
  owner: string,
  repo: string,
  capability: 'read' | 'write'
) {
  const response = await client.repos.get({ owner, repo });
  assertGitHubClassicScopePosture(response.headers as GitHubResponseHeaders, config, capability);
  if (capability === 'read' && response.data.permissions?.pull === false) {
    throw new Error(
      `Configured GitHub read credential does not have pull access to ${normalizeGitHubRepository(owner, repo)}.`
    );
  }
  return response;
}

export const githubConnector: EnterpriseConnector = {
  name: 'github',
  displayName: 'GitHub',
  description: 'Allowlisted repository, issue and pull request operations for engineering assistants.',
  configured: (config) =>
    Boolean(config.GITHUB_READ_TOKEN ?? (config.NODE_ENV === 'production' ? undefined : config.GITHUB_TOKEN)),
  tools: (context) => {
    const tools: EnterpriseTool[] = [
      tool({
        name: 'github.search_repositories',
        connector: 'github',
        risk: 'read',
        description: 'Search only repositories inside the configured GitHub read allowlist.',
        inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).default(10) }),
        async run(input, { config }) {
          const client = makeGitHubClient(resolveGitHubReadToken(config));
          const result = await client.search.repos({ q: input.query, per_page: input.limit });
          assertGitHubClassicScopePosture(result.headers as GitHubResponseHeaders, config, 'read');
          return filterAllowedRepositoryResults(config.GITHUB_ALLOWED_REPOSITORIES, result.data.items).map((repo) => ({
            fullName: repo.full_name,
            description: repo.description,
            url: repo.html_url,
            stars: repo.stargazers_count
          }));
        }
      }),
      tool({
        name: 'github.list_issues',
        connector: 'github',
        risk: 'read',
        description: 'List issues for an explicitly allowlisted repository.',
        inputSchema: z.object({
          owner: z.string().min(1),
          repo: z.string().min(1),
          state: z.enum(['open', 'closed', 'all']).default('open')
        }),
        async run(input, { config }) {
          assertGitHubRepositoryAllowed(config.GITHUB_ALLOWED_REPOSITORIES, input.owner, input.repo, 'read');
          const client = makeGitHubClient(resolveGitHubReadToken(config));
          await preflightRepository(client, config, input.owner, input.repo, 'read');
          const result = await client.issues.listForRepo({
            owner: input.owner,
            repo: input.repo,
            state: input.state,
            per_page: 50
          });
          assertGitHubClassicScopePosture(result.headers as GitHubResponseHeaders, config, 'read');
          return result.data.map((issue) => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            url: issue.html_url
          }));
        }
      })
    ];

    if (context.config.GITHUB_ENABLE_WRITES) {
      tools.push(
        tool({
          name: 'github.create_issue',
          connector: 'github',
          risk: 'write',
          description: 'Create an issue in an explicitly write-allowlisted repository after Chain approval.',
          inputSchema: z.object({
            owner: z.string().min(1),
            repo: z.string().min(1),
            title: z.string().min(1).max(256),
            body: z.string().max(65_536).optional()
          }),
          async run(input, { config }) {
            assertGitHubRepositoryAllowed(config.GITHUB_WRITE_ALLOWED_REPOSITORIES, input.owner, input.repo, 'write');
            const client = makeGitHubClient(resolveGitHubWriteToken(config));
            await preflightRepository(client, config, input.owner, input.repo, 'write');
            const result = await client.issues.create({
              owner: input.owner,
              repo: input.repo,
              title: input.title,
              body: input.body
            });
            assertGitHubClassicScopePosture(result.headers as GitHubResponseHeaders, config, 'write');
            return {
              number: result.data.number,
              title: result.data.title,
              state: result.data.state,
              url: result.data.html_url
            };
          }
        })
      );
    }

    return tools;
  }
};
