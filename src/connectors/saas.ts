import { Client as NotionClient } from '@notionhq/client';
import { WebClient } from '@slack/web-api';
import { createClient } from '@supabase/supabase-js';
import jsforce from 'jsforce';
import { request } from 'undici';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { EnterpriseConnector } from './types.js';
import { tool } from './types.js';

function bearerHeaders(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

async function microsoftGraph(config: AppConfig, path: string) {
  if (!config.MICROSOFT_TENANT_ID || !config.MICROSOFT_CLIENT_ID || !config.MICROSOFT_CLIENT_SECRET) {
    throw new Error('Microsoft Graph app credentials are not configured');
  }
  const tokenResponse = await request(`https://login.microsoftonline.com/${config.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.MICROSOFT_CLIENT_ID,
      client_secret: config.MICROSOFT_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' }
  });
  const tokenBody = (await tokenResponse.body.json()) as { access_token?: string };
  if (!tokenBody.access_token) throw new Error('Unable to obtain Microsoft Graph access token');
  const graphResponse = await request(`https://graph.microsoft.com/v1.0${path}`, { headers: bearerHeaders(tokenBody.access_token) });
  return graphResponse.body.json();
}

export const slackConnector: EnterpriseConnector = {
  name: 'slack',
  displayName: 'Slack',
  description: 'Search channels and messages for operational assistants.',
  configured: (config) => Boolean(config.SLACK_BOT_TOKEN),
  tools: () => [
    tool({
      name: 'slack.search_messages',
      connector: 'slack',
      risk: 'read',
      description: 'Search Slack messages visible to the configured bot token.',
      inputSchema: z.object({ query: z.string().min(1), count: z.number().int().min(1).max(20).default(10) }),
      async run(input, { config }) {
        if (!config.SLACK_BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN is not configured');
        return new WebClient(config.SLACK_BOT_TOKEN).search.messages({ query: input.query, count: input.count });
      }
    }),
    tool({
      name: 'slack.post_message',
      connector: 'slack',
      risk: 'write',
      description: 'Post a Slack message after approval.',
      inputSchema: z.object({ channel: z.string().min(1), text: z.string().min(1).max(4000) }),
      async run(input, { config }) {
        if (!config.SLACK_BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN is not configured');
        return new WebClient(config.SLACK_BOT_TOKEN).chat.postMessage({ channel: input.channel, text: input.text });
      }
    })
  ]
};

export const sharePointConnector: EnterpriseConnector = {
  name: 'sharepoint',
  displayName: 'SharePoint',
  description: 'Search SharePoint sites and files through Microsoft Graph.',
  configured: (config) => Boolean(config.MICROSOFT_TENANT_ID && config.MICROSOFT_CLIENT_ID && config.MICROSOFT_CLIENT_SECRET),
  tools: () => [
    tool({
      name: 'sharepoint.search_sites',
      connector: 'sharepoint',
      risk: 'read',
      description: 'Search SharePoint sites.',
      inputSchema: z.object({ query: z.string().min(1) }),
      async run(input, { config }) {
        return microsoftGraph(config, `/sites?search=${encodeURIComponent(input.query)}`);
      }
    })
  ]
};

export const salesforceConnector: EnterpriseConnector = {
  name: 'salesforce',
  displayName: 'Salesforce',
  description: 'Query Salesforce records for CRM-aware assistants.',
  configured: (config) => Boolean(config.SALESFORCE_INSTANCE_URL && config.SALESFORCE_ACCESS_TOKEN),
  tools: () => [
    tool({
      name: 'salesforce.soql_query',
      connector: 'salesforce',
      risk: 'read',
      description: 'Run a read-only SOQL query. Use SELECT queries only.',
      inputSchema: z.object({ query: z.string().regex(/^\s*select\s/i, 'Only SELECT SOQL queries are allowed') }),
      async run(input, { config }) {
        const conn = new jsforce.Connection({ instanceUrl: config.SALESFORCE_INSTANCE_URL, accessToken: config.SALESFORCE_ACCESS_TOKEN });
        return conn.query(input.query);
      }
    })
  ]
};

export const hubSpotConnector: EnterpriseConnector = {
  name: 'hubspot',
  displayName: 'HubSpot',
  description: 'Search HubSpot contacts and companies.',
  configured: (config) => Boolean(config.HUBSPOT_ACCESS_TOKEN),
  tools: () => [
    tool({
      name: 'hubspot.search_contacts',
      connector: 'hubspot',
      risk: 'read',
      description: 'Search HubSpot contacts by query.',
      inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).default(10) }),
      async run(input, { config }) {
        if (!config.HUBSPOT_ACCESS_TOKEN) throw new Error('HUBSPOT_ACCESS_TOKEN is not configured');
        const response = await request('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST',
          headers: bearerHeaders(config.HUBSPOT_ACCESS_TOKEN),
          body: JSON.stringify({ query: input.query, limit: input.limit })
        });
        return response.body.json();
      }
    })
  ]
};

export const notionConnector: EnterpriseConnector = {
  name: 'notion',
  displayName: 'Notion',
  description: 'Search Notion pages and databases.',
  configured: (config) => Boolean(config.NOTION_TOKEN),
  tools: () => [
    tool({
      name: 'notion.search',
      connector: 'notion',
      risk: 'read',
      description: 'Search Notion workspace content visible to the integration.',
      inputSchema: z.object({ query: z.string().min(1), pageSize: z.number().int().min(1).max(50).default(10) }),
      async run(input, { config }) {
        if (!config.NOTION_TOKEN) throw new Error('NOTION_TOKEN is not configured');
        return new NotionClient({ auth: config.NOTION_TOKEN }).search({ query: input.query, page_size: input.pageSize });
      }
    })
  ]
};

export const supabaseConnector: EnterpriseConnector = {
  name: 'supabase',
  displayName: 'Supabase',
  description: 'Read Supabase tables through a guarded table API.',
  configured: (config) => Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY),
  tools: () => [
    tool({
      name: 'supabase.select',
      connector: 'supabase',
      risk: 'read',
      description: 'Select rows from an allowed Supabase table. Keep row limits low for AI context.',
      inputSchema: z.object({ table: z.string().regex(/^[a-zA-Z0-9_]+$/), limit: z.number().int().min(1).max(100).default(25) }),
      async run(input, { config }) {
        if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase credentials are not configured');
        const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
        const { data, error } = await supabase.from(input.table).select('*').limit(input.limit);
        if (error) throw error;
        return data;
      }
    })
  ]
};
