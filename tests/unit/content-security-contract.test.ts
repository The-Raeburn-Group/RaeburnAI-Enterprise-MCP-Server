import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_CONTRACT_VERSION,
  nextSecurityOrchestrationStep,
  parseUntrustedContentAssessment
} from '../../src/security/content-security-contract.js';

function cleanDecision() {
  return {
    schemaVersion: CONTENT_SECURITY_CONTRACT_VERSION,
    origin: 'external-tool',
    trust: 'untrusted',
    instructionAuthority: 'none',
    handling: 'data-only',
    injectionDetected: false,
    signals: [],
    autonomousToolChaining: 'policy-evaluation-required',
    followOnToolAction: 'normal-governance'
  };
}

describe('versioned content-security contract', () => {
  it('routes a valid clean decision to normal policy evaluation, not direct tool execution', () => {
    expect(nextSecurityOrchestrationStep(cleanDecision())).toBe('policy-evaluation');
  });

  it('routes a detected injection to governed review', () => {
    expect(
      nextSecurityOrchestrationStep({
        ...cleanDecision(),
        injectionDetected: true,
        signals: ['instruction_override'],
        autonomousToolChaining: 'blocked',
        followOnToolAction: 'governed-review-required'
      })
    ).toBe('governed-review');
  });

  it('fails closed on an unknown contract version', () => {
    expect(() =>
      nextSecurityOrchestrationStep({
        ...cleanDecision(),
        schemaVersion: 'raeburnai.content-security.v2'
      })
    ).toThrow();
  });

  it('rejects contradictory decisions that claim injection but allow normal governance', () => {
    expect(() =>
      parseUntrustedContentAssessment({
        ...cleanDecision(),
        injectionDetected: true,
        signals: ['tool_escalation']
      })
    ).toThrow();
  });

  it('rejects contradictory clean decisions that bypass policy evaluation', () => {
    expect(() =>
      parseUntrustedContentAssessment({
        ...cleanDecision(),
        autonomousToolChaining: 'blocked',
        followOnToolAction: 'governed-review-required'
      })
    ).toThrow();
  });
});
