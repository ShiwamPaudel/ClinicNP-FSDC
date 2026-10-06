import { LabStagePage } from "@/app/(app)/lab/stage-page";

export const metadata = { title: "Laboratory — to send" };

export default async function Page() {
  return (
    <LabStagePage
      stage="to_dispatch"
      copy={{
        actionLabel: "Sent to lab",
        revertLabel: "Not collected after all",
        stampPrefix: "Collected",
        emptyTitle: "Nothing waiting to go out",
        emptyBody:
          "Samples appear here once they are collected, and leave once they are sent to the laboratory.",
      }}
    />
  );
}
