import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listRacks, rackItemCounts } from "@/lib/repos/racks";
import { getFloorSize } from "@/lib/repos/company";
import { FloorPlanner } from "@/components/app/floor-planner";

export const metadata = { title: "Shop layout" };

export default async function RacksSettingsPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const [racks, counts, floor] = await Promise.all([
    listRacks(true),
    rackItemCounts(),
    getFloorSize(),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <FloorPlanner
        initialPieces={racks.map((r) => ({
          id: r.id,
          name: r.name,
          kind: r.kind,
          rows: r.rows,
          cols: r.cols,
          xCm: r.xCm,
          yCm: r.yCm,
          widthCm: r.widthCm,
          depthCm: r.depthCm,
          rotation: r.rotation,
          note: r.note,
          active: r.active,
          itemCount: counts[r.id] ?? 0,
        }))}
        initialFloor={floor}
      />
    </main>
  );
}
