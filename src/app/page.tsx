import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DOCTOR_HOME } from "@/lib/session";

/**
 * The front door.
 *
 * Everyone signing in is sent here rather than straight to the dashboard,
 * because where somebody belongs depends on who they are and only the server
 * knows that. A doctor pushed to the dashboard would watch the back office
 * begin to draw before being turned around — one wasted hop and a flash of a
 * screen that is not theirs.
 */
export default async function RootPage() {
  const session = await auth();
  if (session?.user?.role === "doctor") redirect(DOCTOR_HOME);
  redirect("/dashboard");
}
