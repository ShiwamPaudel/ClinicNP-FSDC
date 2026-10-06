import Link from "next/link";

/**
 * The 404 page. It is also what a disabled module's URL renders (D-030), so it
 * must never hint that a module exists, is switched off, or that there is data
 * behind the address — that is the whole reason this is a 404 and not a 403.
 */
export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream-100 px-6 text-center">
      <p className="font-display text-[40px] font-bold leading-none text-sage-900">
        404
      </p>
      <h1 className="mt-3 text-[18px] font-semibold text-sage-900">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-1.5 max-w-sm text-[14px] leading-[1.45] text-sage-500">
        The address may be mistyped, or the page may have moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-10 items-center rounded-[8px] bg-sage-700 px-4 text-[14px] font-medium text-cream-50 hover:bg-sage-600"
      >
        Go to the dashboard
      </Link>
    </main>
  );
}
