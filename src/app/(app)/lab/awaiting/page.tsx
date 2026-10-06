import { LabStagePage } from "@/app/(app)/lab/stage-page";

export const metadata = { title: "Laboratory — awaiting report" };

export default async function Page() {
  return (
    <LabStagePage
      stage="awaiting_report"
      copy={{
        actionLabel: "Report received",
        revertLabel: "Not sent after all",
        stampPrefix: "Sent",
        emptyTitle: "No reports outstanding",
        emptyBody:
          "Everything sent to the laboratory has come back. Samples appear here the moment they are sent.",
      }}
    />
  );
}
