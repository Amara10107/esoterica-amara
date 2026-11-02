import { describe, expect, it } from 'vitest';
import { terminalAllowsBranch, terminalBranchIds, terminalPublic } from '../src/terminals.ts';

describe('terminales en una o varias sucursales (v2.1)', () => {
  it('sin branchIds solo vale la principal', () => {
    expect(terminalBranchIds({ branchId: 'A' })).toEqual(['A']);
    expect(terminalAllowsBranch({ branchId: 'A' }, 'A')).toBe(true);
    expect(terminalAllowsBranch({ branchId: 'A' }, 'B')).toBe(false);
  });
  it('con branchIds vale cualquiera de ellas, sin duplicados', () => {
    expect(terminalBranchIds({ branchId: 'A', branchIds: ['A', 'B', 'B'] })).toEqual(['A', 'B']);
    expect(terminalAllowsBranch({ branchId: 'A', branchIds: ['A', 'B'] }, 'B')).toBe(true);
    expect(terminalAllowsBranch({ branchId: 'A', branchIds: ['A', 'B'] }, 'C')).toBe(false);
  });
  it('la forma pública incluye branchIds y nunca la versión del token', () => {
    const v = terminalPublic({ _id: 't1', branchId: 'A', tokenVersion: 3 }) as Record<string, unknown>;
    expect(v.branchIds).toEqual(['A']);
    expect('tokenVersion' in v).toBe(false);
  });
});
