import type { AppConfig } from '../config.js';

export type ToolRisk = 'read' | 'write' | 'admin';

export interface ToolPolicyDecision {
  allowed: boolean;
  approvalRequired: boolean;
  reason?: string;
}

export interface SanitizedToolResult {
  output: unknown;
  text: string;
  truncated: boolean;
  originalBytes: number;
  returnedBytes: number;
}

const SENSITIVE_KEY_PARTS = new Set([
  'authorization',
  'cookie',
  'credential',
  'credentials',
  'passwd',
  'password',
  'secret',
  'token'
]);

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bya29\.[A-Za-z0-9._-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
];

function matchesPattern(pattern: string, toolName: string): boolean {
  if (pattern === toolName) return true;
  if (pattern.endsWith('.*')) return toolName.startsWith(pattern.slice(0, -1));
  return false;
}

function listMatches(patterns: string[], toolName: string): boolean {
  return patterns.some((pattern) => matchesPattern(pattern, toolName));
}

function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase();
  const parts = normalized.split('_').filter(Boolean);
  if (parts.some((part) => SENSITIVE_KEY_PARTS.has(part))) return true;
  if (parts.includes('key')) {
    return (
      parts.length === 1 ||
      parts.some((part) => ['access', 'api', 'client', 'private', 'service', 'signing'].includes(part))
    );
  }
  return false;
}

function utf8Prefix(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

export function evaluateToolPolicy(config: AppConfig, toolName: string, risk: ToolRisk): ToolPolicyDecision {
  if (listMatches(config.DENIED_TOOLS, toolName)) {
    return { allowed: false, approvalRequired: false, reason: `Tool ${toolName} is explicitly denied.` };
  }

  if (config.ALLOWED_TOOLS.length > 0 && !listMatches(config.ALLOWED_TOOLS, toolName)) {
    return { allowed: false, approvalRequired: false, reason: `Tool ${toolName} is not in ALLOWED_TOOLS.` };
  }

  return {
    allowed: true,
    approvalRequired: config.REQUIRE_APPROVAL_FOR_WRITES && risk !== 'read'
  };
}

export function redactSecretText(value: string): string {
  let redacted = value.replace(
    /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/g,
    '[redacted private key]'
  );
  redacted = redacted.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]');
  redacted = redacted.replace(/(https?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[redacted]@');
  for (const pattern of SECRET_VALUE_PATTERNS) redacted = redacted.replace(pattern, '[redacted]');
  redacted = redacted.replace(
    /\b(token|secret|password|passwd|api[_-]?key|authorization|cookie|credential)\b(\s*[:=]\s*)(["']?)([^\s"',;]{6,})\3/gi,
    (_match, label: string, separator: string, quote: string) => `${label}${separator}${quote}[redacted]${quote}`
  );
  return redacted;
}

export function maskSecrets(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') return redactSecretText(value);
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((item) => maskSecrets(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[binary ${value.length} bytes]`;
  if (seen.has(value)) return '[circular]';

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return redactSecretText(String(value));

  seen.add(value);
  const masked = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (isSensitiveKey(key)) return [key, '[redacted]'];
      return [key, maskSecrets(item, seen)];
    })
  );
  seen.delete(value);
  return masked;
}

export function limitToolResult(value: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes <= maxBytes) return value;
  if (maxBytes <= 0) return '';

  const marker = '\n...[truncated]';
  const markerBytes = Buffer.byteLength(marker, 'utf8');
  if (maxBytes <= markerBytes) return utf8Prefix('...[truncated]', maxBytes);
  return `${utf8Prefix(value, maxBytes - markerBytes)}${marker}`;
}

export function sanitizeToolOutput(value: unknown, maxBytes: number): SanitizedToolResult {
  const sanitized = maskSecrets(value);
  const serialized = typeof sanitized === 'string' ? sanitized : (JSON.stringify(sanitized, null, 2) ?? 'null');
  const originalBytes = Buffer.byteLength(serialized, 'utf8');
  const text = limitToolResult(serialized, maxBytes);
  const returnedBytes = Buffer.byteLength(text, 'utf8');
  const truncated = originalBytes > maxBytes;

  return {
    output: truncated
      ? {
          truncated: true,
          originalBytes,
          returnedBytes,
          preview: text
        }
      : sanitized,
    text,
    truncated,
    originalBytes,
    returnedBytes
  };
}
