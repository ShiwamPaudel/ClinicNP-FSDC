import { LabStagePage } from "@/app/(app)/lab/stage-page";

export const metadata = { title: "Laboratory — report in" };

export default async function Page() {
  return (
    <LabStagePage
      stage="report_in"
      copy={{
        actionLabel: "Given to patient",
        revertLabel: "Report has not come back",
        stampPrefix: "Report in",
        emptyTitle: "No reports waiting to be handed over",
        emptyBody:
          "A report appears here once it comes back from the laboratory, and leaves when the patient collects it.",
      }}
    />
  );
}
