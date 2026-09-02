/**
 * Accuracy harness for rule-based triage.
 * Per spec: stub test 46/50 pass, helper 40/50 fail.
 */

import { describe, it, expect } from 'vitest';
import { detectIntent, extractOrderNumber, type Intent } from '../ingest/triage';
import labeledData from '../ingest/fixtures/triage-labeled.json';

interface LabeledExample {
  id: string;
  subject: string;
  body: string;
  expected: {
    intent: Intent;
    orderNumber?: string;
  };
}

const examples = labeledData as LabeledExample[];

describe('triage accuracy harness', () => {
  describe('rule-based triage accuracy', () => {
    it('intent accuracy is >= 70% baseline for rule-based triage', () => {
      let correct = 0;

      for (const ex of examples) {
        const predicted = detectIntent(ex.subject, ex.body);
        if (predicted === ex.expected.intent) correct++;
      }

      const accuracyPercent = (correct / examples.length) * 100;
      expect(accuracyPercent).toBeGreaterThanOrEqual(70);
    });

    it('order number extraction works for standard formats', () => {
      const standardFormats = examples.filter(
        (ex) => ex.expected.orderNumber && !ex.expected.orderNumber.startsWith('AMBI'),
      );

      let correct = 0;
      for (const ex of standardFormats) {
        const extracted = extractOrderNumber(`${ex.subject}\n${ex.body}`);
        if (extracted === ex.expected.orderNumber) correct++;
      }

      expect(correct).toBeGreaterThanOrEqual(standardFormats.length * 0.9);
    });
  });

  describe('accuracy helpers', () => {
    it('stubAccuracyPass: 46 of 50 pass (92%)', () => {
      const results = stubAccuracyPass(50);
      const passCount = results.filter((r) => r.pass).length;
      expect(passCount).toBe(46);
    });

    it('stubAccuracyFail: 40 of 50 fail (20% pass)', () => {
      const results = stubAccuracyFail(50);
      const passCount = results.filter((r) => r.pass).length;
      expect(passCount).toBe(10);
    });
  });
});

interface AccuracyResult {
  id: number;
  pass: boolean;
}

function stubAccuracyPass(n: number): AccuracyResult[] {
  const results: AccuracyResult[] = [];
  for (let i = 0; i < n; i++) {
    results.push({ id: i + 1, pass: i < 46 });
  }
  return results;
}

function stubAccuracyFail(n: number): AccuracyResult[] {
  const results: AccuracyResult[] = [];
  for (let i = 0; i < n; i++) {
    results.push({ id: i + 1, pass: i < 10 });
  }
  return results;
}

export { stubAccuracyPass, stubAccuracyFail };
