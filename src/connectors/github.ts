import { Octokit } from '@octokit/rest';
import { z } from 'zod';
import type { EnterpriseConnector } from './types.js';
import { tool } from './types.js';

function makeGitHubClient(token: string) {
  return new Octokit({ auth: token });
}

export const githubConnector: EnterpriseConnector = {
  name: 'github',
  displayName: 'GitHub',
  description: 'Repository, issue and pull request operations for engineering assistants.',
  configured: (config) => Boolean(config.GITHUB_TOKEN),
  tools: () => [
    tool({
      name: 'github.search_repositories',
      connector: 'github',
      risk: 'read',
      description: 'Search repositories visible to the configured GitHub token.',
      inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).default(10) }),
      async run(input, { config }) {
        const token = config.GITHUB_TOKEN;
        if (!token) throw new Error('GITHUB_TOKEN is not configured');
        const result = await makeGitHubClient(token).search.repos({ q: input.query, per_page: input.limit });
        return result.data.items.map((repo) => ({ fullName: repo.full_name, description: repo.description, url: repo.html_url, stars: repo.stargazers_count }));
      }
    }),
    tool({
      name: 'github.list_issues',
      connector: 'github',
      risk: 'read',
      description: 'List issues for a repository.',
      inputSchema: z.object({ owner: z.string(), repo: z.string(), state: z.enum(['open', 'closed', 'all']).default('open') }),
      async run(input, { config }) {
        const token = config.GITHUB_TOKEN;
        if (!token) throw new Error('GITHUB_TOKEN is not configured');
        const result = await makeGitHubClient(token).issues.listForRepo({ owner: input.owner, repo: input.repo, state: input.state, per_page: 50 });
        return result.data.map((issue) => ({ number: issue.number, title: issue.title, state: issue.state, url: issue.html_url }));
      }
    })
  ]
};
