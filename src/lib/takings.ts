/**
 * takings.ts — sharing a bill's total out over its lines.
 *
 * A bill's total is not the sum of its lines: a bill-level discount comes
 * off, VAT goes on, and rounding moves it a few paisa. Any split of the
 * takings (by group, by kind, by day) that adds up the lines alone is then
 * out by exactly that much, and stops agreeing with the sales figure beside
 * it the first time the counter gives a discount.
 *
 * So each line carries its share of the difference, in proportion to its
 * amount, and the odd paisa go to the lines with the largest remainders. The
 * shares always add up to the bill's total to the paisa.
 */

/** Floor division on BigInts (BigInt `/` truncates towards zero). */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
}

/**
 * What each line contributed to `totalPaisa`. Amounts are the lines' own
 * amounts (qty × rate − line discount); the result has one entry per line and
 * sums to `totalPaisa`. Worked in BigInt: a large bill times a large discount
 * can pass 2^53.
 */
export function shareOut(totalPaisa: number, amounts: number[]): number[] {
  if (amounts.length === 0) return [];
  const sub = amounts.reduce((s, a) => s + a, 0);
  const adj = totalPaisa - sub;
  if (adj === 0) return amounts.slice();
  if (sub === 0) {
    // Nothing to be in proportion to: the first line takes it all.
    return amounts.map((a, i) => (i === 0 ? a + adj : a));
  }
  const S = BigInt(sub);
  const A = BigInt(adj);
  const parts = amounts.map((a, i) => {
    const num = A * BigInt(a);
    const base = floorDiv(num, S);
    return { i, base, rem: num - base * S };
  });
  let left = A - parts.reduce((s, p) => s + p.base, 0n);
  const out = parts.map((p) => Number(p.base));
  // Largest remainder first; ties to the earlier line, so it is repeatable.
  const order = [...parts].sort((x, y) =>
    x.rem === y.rem ? x.i - y.i : x.rem > y.rem ? -1 : 1,
  );
  for (const p of order) {
    if (left <= 0n) break;
    out[p.i]! += 1;
    left -= 1n;
  }
  return amounts.map((a, i) => a + out[i]!);
}
