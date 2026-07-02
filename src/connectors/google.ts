import { google } from 'googleapis';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { EnterpriseConnector } from './types.js';
import { tool } from './types.js';

function googleAuth(config: AppConfig) {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google OAuth credentials are not configured');
  }
  const oauth2 = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

export const gmailConnector: EnterpriseConnector = {
  name: 'gmail',
  displayName: 'Gmail',
  description: 'Search and read Gmail messages with write actions guarded by approval.',
  configured: (config) => Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REFRESH_TOKEN),
  tools: () => [
    tool({
      name: 'gmail.search_messages',
      connector: 'gmail',
      risk: 'read',
      description: 'Search Gmail messages using Gmail search syntax.',
      inputSchema: z.object({ query: z.string().default('in:inbox'), limit: z.number().int().min(1).max(25).default(10) }),
      async run(input, { config }) {
        const gmail = google.gmail({ version: 'v1', auth: googleAuth(config) });
        const result = await gmail.users.messages.list({ userId: 'me', q: input.query, maxResults: input.limit });
        return result.data.messages ?? [];
      }
    }),
    tool({
      name: 'gmail.get_message',
      connector: 'gmail',
      risk: 'read',
      description: 'Read a Gmail message by id.',
      inputSchema: z.object({ messageId: z.string().min(1) }),
      async run(input, { config }) {
        const gmail = google.gmail({ version: 'v1', auth: googleAuth(config) });
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
      inputSchema: z.object({ calendarId: z.string().default('primary'), limit: z.number().int().min(1).max(50).default(10) }),
      async run(input, { config }) {
        const calendar = google.calendar({ version: 'v3', auth: googleAuth(config) });
        const result = await calendar.events.list({ calendarId: input.calendarId, maxResults: input.limit, singleEvents: true, orderBy: 'startTime', timeMin: new Date().toISOString() });
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
      description: 'Search Google Drive files.',
      inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).default(10) }),
      async run(input, { config }) {
        const drive = google.drive({ version: 'v3', auth: googleAuth(config) });
        const result = await drive.files.list({ q: `name contains '${input.query.replaceAll("'", "\\'")}' and trashed=false`, pageSize: input.limit, fields: 'files(id,name,mimeType,webViewLink,modifiedTime)' });
        return result.data.files ?? [];
      }
    })
  ]
};
