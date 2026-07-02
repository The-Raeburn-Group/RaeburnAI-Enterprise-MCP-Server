import type { AppConfig } from '../config.js';

export type ToolRisk = 'read' | 'write' | 'admin';

export interface ToolPolicyDecision {
  allowed: boolean;
  approvalRequired: boolean;
  reason?: string;
}

export function evaluateToolPolicy(config: AppConfig, toolName: string, risk: ToolRisk): ToolPolicyDecision {
  if (config.DENIED_TOOLS.includes(toolName)) {
    return { allowed: false, approvalRequired: false, reason: `Tool ${toolName} is explicitly denied.` };
  }

  if (config.ALLOWED_TOOLS.length > 0 && !config.ALLOWED_TOOLS.includes(toolName)) {
    return { allowed: false, approvalRequired: false, reason: `Tool ${toolName} is not in ALLOWED_TOOLS.` };
  }

  return {
    allowed: true,
    approvalRequired: config.REQUIRE_APPROVAL_FOR_WRITES && risk !== 'read'
  };
}

export function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/token|secret|password|key|authorization/i.test(key)) return [key, '[redacted]'];
      return [key, maskSecrets(item)];
    })
  );
}
