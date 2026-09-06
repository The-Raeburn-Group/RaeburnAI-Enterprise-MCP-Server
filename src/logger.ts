import { pino } from 'pino';
import type { AppConfig } from './config.js';

export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL' | 'NODE_ENV'>) {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_REFRESH_TOKEN',
        'GITHUB_TOKEN',
        'SLACK_BOT_TOKEN',
        'MICROSOFT_CLIENT_SECRET',
        'SALESFORCE_ACCESS_TOKEN',
        'HUBSPOT_ACCESS_TOKEN',
        'NOTION_TOKEN',
        'SUPABASE_SERVICE_ROLE_KEY',
        '*.authorization',
        '*.access_token',
        '*.refresh_token',
        '*.token',
        '*.password',
        '*.secret'
      ],
      censor: '[redacted]'
    },
    ...(config.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard' }
          }
        }
      : {})
  });
}

export type Logger = ReturnType<typeof createLogger>;
