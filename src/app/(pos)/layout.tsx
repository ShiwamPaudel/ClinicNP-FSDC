import { requireUser } from "@/lib/session";

/**
 * The POS is its own layout — no sidebar, minimal chrome, keyboard-first (Design.md §3).
 * The full three-zone billing screen is built in Phase 3.
 */
export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}
