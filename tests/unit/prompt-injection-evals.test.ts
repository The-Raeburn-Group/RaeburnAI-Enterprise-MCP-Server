import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assessUntrustedContent,
  type InjectionSignal
} from '../../src/security/untrusted-content.js';

type EvaluationCase = {
  id: string;
  kind: 'hostile' | 'benign';
  input: unknown;
  expectedSignals: InjectionSignal[];
};

const corpusUrl = new URL('../fixtures/prompt-injection-corpus.json', import.meta.url);
const corpus = JSON.parse(readFileSync(corpusUrl, 'utf8')) as EvaluationCase[];

describe('prompt injection evaluation corpus', () => {
  it('contains unique hostile and benign cases so the suite tests detection and false positives', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(16);
    expect(new Set(corpus.map((item) => item.id)).size).toBe(corpus.length);
    expect(corpus.filter((item) => item.kind === 'hostile').length).toBeGreaterThanOrEqual(8);
    expect(corpus.filter((item) => item.kind === 'benign').length).toBeGreaterThanOrEqual(6);
  });

  for (const evaluation of corpus) {
    it(`${evaluation.kind}: ${evaluation.id}`, () => {
      const assessment = assessUntrustedContent(evaluation.input);
      const hostile = evaluation.kind === 'hostile';

      expect(assessment.origin).toBe('external-tool');
      expect(assessment.trust).toBe('untrusted');
      expect(assessment.instructionAuthority).toBe('none');
      expect(assessment.handling).toBe('data-only');
      expect(assessment.injectionDetected).toBe(hostile);

      for (const signal of evaluation.expectedSignals) {
        expect(assessment.signals).toContain(signal);
      }
      if (!hostile) expect(assessment.signals).toEqual([]);

      expect(assessment.autonomousToolChaining).toBe(hostile ? 'blocked' : 'policy-evaluation-required');
      expect(assessment.followOnToolAction).toBe(hostile ? 'governed-review-required' : 'normal-governance');
    });
  }
});
