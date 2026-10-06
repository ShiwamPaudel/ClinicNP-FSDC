import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { catalogSnapshot } from "@/lib/repos/catalog";
import { getModules } from "@/lib/modules";
import {
  checkRateLimit,
  CATALOG_SYNC,
  tooManyRequestsBody,
} from "@/lib/rate-limit";

/**
 * GET /api/catalog — the POS catalog snapshot (items + units + live batches).
 * Session-protected. The client caches this in IndexedDB (Phase 3).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, userMessage: "Please sign in." },
      { status: 401 },
    );
  }
  const limit = await checkRateLimit(CATALOG_SYNC, session.user.id);
  if (!limit.ok) {
    return NextResponse.json(tooManyRequestsBody(), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  // The route itself stays open whichever module is on: it is the shared
  // counter's snapshot. What comes back depends on the modules — no medicines
  // without the pharmacy, no services without the clinic.
  const modules = await getModules();
  if (!modules.pharmacy && !modules.clinic) {
    return NextResponse.json({
      version: null,
      items: [],
      services: [],
      doctors: [],
      labPartners: [],
      racks: [],
    });
  }

  const snapshot = await catalogSnapshot(modules.clinic);
  if (!modules.pharmacy) snapshot.items = [];
  return NextResponse.json(snapshot);
}
