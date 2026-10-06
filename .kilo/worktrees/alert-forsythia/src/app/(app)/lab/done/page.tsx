import { LabStagePage } from "@/app/(app)/lab/stage-page";

export const metadata = { title: "Laboratory — given out" };

export default async function Page() {
  return (
    <LabStagePage
      stage="done"
      copy={{
        actionLabel: "",
        revertLabel: "Not handed over after all",
        stampPrefix: "Given",
        emptyTitle: "Nothing handed over yet",
        emptyBody:
          "Reports collected by patients are listed here, most recent first.",
      }}
    />
  );
}
