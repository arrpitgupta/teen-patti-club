export interface BalanceInput {
  id: string;
  balance: number;
  /** Starting chips plus re-buys. */
  totalBuyIn: number;
}

export interface Net {
  id: string;
  net: number;
}

export interface Payment {
  from: string;
  to: string;
  amount: number;
}

/** Net for settlement = final balance - (starting chips + re-buys). */
export function computeNets(players: readonly BalanceInput[]): Net[] {
  return players.map((p) => ({ id: p.id, net: p.balance - p.totalBuyIn }));
}

export function rankByNet(nets: readonly Net[]): Net[] {
  return [...nets].sort((a, b) => b.net - a.net || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Who pays whom. Greedy: repeatedly match the largest debtor with the largest creditor.
 * Each payment clears at least one person, so there are at most (non-zero players - 1).
 */
export function settle(nets: readonly Net[]): Payment[] {
  for (const n of nets) {
    if (!Number.isInteger(n.net)) throw new Error(`Net for ${n.id} is not a whole number`);
  }
  const total = nets.reduce((s, n) => s + n.net, 0);
  if (total !== 0) throw new Error(`Nets must sum to zero (got ${total})`);

  type Side = { id: string; amount: number };
  const byAmount = (a: Side, b: Side) =>
    b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const creditors: Side[] = nets.filter((n) => n.net > 0).map((n) => ({ id: n.id, amount: n.net }));
  const debtors: Side[] = nets.filter((n) => n.net < 0).map((n) => ({ id: n.id, amount: -n.net }));

  const payments: Payment[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmount);
    debtors.sort(byAmount);
    const c = creditors[0]!;
    const d = debtors[0]!;
    const amount = Math.min(c.amount, d.amount);
    payments.push({ from: d.id, to: c.id, amount });
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount === 0) creditors.shift();
    if (d.amount === 0) debtors.shift();
  }
  return payments;
}
