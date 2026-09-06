import { z } from 'zod';

const csv = z
  .string()
  .optional()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );

const repositoryCsv = z
  .string()
  .optional()
  .default('')
  .transform((value) =>
    Array.from(
      new Set(
        value
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      )
    )
  )
  .refine(
    (repositories) => repositories.every((repository) => /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repository)),
    'GitHub repository allowlists must contain owner/repository entries.'
  );

const optionalNonEmpty = z
  .string()
  .optional()
  .transform((value) => {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  });

function booleanFromEnv(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value === undefined) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return value;

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return value;
  }, z.boolean());
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MCP_TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  MCP_TENANT_ID: optionalNonEmpty,
  MCP_HTTP_HOST: z.string().default('0.0.0.0'),
  MCP_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  RAEBURN_CHAIN_SERVICE_TOKEN: optionalNonEmpty,
  ENABLED_CONNECTORS: csv,
  ALLOWED_TOOLS: csv,
  DENIED_TOOLS: csv,
  REQUIRE_APPROVAL_FOR_WRITES: booleanFromEnv(true),
  AUDIT_LOG_ENABLED: booleanFromEnv(true),
  AUDIT_LOG_REDACT_SECRETS: booleanFromEnv(true),
  MAX_TOOL_RESULT_BYTES: z.coerce.number().int().min(1024).max(1_000_000).default(250_000),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GITHUB_TOKEN: optionalNonEmpty,
  GITHUB_READ_TOKEN: optionalNonEmpty,
  GITHUB_WRITE_TOKEN: optionalNonEmpty,
  GITHUB_ALLOWED_REPOSITORIES: repositoryCsv,
  GITHUB_WRITE_ALLOWED_REPOSITORIES: repositoryCsv,
  GITHUB_ENABLE_WRITES: booleanFromEnv(false),
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
    throw new Error(
      'REQUIRE_APPROVAL_FOR_WRITES must stay true in production unless a reviewed release explicitly changes this guardrail.'
    );
  }
  if (config.NODE_ENV === 'production' && !config.AUDIT_LOG_REDACT_SECRETS) {
    throw new Error('AUDIT_LOG_REDACT_SECRETS must stay true in production to prevent connector secret leakage.');
  }
  if (config.NODE_ENV === 'production' && !config.MCP_TENANT_ID) {
    throw new Error(
      'MCP_TENANT_ID is required in production so connector credentials cannot be shared across unspecified tenants.'
    );
  }
  if (
    config.NODE_ENV === 'production' &&
    config.MCP_TRANSPORT === 'http' &&
    (!config.RAEBURN_CHAIN_SERVICE_TOKEN || config.RAEBURN_CHAIN_SERVICE_TOKEN.length < 24)
  ) {
    throw new Error('RAEBURN_CHAIN_SERVICE_TOKEN of at least 24 characters is required for production HTTP transport.');
  }

  if (config.NODE_ENV === 'production' && config.GITHUB_TOKEN) {
    throw new Error(
      'GITHUB_TOKEN is a development-only compatibility setting. Use GITHUB_READ_TOKEN and a fine-grained token or GitHub App installation token in production.'
    );
  }
  if (config.NODE_ENV === 'production' && config.GITHUB_READ_TOKEN && config.GITHUB_ALLOWED_REPOSITORIES.length === 0) {
    throw new Error('GITHUB_ALLOWED_REPOSITORIES is required when GitHub read access is configured in production.');
  }
  if (config.GITHUB_ENABLE_WRITES && !(config.GITHUB_READ_TOKEN ?? config.GITHUB_TOKEN)) {
    throw new Error('A GitHub read credential is required before write tools can be enabled.');
  }
  if (config.GITHUB_ENABLE_WRITES && !config.GITHUB_WRITE_TOKEN) {
    throw new Error('GITHUB_WRITE_TOKEN is required when GITHUB_ENABLE_WRITES=true.');
  }
  if (config.GITHUB_ENABLE_WRITES && config.GITHUB_WRITE_ALLOWED_REPOSITORIES.length === 0) {
    throw new Error('GITHUB_WRITE_ALLOWED_REPOSITORIES is required when GitHub writes are enabled.');
  }
  if (config.NODE_ENV === 'production' && config.GITHUB_WRITE_TOKEN && !config.GITHUB_ENABLE_WRITES) {
    throw new Error('Remove GITHUB_WRITE_TOKEN or explicitly set GITHUB_ENABLE_WRITES=true in production.');
  }
  const readRepositories = new Set(config.GITHUB_ALLOWED_REPOSITORIES);
  const writeOutsideReadBoundary = config.GITHUB_WRITE_ALLOWED_REPOSITORIES.filter(
    (repository) => !readRepositories.has(repository)
  );
  if (writeOutsideReadBoundary.length > 0) {
    throw new Error(
      `Every GITHUB_WRITE_ALLOWED_REPOSITORIES entry must also be present in GITHUB_ALLOWED_REPOSITORIES: ${writeOutsideReadBoundary.join(', ')}`
    );
  }
  return config;
}

export function isConnectorEnabled(config: AppConfig, connector: ConnectorName): boolean {
  if (config.ENABLED_CONNECTORS.length === 0) return true;
  return config.ENABLED_CONNECTORS.includes(connector);
}
