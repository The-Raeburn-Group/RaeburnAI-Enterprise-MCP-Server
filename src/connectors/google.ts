import { google } from 'googleapis';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import {
  GOOGLE_CALENDAR_READ_SCOPE,
  GOOGLE_DRIVE_METADATA_READ_SCOPE,
  GOOGLE_GMAIL_READ_SCOPE,
  verifyGoogleOAuthScopes
} from '../security/google-oauth.js';
import type { EnterpriseConnector } from './types.js';
import { tool } from './types.js';

async function googleAuth(config: AppConfig, requiredScopes: string[]) {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google OAuth credentials are not configured');
  }
  const oauth2 = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });
  await verifyGoogleOAuthScopes(oauth2, requiredScopes);
  return oauth2;
}

export const gmailConnector: EnterpriseConnector = {
  name: 'gmail',
  displayName: 'Gmail',
  description: 'Search and read Gmail messages with write actions guarded by approval.',
  configured: (config) =>
    Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REFRESH_TOKEN),
  tools: () => [
    tool({
      name: 'gmail.search_messages',
      connector: 'gmail',
      risk: 'read',
      description: 'Search Gmail messages using Gmail search syntax.',
      inputSchema: z.object({
        query: z.string().min(1).max(500).default('in:inbox'),
        limit: z.number().int().min(1).max(25).default(10)
      }),
      async run(input, { config }) {
        const gmail = google.gmail({
          version: 'v1',
          auth: await googleAuth(config, [GOOGLE_GMAIL_READ_SCOPE])
        });
        const result = await gmail.users.messages.list({ userId: 'me', q: input.query, maxResults: input.limit });
        return result.data.messages ?? [];
      }
    }),
    tool({
      name: 'gmail.get_message',
      connector: 'gmail',
      risk: 'read',
      description: 'Read safe Gmail message metadata by id.',
      inputSchema: z.object({ messageId: z.string().min(1).max(200) }),
      async run(input, { config }) {
        const gmail = google.gmail({
          version: 'v1',
          auth: await googleAuth(config, [GOOGLE_GMAIL_READ_SCOPE])
        });
        const result = await gmail.users.messages.get({ userId: 'me', id: input.messageId, format: 'metadata' });
        return result.data;
      }
    })
  ]
};

export const calendarConnector: EnterpriseConnector = {
  name: 'calendar',
  displayName: 'Google Calendar',
  description: 'Read calendar events and create approved scheduling actions.',
  configured: (config) => gmailConnector.configured(config),
  tools: () => [
    tool({
      name: 'calendar.list_events',
      connector: 'calendar',
      risk: 'read',
      description: 'List upcoming calendar events.',
      inputSchema: z.object({
        calendarId: z.string().min(1).max(200).default('primary'),
        limit: z.number().int().min(1).max(50).default(10)
      }),
      async run(input, { config }) {
        const calendar = google.calendar({
          version: 'v3',
          auth: await googleAuth(config, [GOOGLE_CALENDAR_READ_SCOPE])
        });
        const result = await calendar.events.list({
          calendarId: input.calendarId,
          maxResults: input.limit,
          singleEvents: true,
          orderBy: 'startTime',
          timeMin: new Date().toISOString()
        });
        return result.data.items ?? [];
      }
    })
  ]
};

export const googleDriveConnector: EnterpriseConnector = {
  name: 'google-drive',
  displayName: 'Google Drive',
  description: 'Search Google Drive and retrieve file metadata for knowledge workflows.',
  configured: (config) => gmailConnector.configured(config),
  tools: () => [
    tool({
      name: 'google_drive.search_files',
      connector: 'google-drive',
      risk: 'read',
      description: 'Search Google Drive file metadata.',
      inputSchema: z.object({ query: z.string().min(1).max(100), limit: z.number().int().min(1).max(50).default(10) }),
      async run(input, { config }) {
        const drive = google.drive({
          version: 'v3',
          auth: await googleAuth(config, [GOOGLE_DRIVE_METADATA_READ_SCOPE])
        });
        const safeQuery = input.query.replaceAll("'", "\\'");
        const result = await drive.files.list({
          q: `name contains '${safeQuery}' and trashed=false`,
          pageSize: input.limit,
          fields: 'files(id,name,mimeType,webViewLink,modifiedTime)'
        });
        return result.data.files ?? [];
      }
    })
  ]
};
