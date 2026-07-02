import { z } from 'zod';

const csv = z
  .string()
  .optional()
  .default('')
  .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MCP_TRANSPORT: z.enum(['stdio']).default('stdio'),
  ENABLED_CONNECTORS: csv,
  ALLOWED_TOOLS: csv,
  DENIED_TOOLS: csv,
  REQUIRE_APPROVAL_FOR_WRITES: z.coerce.boolean().default(true),
  AUDIT_LOG_ENABLED: z.coerce.boolean().default(true),
  AUDIT_LOG_REDACT_SECRETS: z.coerce.boolean().default(true),
  MAX_TOOL_RESULT_BYTES: z.coerce.number().int().min(1024).max(1_000_000).default(250_000),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  SALESFORCE_INSTANCE_URL: z.string().url().optional(),
  SALESFORCE_ACCESS_TOKEN: z.string().optional(),
  HUBSPOT_ACCESS_TOKEN: z.string().optional(),
  NOTION_TOKEN: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ALLOWED_TABLES: csv
});

export type AppConfig = z.infer<typeof EnvSchema>;
export type ConnectorName =
  | 'gmail'
  | 'calendar'
  | 'github'
  | 'slack'
  | 'sharepoint'
  | 'salesforce'
  | 'hubspot'
  | 'notion'
  | 'google-drive'
  | 'supabase';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = EnvSchema.parse(env);
  if (config.NODE_ENV === 'production' && !config.REQUIRE_APPROVAL_FOR_WRITES) {
    throw new Error('REQUIRE_APPROVAL_FOR_WRITES must stay true in production unless a reviewed release explicitly changes this guardrail.');
  }
  return config;
}

export function isConnectorEnabled(config: AppConfig, connector: ConnectorName): boolean {
  if (config.ENABLED_CONNECTORS.length === 0) return true;
  return config.ENABLED_CONNECTORS.includes(connector);
}
