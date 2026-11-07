import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeNets, rankByNet, settle, type Net } from './settlement';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('computeNets', () => {
  it('net = final balance minus everything bought in', () => {
    expect(
      computeNets([
        { id: 'a', balance: 340, totalBuyIn: 0 },
        { id: 'b', balance: -340, totalBuyIn: 0 },
        { id: 'c', balance: 150, totalBuyIn: 200 },
      ]),
    ).toEqual([
      { id: 'a', net: 340 },
      { id: 'b', net: -340 },
      { id: 'c', net: -50 },
    ]);
  });
});

describe('settle', () => {
  it('one debtor pays two creditors', () => {
    expect(
      settle([
        { id: 'aman', net: 340 },
        { id: 'rohit', net: -200 },
        { id: 'neha', net: -140 },
      ]),
    ).toEqual([
      { from: 'rohit', to: 'aman', amount: 200 },
      { from: 'neha', to: 'aman', amount: 140 },
    ]);
  });

  it('matches the largest debtor with the largest creditor first', () => {
    expect(
      settle([
        { id: 'a', net: 100 },
        { id: 'b', net: 50 },
        { id: 'c', net: -120 },
        { id: 'd', net: -30 },
      ]),
    ).toEqual([
      { from: 'c', to: 'a', amount: 100 },
      { from: 'd', to: 'b', amount: 30 }, // d (30) is now the largest debtor, c has 20 left
      { from: 'c', to: 'b', amount: 20 },
    ]);
  });

  it('nobody owes anything when everyone is even', () => {
    expect(
      settle([
        { id: 'a', net: 0 },
        { id: 'b', net: 0 },
      ]),
    ).toEqual([]);
  });

  it('refuses nets that do not sum to zero', () => {
    expect(() =>
      settle([
        { id: 'a', net: 10 },
        { id: 'b', net: -5 },
      ]),
    ).toThrow();
  });

  it('property: for random nets that sum to zero, payments clear every balance with at most n-1 payments', () => {
    const netsArb = fc
      .array(fc.integer({ min: -5000, max: 5000 }), { minLength: 1, maxLength: 10 })
      .map((values) => {
        const nets: Net[] = values.map((v, i) => ({ id: `p${i}`, net: v }));
        nets.push({ id: 'last', net: -sum(values) });
        return nets;
      });

    fc.assert(
      fc.property(netsArb, (nets) => {
        const payments = settle(nets);
        const after = new Map(nets.map((n) => [n.id, n.net]));
        for (const p of payments) {
          expect(Number.isInteger(p.amount) && p.amount > 0).toBe(true);
          expect(nets.find((n) => n.id === p.from)!.net).toBeLessThan(0);
          expect(nets.find((n) => n.id === p.to)!.net).toBeGreaterThan(0);
          after.set(p.from, after.get(p.from)! + p.amount);
          after.set(p.to, after.get(p.to)! - p.amount);
        }
        for (const v of after.values()) expect(v).toBe(0);
        const nonZero = nets.filter((n) => n.net !== 0).length;
        expect(payments.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      }),
      { numRuns: 500 },
    );
  });
});

describe('rankByNet', () => {
  it('sorts by net, highest first', () => {
    expect(
      rankByNet([
        { id: 'a', net: -10 },
        { id: 'b', net: 30 },
        { id: 'c', net: -20 },
      ]).map((n) => n.id),
    ).toEqual(['b', 'a', 'c']);
  });
});
