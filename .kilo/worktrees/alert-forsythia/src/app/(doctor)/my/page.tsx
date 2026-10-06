import { redirect } from "next/navigation";

/** A doctor who lands on /my wants the list they came for. */
export default function MyPage() {
  redirect("/my/schedule");
}
