import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "No connection" };

/**
 * Where a navigation lands when there is no connection and no cached copy of
 * the page that was asked for.
 *
 * Deliberately static and free of any data: it has to render from the precache
 * with nothing available. It says what is true — the connection is down, the
 * counter still works, nothing has been lost — and points at the one screen
 * that is built to run without a network.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream-100 p-6">
      <div className="max-w-md text-center">
        <WifiOff
          className="mx-auto h-10 w-10 text-sage-500"
          aria-hidden="true"
        />
        <h1 className="mt-4 text-[22px] font-semibold text-sage-900">
          No connection
        </h1>
        <p className="mt-2 text-[15px] leading-[1.5] text-sage-600">
          This screen needs the internet, and it isn&apos;t there at the moment.
          Nothing has been lost — anything already saved on this machine is
          still waiting and will be sent as soon as the connection is back.
        </p>
        <p className="mt-4 text-[15px] leading-[1.5] text-sage-600">
          Billing keeps working without a connection.
        </p>
        <Link
          href="/billing"
          className="mt-5 inline-block rounded-[8px] bg-sage-700 px-4 py-2.5 text-[15px] font-medium text-cream-50 hover:bg-sage-900"
        >
          Go to the counter
        </Link>
      </div>
    </main>
  );
}
