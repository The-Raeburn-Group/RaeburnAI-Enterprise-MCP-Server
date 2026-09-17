import { readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export const SECRET_ENV_NAMES = [
  'RAEBURN_CHAIN_SERVICE_TOKEN',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GITHUB_TOKEN',
  'GITHUB_READ_TOKEN',
  'GITHUB_WRITE_TOKEN',
  'SLACK_BOT_TOKEN',
  'MICROSOFT_CLIENT_SECRET',
  'SALESFORCE_ACCESS_TOKEN',
  'HUBSPOT_ACCESS_TOKEN',
  'NOTION_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY'
] as const;

export type SecretEnvName = (typeof SECRET_ENV_NAMES)[number];
export type SecretSource = 'environment' | 'file';

const MAX_SECRET_FILE_BYTES = 64 * 1024;

export interface SecretResolution {
  env: NodeJS.ProcessEnv;
  sources: Partial<Record<SecretEnvName, SecretSource>>;
}

function secretFileName(name: SecretEnvName): `${SecretEnvName}_FILE` {
  return `${name}_FILE`;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.length > 0 ? value : undefined;
}

function readSecretFile(name: SecretEnvName, filePath: string, production: boolean): string {
  if (production && !isAbsolute(filePath)) {
    throw new Error(`${secretFileName(name)} must use an absolute path in production.`);
  }

  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    throw new Error(`${secretFileName(name)} could not be read.`);
  }

  if (!stats.isFile()) {
    throw new Error(`${secretFileName(name)} must reference a regular file.`);
  }
  if (stats.size > MAX_SECRET_FILE_BYTES) {
    throw new Error(`${secretFileName(name)} exceeds the 64 KiB secret-size limit.`);
  }

  let value: string;
  try {
    value = readFileSync(filePath, 'utf8').replace(/\r?\n$/, '');
  } catch {
    throw new Error(`${secretFileName(name)} could not be read.`);
  }

  if (value.length === 0) {
    throw new Error(`${secretFileName(name)} resolved to an empty secret.`);
  }
  return value;
}

export function resolveSecretEnvironment(env: NodeJS.ProcessEnv): SecretResolution {
  const production = env.NODE_ENV === 'production';
  const resolved: NodeJS.ProcessEnv = { ...env };
  const sources: Partial<Record<SecretEnvName, SecretSource>> = {};

  for (const name of SECRET_ENV_NAMES) {
    const directValue = nonEmpty(env[name]);
    const fileVariable = secretFileName(name);
    const filePath = nonEmpty(env[fileVariable]);

    if (directValue && filePath) {
      throw new Error(`Configure either ${name} or ${fileVariable}, never both.`);
    }

    if (filePath) {
      resolved[name] = readSecretFile(name, filePath, production);
      sources[name] = 'file';
      continue;
    }

    if (directValue) {
      sources[name] = 'environment';
      // GITHUB_TOKEN has a more specific production rejection in config.ts so
      // operators retain the existing migration guidance. It is still rejected.
      if (production && name !== 'GITHUB_TOKEN') {
        throw new Error(
          `${name} cannot contain a raw production credential. Mount the secret from the selected secret manager and set ${fileVariable}.`
        );
      }
    }
  }

  return { env: resolved, sources };
}

export function secretSourceFor(sources: SecretResolution['sources'], name: SecretEnvName): SecretSource | undefined {
  return sources[name];
}
