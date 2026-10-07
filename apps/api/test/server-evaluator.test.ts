import { describe, expect, it } from 'vitest';
import { evaluateInspection } from '../src/server-evaluator.mjs';

describe('server inspection evaluation', () => {
  const publishedRevision = { stages: [{ code: 'MECH', sections: [{ params: [
    { id: 'DIM-1', type: 'range', min: 10, max: 20, mandatory: true, critical: true },
  ] }] }] };

  it('ignores a client supplied PASS when the server evaluates a failing value', () => {
    const result = evaluateInspection(publishedRevision, {
      values: { 'DIM-1': { v: '25' } }, result: 'PASS',
      template: { stages: [{ code: 'client-forged', sections: [{ params: [] }] }] },
    });
    expect(result.result).toBe('FAIL');
    expect(result.fail).toBe(1);
  });

  it('returns INCOMPLETE when a required value is absent', () => {
    expect(evaluateInspection(publishedRevision, { values: {}, result: 'PASS' }).result).toBe('INCOMPLETE');
  });
});
