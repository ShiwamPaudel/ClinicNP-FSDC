import { redirect } from "next/navigation";

/** The old Today page (C-038): Visits now opens on today, so send bookmarks there. */
export default function TodayPage() {
  redirect("/visits");
}
