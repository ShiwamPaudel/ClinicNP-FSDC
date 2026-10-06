/**
 * rack-label.ts — how a shelf is written down.
 *
 * Its own module because both sides need it: the server writes it into reports
 * and the counter writes it under a search result, and the racks repo is
 * server-only. One definition, so "Rack 1 · R2C3" never becomes "Rack 1 R2/C3"
 * on one screen and something else on another.
 */

/** How a cell is written down when there is no room to draw it. */
export function cellLabel(rackName: string, row: number, col: number): string {
  return `${rackName} · R${row}C${col}`;
}
