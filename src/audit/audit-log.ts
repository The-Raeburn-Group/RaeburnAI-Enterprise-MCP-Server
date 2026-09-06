import type { Logger } from '../logger.js';
import { maskSecrets } from '../security/policy.js';
import type { UntrustedContentAssessment } from '../security/untrusted-content.js';

export interface AuditEvent {
  tenantId: string;
  actorId: string;
  requestId: string;
  approvalId?: string;
  source: 'chain-http' | 'stdio';
  tool: string;
  connector: string;
  risk: string;
  input: unknown;
  output?: unknown;
  contentSecurity?: UntrustedContentAssessment;
  status: 'allowed' | 'blocked' | 'success' | 'error' | 'approval_required';
  reason?: string;
  durationMs?: number;
}

export class AuditLog {
  constructor(
    private readonly logger: Logger,
    private readonly enabled: boolean,
    private readonly redactSecrets: boolean
  ) {}

  record(event: AuditEvent): void {
    if (!this.enabled) return;
    const payload = this.redactSecrets ? maskSecrets(event) : event;
    this.logger.info({ audit: payload }, 'mcp_audit_event');
  }
}
