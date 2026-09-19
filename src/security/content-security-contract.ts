import { z } from 'zod';

export const CONTENT_SECURITY_CONTRACT_VERSION = 'raeburnai.content-security.v1' as const;

export const InjectionSignalSchema = z.enum([
  'instruction_override',
  'authority_impersonation',
  'secret_exfiltration',
  'tool_escalation'
]);
export type InjectionSignal = z.infer<typeof InjectionSignalSchema>;

export const AutonomousToolChainingSchema = z.enum(['policy-evaluation-required', 'blocked']);
export type AutonomousToolChaining = z.infer<typeof AutonomousToolChainingSchema>;

export const FollowOnToolActionSchema = z.enum(['normal-governance', 'governed-review-required']);
export type FollowOnToolAction = z.infer<typeof FollowOnToolActionSchema>;

export const UntrustedContentAssessmentSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SECURITY_CONTRACT_VERSION),
    origin: z.literal('external-tool'),
    trust: z.literal('untrusted'),
    instructionAuthority: z.literal('none'),
    handling: z.literal('data-only'),
    injectionDetected: z.boolean(),
    signals: z.array(InjectionSignalSchema),
    autonomousToolChaining: AutonomousToolChainingSchema,
    followOnToolAction: FollowOnToolActionSchema
  })
  .superRefine((value, context) => {
    const hostile = value.injectionDetected || value.signals.length > 0;
    if (hostile) {
      if (value.autonomousToolChaining !== 'blocked') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['autonomousToolChaining'],
          message: 'Detected or signalled injection must block autonomous tool chaining.'
        });
      }
      if (value.followOnToolAction !== 'governed-review-required') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['followOnToolAction'],
          message: 'Detected or signalled injection must require governed review.'
        });
      }
      return;
    }

    if (value.autonomousToolChaining !== 'policy-evaluation-required') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['autonomousToolChaining'],
        message: 'Clean external content must still pass normal policy evaluation.'
      });
    }
    if (value.followOnToolAction !== 'normal-governance') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['followOnToolAction'],
        message: 'Clean external content must remain subject to normal governance.'
      });
    }
  });

export type UntrustedContentAssessment = z.infer<typeof UntrustedContentAssessmentSchema>;

export type SecurityOrchestrationStep = 'policy-evaluation' | 'governed-review';

export function parseUntrustedContentAssessment(value: unknown): UntrustedContentAssessment {
  return UntrustedContentAssessmentSchema.parse(value);
}

export function nextSecurityOrchestrationStep(value: unknown): SecurityOrchestrationStep {
  const decision = parseUntrustedContentAssessment(value);
  if (
    decision.injectionDetected ||
    decision.signals.length > 0 ||
    decision.autonomousToolChaining === 'blocked' ||
    decision.followOnToolAction === 'governed-review-required'
  ) {
    return 'governed-review';
  }
  return 'policy-evaluation';
}

export const CONTENT_SECURITY_CONTRACT_DESCRIPTOR = {
  schemaVersion: CONTENT_SECURITY_CONTRACT_VERSION,
  trustBoundary: 'external tool and retrieved content is data-only and never instruction authority',
  chainConsumerRule:
    'Reject unknown/invalid contract versions. governed-review blocks autonomous follow-on actions; policy-evaluation still requires normal tenant/tool/approval policy before any next tool action.',
  orchestrationSteps: ['policy-evaluation', 'governed-review'] as const
};
