import { redirect } from "next/navigation";

/** Credit bills became Dues. The old address still lands somewhere useful. */
export default function CreditBillsPage() {
  redirect("/dues");
}
