/**
 * fefo.ts — First-Expired-First-Out batch allocation. Pure function; the SAME
 * code runs client-side (bill preview) and server-side (authoritative ingest),
 * per Architecture §5.1.
 *
 * ABSOLUTE RULE (Rules §1.4): expired batches are excluded here with NO bypass
 * parameter. There is no way to sell expired stock through this allocator.
 */

export interface FefoBatch {
  id: string;
  /** AD ISO date "YYYY-MM-DD" */
  expiryDateAd: string;
  remainingBaseQty: number;
}

export interface Allocation {
  batchId: string;
  baseQty: number;
}

export interface FefoResult {
  allocations: Allocation[];
  /** base units that could NOT be allocated (0 when fully satisfied) */
  shortfallBaseQty: number;
}

export interface AllocateOptions {
  /** Manual override: this batch is consumed first, the rest still FEFO. */
  overrideBatchId?: string;
}

/**
 * Allocate `requestedBaseQty` across an item's batches, nearest-expiry first.
 * Expired batches (expiry < today) and empty batches are never used.
 */
export function allocate(
  requestedBaseQty: number,
  batches: FefoBatch[],
  todayIso: string,
  opts: AllocateOptions = {},
): FefoResult {
  if (requestedBaseQty <= 0) {
    return { allocations: [], shortfallBaseQty: 0 };
  }

  // sellable = has stock AND not expired (expiry on/after today is still sellable)
  const sellable = batches.filter(
    (b) => b.remainingBaseQty > 0 && b.expiryDateAd >= todayIso,
  );

  // FEFO ordering: nearest expiry first, then id for a stable tiebreak.
  sellable.sort((a, b) => {
    if (a.expiryDateAd !== b.expiryDateAd)
      return a.expiryDateAd < b.expiryDateAd ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Manual override: move the chosen batch to the front (if still sellable).
  let ordered = sellable;
  if (opts.overrideBatchId) {
    const chosen = sellable.find((b) => b.id === opts.overrideBatchId);
    if (chosen) {
      ordered = [chosen, ...sellable.filter((b) => b.id !== chosen.id)];
    }
  }

  const allocations: Allocation[] = [];
  let needed = requestedBaseQty;
  for (const b of ordered) {
    if (needed <= 0) break;
    const take = Math.min(b.remainingBaseQty, needed);
    if (take > 0) {
      allocations.push({ batchId: b.id, baseQty: take });
      needed -= take;
    }
  }

  return { allocations, shortfallBaseQty: Math.max(0, needed) };
}
