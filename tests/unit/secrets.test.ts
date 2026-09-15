import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveSecretEnvironment } from '../../src/security/secrets.js';

const tempDirectories: string[] = [];

function secretFile(value: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'raeburn-mcp-secret-'));
  tempDirectories.push(directory);
  const filePath = join(directory, 'secret');
  writeFileSync(filePath, value, { mode: 0o600 });
  return filePath;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('external secret references', () => {
  it('keeps direct environment credentials available outside production', () => {
    const result = resolveSecretEnvironment({ GOOGLE_CLIENT_SECRET: 'development-secret' });
    expect(result.env.GOOGLE_CLIENT_SECRET).toBe('development-secret');
    expect(result.sources.GOOGLE_CLIENT_SECRET).toBe('environment');
  });

  it('fails closed on raw production credentials', () => {
    expect(() =>
      resolveSecretEnvironment({
        NODE_ENV: 'production',
        GOOGLE_CLIENT_SECRET: 'raw-production-secret'
      })
    ).toThrow('GOOGLE_CLIENT_SECRET cannot contain a raw production credential');
  });

  it('loads production credentials from absolute mounted files and removes one trailing newline', () => {
    const filePath = secretFile('mounted-secret-value\n');
    const result = resolveSecretEnvironment({
      NODE_ENV: 'production',
      GOOGLE_CLIENT_SECRET_FILE: filePath
    });

    expect(result.env.GOOGLE_CLIENT_SECRET).toBe('mounted-secret-value');
    expect(result.sources.GOOGLE_CLIENT_SECRET).toBe('file');
  });

  it('rejects ambiguous direct and file-backed configuration', () => {
    const filePath = secretFile('mounted-secret-value');
    expect(() =>
      resolveSecretEnvironment({
        GOOGLE_CLIENT_SECRET: 'direct-secret',
        GOOGLE_CLIENT_SECRET_FILE: filePath
      })
    ).toThrow('never both');
  });

  it('requires absolute secret-file references in production', () => {
    expect(() =>
      resolveSecretEnvironment({
        NODE_ENV: 'production',
        GOOGLE_CLIENT_SECRET_FILE: './relative-secret'
      })
    ).toThrow('absolute path');
  });

  it('rejects missing, empty and oversized secret files', () => {
    expect(() =>
      resolveSecretEnvironment({
        NODE_ENV: 'production',
        GOOGLE_CLIENT_SECRET_FILE: '/definitely/missing/raeburn-secret'
      })
    ).toThrow('could not be read');

    const empty = secretFile('');
    expect(() => resolveSecretEnvironment({ NODE_ENV: 'production', GOOGLE_CLIENT_SECRET_FILE: empty })).toThrow(
      'empty secret'
    );

    const oversized = secretFile('x'.repeat(64 * 1024 + 1));
    expect(() => resolveSecretEnvironment({ NODE_ENV: 'production', GOOGLE_CLIENT_SECRET_FILE: oversized })).toThrow(
      '64 KiB'
    );
  });
});
