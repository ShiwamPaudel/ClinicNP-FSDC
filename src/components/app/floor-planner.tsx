"use client";

/**
 * floor-planner.tsx — the shop as a room you can walk around.
 *
 * The old screen was a list of racks with arrow buttons that nudged them
 * around a grid of identical squares. It stored the right facts and it was
 * unusable: a pharmacy is a long counter, a tall rack against the back wall,
 * a fridge in the corner and a shelf tucked in the gap, and none of that fits
 * on a chessboard. So this draws the actual room and lets somebody arrange it.
 *
 * WHY NO CANVAS LIBRARY. Konva, Fabric and the rest are built for thousands of
 * shapes and they draw to a <canvas>, which is one opaque element as far as the
 * keyboard and a screen reader are concerned — and this project has an
 * accessibility gate that every screen has to pass. A pharmacy has twenty
 * pieces of furniture, not twenty thousand. So every piece here is a real SVG
 * element that can be tabbed to, moved with the arrow keys and described out
 * loud, the theme colours come from the same tokens as the rest of the app,
 * and the whole thing costs nothing to download.
 *
 * Everything inside the plan is measured in centimetres and the SVG is scaled
 * once at the top. Mixing pixels and centimetres in the same arithmetic is how
 * a plan ends up 1.7% wrong in a way nobody can see and nobody can find.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  RotateCw,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Check,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  saveRackAction,
  deleteRackAction,
  saveLayoutAction,
  setFloorSizeAction,
} from "@/app/(app)/settings/rack-actions";
import {
  FURNITURE_KINDS,
  FURNITURE_LABEL,
  FURNITURE_DEFAULT_NAME,
  FURNITURE_DEFAULT_SIZE,
  FURNITURE_HOLDS_STOCK,
  footprint,
  overlaps,
  asFurnitureKind,
  type FurnitureKind,
  type Rotation,
} from "@/lib/furniture";
import { cn } from "@/lib/cn";

export interface PlannerPiece {
  id: string;
  name: string;
  kind: FurnitureKind;
  rows: number;
  cols: number;
  xCm: number;
  yCm: number;
  widthCm: number;
  depthCm: number;
  rotation: Rotation;
  note: string;
  active: boolean;
  /** how many medicines are on it, so deleting can say what it costs */
  itemCount: number;
}

/** Everything snaps to 5cm unless Alt is held. Furniture is not precise. */
const SNAP_CM = 5;
const MIN_SIDE = 10;
const MAX_SIDE = 2000;
const GRID_MINOR = 50;
const GRID_MAJOR = 100;

type DragMode =
  | { kind: "none" }
  | { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
  | {
      kind: "move";
      id: string;
      grabDx: number;
      grabDy: number;
    }
  | {
      kind: "resize";
      id: string;
      handle: Handle;
      startX: number;
      startY: number;
      startW: number;
      startH: number;
    };

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLES: { h: Handle; fx: number; fy: number; cursor: string }[] = [
  { h: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { h: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { h: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { h: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { h: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { h: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { h: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { h: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

/** Fill and stroke per kind, as literal values so print and both themes agree. */
const KIND_STYLE: Record<FurnitureKind, { fill: string; stroke: string; text: string }> = {
  rack: { fill: "#dfe7df", stroke: "#5c7060", text: "#22301f" },
  shelf: { fill: "#e7ecdf", stroke: "#6b7a55", text: "#22301f" },
  desk: { fill: "#efe4d7", stroke: "#8a7256", text: "#33261a" },
  counter: { fill: "#f3e2ea", stroke: "#9c5f79", text: "#3a1f2a" },
  fridge: { fill: "#dde8f2", stroke: "#4f7391", text: "#1c2c39" },
  door: { fill: "#ffffff", stroke: "#8a8a8a", text: "#444444" },
};

function snap(v: number, free: boolean): number {
  return free ? Math.round(v) : Math.round(v / SNAP_CM) * SNAP_CM;
}

function clampSide(v: number): number {
  return Math.max(MIN_SIDE, Math.min(MAX_SIDE, Math.round(v)));
}

/**
 * Somewhere in the room this piece would not be standing on anything else.
 *
 * Dropping every new piece at a fixed offset means a 200cm counter lands on
 * top of the rack added before it, and a brand-new room opens covered in
 * overlap warnings — which teaches somebody to ignore the warning on their
 * first minute with the screen. Walks the floor in 20cm steps and takes the
 * first clear spot; falls back to the top-left corner when the room is full,
 * because a piece that exists somewhere visible beats one that does not.
 */
function findFreeSpot(
  taken: { xCm: number; yCm: number; widthCm: number; depthCm: number; rotation: number }[],
  widthCm: number,
  depthCm: number,
  floor: { floorWidthCm: number; floorDepthCm: number },
): { xCm: number; yCm: number } {
  const step = 20;
  const margin = 10;
  for (let y = margin; y + depthCm <= floor.floorDepthCm; y += step) {
    for (let x = margin; x + widthCm <= floor.floorWidthCm; x += step) {
      const candidate = { xCm: x, yCm: y, widthCm, depthCm, rotation: 0 };
      if (!taken.some((t) => overlaps(candidate, t))) return { xCm: x, yCm: y };
    }
  }
  return { xCm: margin, yCm: margin };
}

export function FloorPlanner({
  initialPieces,
  initialFloor,
}: {
  initialPieces: PlannerPiece[];
  initialFloor: { floorWidthCm: number; floorDepthCm: number };
}) {
  const router = useRouter();
  const toast = useToast();

  const [pieces, setPieces] = useState<PlannerPiece[]>(initialPieces);
  const [floor, setFloor] = useState(initialFloor);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [drag, setDrag] = useState<DragMode>({ kind: "none" });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const undoStack = useRef<PlannerPiece[][]>([]);
  const redoStack = useRef<PlannerPiece[][]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = pieces.find((p) => p.id === selectedId) ?? null;

  // --- geometry helpers --------------------------------------------------

  /** A pointer event's position, in centimetres on the plan. */
  const toCm = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom],
  );

  /** Pieces standing in the same place as something else. Drawn, not refused. */
  const clashing = useMemo(() => {
    const out = new Set<string>();
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const a = pieces[i]!;
        const b = pieces[j]!;
        if (a.kind === "door" || b.kind === "door") continue;
        if (overlaps(a, b)) {
          out.add(a.id);
          out.add(b.id);
        }
      }
    }
    return out;
  }, [pieces]);

  /** Pieces sticking out of the room, which is usually a mistake. */
  const outside = useMemo(() => {
    const out = new Set<string>();
    for (const p of pieces) {
      const f = footprint(p);
      if (
        p.xCm < 0 ||
        p.yCm < 0 ||
        p.xCm + f.w > floor.floorWidthCm ||
        p.yCm + f.h > floor.floorDepthCm
      ) {
        out.add(p.id);
      }
    }
    return out;
  }, [pieces, floor]);

  // --- saving ------------------------------------------------------------

  const queueSave = useCallback((next: PlannerPiece[]) => {
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Debounced: somebody deciding where a rack goes drags it a dozen times,
    // and a write per pixel would be a write per pixel.
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const res = await saveLayoutAction({
        moves: next.map((p) => ({
          id: p.id,
          xCm: p.xCm,
          yCm: p.yCm,
          widthCm: p.widthCm,
          depthCm: p.depthCm,
          rotation: p.rotation,
        })),
      });
      setSaving(false);
      if (res.ok) setDirty(false);
      else toast.error(res.userMessage ?? "The layout could not be saved.");
    }, 500);
  }, [toast]);

  /** Change the plan, remembering how it was so it can be undone. */
  const mutate = useCallback(
    (fn: (prev: PlannerPiece[]) => PlannerPiece[], save = true) => {
      setPieces((prev) => {
        undoStack.current = [...undoStack.current.slice(-49), prev];
        redoStack.current = [];
        const next = fn(prev);
        if (save && next.length > 0) queueSave(next);
        return next;
      });
    },
    [queueSave],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setPieces((cur) => {
      redoStack.current.push(cur);
      queueSave(prev);
      return prev;
    });
  }, [queueSave]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setPieces((cur) => {
      undoStack.current.push(cur);
      queueSave(next);
      return next;
    });
  }, [queueSave]);

  // --- pointer ------------------------------------------------------------

  function onPointerDownPiece(
    e: React.PointerEvent,
    piece: PlannerPiece,
  ) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSelectedId(piece.id);
    const at = toCm(e);
    setDrag({
      kind: "move",
      id: piece.id,
      grabDx: at.x - piece.xCm,
      grabDy: at.y - piece.yCm,
    });
  }

  function onPointerDownHandle(
    e: React.PointerEvent,
    piece: PlannerPiece,
    handle: Handle,
  ) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const at = toCm(e);
    const f = footprint(piece);
    setDrag({
      kind: "resize",
      id: piece.id,
      handle,
      startX: at.x,
      startY: at.y,
      startW: f.w,
      startH: f.h,
    });
  }

  function onPointerDownCanvas(e: React.PointerEvent) {
    setSelectedId(null);
    setDrag({
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (drag.kind === "none") return;
    const free = e.altKey;

    if (drag.kind === "pan") {
      setPan({
        x: drag.panX + (e.clientX - drag.startX),
        y: drag.panY + (e.clientY - drag.startY),
      });
      return;
    }

    const at = toCm(e);

    if (drag.kind === "move") {
      const id = drag.id;
      const x = snap(at.x - drag.grabDx, free);
      const y = snap(at.y - drag.grabDy, free);
      setPieces((prev) =>
        prev.map((p) => (p.id === id ? { ...p, xCm: x, yCm: y } : p)),
      );
      return;
    }

    // resize: the handle says which edges move, and the opposite edge stays put
    const { id, handle, startX, startY, startW, startH } = drag;
    const dx = at.x - startX;
    const dy = at.y - startY;
    setPieces((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const f = footprint(p);
        let x = p.xCm;
        let y = p.yCm;
        let w = f.w;
        let h = f.h;

        if (handle.includes("e")) w = clampSide(snap(startW + dx, free));
        if (handle.includes("s")) h = clampSide(snap(startH + dy, free));
        if (handle.includes("w")) {
          const right = p.xCm + f.w;
          w = clampSide(snap(startW - dx, free));
          x = right - w;
        }
        if (handle.includes("n")) {
          const bottom = p.yCm + f.h;
          h = clampSide(snap(startH - dy, free));
          y = bottom - h;
        }

        // The stored width/depth are the unrotated ones, so a quarter-turned
        // piece has to have the dragged footprint turned back before it is
        // written — otherwise resizing a sideways rack silently stands it up.
        const turned = p.rotation === 90 || p.rotation === 270;
        return turned
          ? { ...p, xCm: x, yCm: y, widthCm: h, depthCm: w }
          : { ...p, xCm: x, yCm: y, widthCm: w, depthCm: h };
      }),
    );
  }

  function onPointerUp() {
    if (drag.kind === "move" || drag.kind === "resize") {
      // One undo step per gesture, not per pixel: the snapshot is taken here,
      // against the state before the drag started.
      setPieces((cur) => {
        queueSave(cur);
        return cur;
      });
    }
    setDrag({ kind: "none" });
  }

  /** Remember the pre-drag state so a whole gesture is one undo. */
  function rememberBeforeGesture() {
    undoStack.current = [...undoStack.current.slice(-49), pieces];
    redoStack.current = [];
  }

  // --- keyboard -----------------------------------------------------------

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement;
      if (typing) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (!selectedId) return;

      const step = e.shiftKey ? 25 : SNAP_CM;
      const nudge = (dx: number, dy: number) => {
        e.preventDefault();
        mutate((prev) =>
          prev.map((p) =>
            p.id === selectedId ? { ...p, xCm: p.xCm + dx, yCm: p.yCm + dy } : p,
          ),
        );
      };
      if (e.key === "ArrowLeft") nudge(-step, 0);
      else if (e.key === "ArrowRight") nudge(step, 0);
      else if (e.key === "ArrowUp") nudge(0, -step);
      else if (e.key === "ArrowDown") nudge(0, step);
      else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        turnSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, mutate, undo, redo]);

  // --- commands -----------------------------------------------------------

  function turnSelected() {
    if (!selectedId) return;
    mutate((prev) =>
      prev.map((p) =>
        p.id === selectedId
          ? { ...p, rotation: (((p.rotation + 90) % 360) as Rotation) }
          : p,
      ),
    );
  }

  async function addPiece(kind: FurnitureKind) {
    const size = FURNITURE_DEFAULT_SIZE[kind];
    const n = pieces.filter((p) => p.kind === kind).length + 1;
    const spot = findFreeSpot(pieces, size.widthCm, size.depthCm, floor);
    setBusy(true);
    const res = await saveRackAction(null, {
      name: `${FURNITURE_DEFAULT_NAME[kind]} ${n}`,
      kind,
      rows: size.rows,
      cols: size.cols,
      xCm: spot.xCm,
      yCm: spot.yCm,
      widthCm: size.widthCm,
      depthCm: size.depthCm,
      rotation: 0,
      note: "",
      active: true,
    });
    setBusy(false);
    if (!res.ok || !res.id) {
      toast.error(res.userMessage ?? "That could not be added.");
      return;
    }
    const piece: PlannerPiece = {
      id: res.id,
      name: `${FURNITURE_DEFAULT_NAME[kind]} ${n}`,
      kind,
      rows: size.rows,
      cols: size.cols,
      xCm: spot.xCm,
      yCm: spot.yCm,
      widthCm: size.widthCm,
      depthCm: size.depthCm,
      rotation: 0,
      note: "",
      active: true,
      itemCount: 0,
    };
    mutate((prev) => [...prev, piece], false);
    setSelectedId(piece.id);
  }

  /** Name, kind, shelves and note — everything that is not geometry. */
  async function saveDetails(patch: Partial<PlannerPiece>) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setBusy(true);
    const res = await saveRackAction(selected.id, {
      name: next.name,
      kind: next.kind,
      rows: next.rows,
      cols: next.cols,
      xCm: next.xCm,
      yCm: next.yCm,
      widthCm: next.widthCm,
      depthCm: next.depthCm,
      rotation: next.rotation,
      note: next.note,
      active: next.active,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.userMessage ?? "That could not be saved.");
      return;
    }
    mutate((prev) => prev.map((p) => (p.id === next.id ? next : p)), false);
  }

  async function removeSelected() {
    if (!selected) return;
    if (selected.itemCount > 0) {
      const ok = window.confirm(
        `${selected.itemCount} medicine${selected.itemCount === 1 ? "" : "s"} ` +
          `${selected.itemCount === 1 ? "is" : "are"} kept on ${selected.name}. ` +
          `Deleting it leaves ${selected.itemCount === 1 ? "it" : "them"} with no shelf. Delete anyway?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    const res = await deleteRackAction(selected.id);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.userMessage ?? "That could not be deleted.");
      return;
    }
    const id = selected.id;
    setSelectedId(null);
    mutate((prev) => prev.filter((p) => p.id !== id), false);
  }

  async function saveFloor(next: { floorWidthCm: number; floorDepthCm: number }) {
    setFloor(next);
    const res = await setFloorSizeAction(next);
    if (!res.ok) toast.error(res.userMessage ?? "The room size could not be saved.");
  }

  // --- view ---------------------------------------------------------------

  const fit = useCallback(() => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const pad = 48;
    const z = Math.min(
      (box.width - pad * 2) / floor.floorWidthCm,
      (box.height - pad * 2) / floor.floorDepthCm,
    );
    const nz = Math.max(0.15, Math.min(4, z));
    setZoom(nz);
    setPan({
      x: (box.width - floor.floorWidthCm * nz) / 2,
      y: (box.height - floor.floorDepthCm * nz) / 2,
    });
  }, [floor]);

  useEffect(() => {
    fit();
    // Only on mount: re-fitting whenever the room resizes would yank the view
    // out from under somebody typing a new width.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let x = 0; x <= floor.floorWidthCm; x += GRID_MINOR) {
      lines.push({ x1: x, y1: 0, x2: x, y2: floor.floorDepthCm, major: x % GRID_MAJOR === 0 });
    }
    for (let y = 0; y <= floor.floorDepthCm; y += GRID_MINOR) {
      lines.push({ x1: 0, y1: y, x2: floor.floorWidthCm, y2: y, major: y % GRID_MAJOR === 0 });
    }
    return lines;
  }, [floor]);

  const handleSize = 7 / zoom;

  return (
    <div className="flex flex-col gap-3">
      {/* ---- toolbar ---- */}
      <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-cream-50 p-2">
        <span className="pl-1 pr-1 text-[12px] font-semibold uppercase tracking-wide text-sage-500">
          Add
        </span>
        {FURNITURE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => void addPiece(k)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-[8px] border border-line bg-white px-2.5 py-1.5 text-[13px] font-medium text-sage-900 hover:bg-cream-200 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {FURNITURE_LABEL[k]}
          </button>
        ))}

        <div className="mx-1 h-6 w-px bg-line" />

        <button
          type="button"
          onClick={undo}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className="rounded-[8px] p-2 text-sage-700 hover:bg-cream-200"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={redo}
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          className="rounded-[8px] p-2 text-sage-700 hover:bg-cream-200"
        >
          <Redo2 className="h-4 w-4" />
        </button>

        <div className="mx-1 h-6 w-px bg-line" />

        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.15, z / 1.2))}
          aria-label="Zoom out"
          className="rounded-[8px] p-2 text-sage-700 hover:bg-cream-200"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[46px] text-center text-[12px] tabular-nums text-sage-500">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(4, z * 1.2))}
          aria-label="Zoom in"
          className="rounded-[8px] p-2 text-sage-700 hover:bg-cream-200"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={fit}
          aria-label="Fit the whole room on screen"
          title="Fit to view"
          className="rounded-[8px] p-2 text-sage-700 hover:bg-cream-200"
        >
          <Maximize2 className="h-4 w-4" />
        </button>

        <div className="ml-auto flex items-center gap-2 pr-1 text-[12px]">
          {saving ? (
            <span className="inline-flex items-center gap-1 text-sage-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving
            </span>
          ) : dirty ? (
            <span className="text-warn-600">Unsaved</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-ok-600">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_290px]">
        {/* ---- the room ---- */}
        <div className="overflow-hidden rounded-[10px] border border-line bg-cream-200">
          <svg
            ref={svgRef}
            role="application"
            aria-label="Shop floor plan. Tab to a piece of furniture, then move it with the arrow keys."
            className="h-[560px] w-full touch-none select-none"
            onPointerDown={onPointerDownCanvas}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {/* the room itself */}
              <rect
                x={0}
                y={0}
                width={floor.floorWidthCm}
                height={floor.floorDepthCm}
                fill="#fbfaf7"
                stroke="#3f4f43"
                strokeWidth={3 / zoom}
              />
              {gridLines.map((l, i) => (
                <line
                  key={i}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke={l.major ? "#c9d2c6" : "#e6eae3"}
                  strokeWidth={1 / zoom}
                />
              ))}

              {pieces.map((p) => (
                <Piece
                  key={p.id}
                  piece={p}
                  zoom={zoom}
                  selected={p.id === selectedId}
                  clash={clashing.has(p.id)}
                  outside={outside.has(p.id)}
                  onPointerDown={(e) => {
                    rememberBeforeGesture();
                    onPointerDownPiece(e, p);
                  }}
                  onFocus={() => setSelectedId(p.id)}
                />
              ))}

              {/* resize handles sit above everything, on the selected piece */}
              {selected &&
                HANDLES.map(({ h, fx, fy, cursor }) => {
                  const f = footprint(selected);
                  return (
                    <rect
                      key={h}
                      x={selected.xCm + f.w * fx - handleSize / 2}
                      y={selected.yCm + f.h * fy - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      fill="#ffffff"
                      stroke="#3f4f43"
                      strokeWidth={1.5 / zoom}
                      style={{ cursor }}
                      onPointerDown={(e) => {
                        rememberBeforeGesture();
                        onPointerDownHandle(e, selected, h);
                      }}
                    />
                  );
                })}
            </g>
          </svg>
        </div>

        {/* ---- properties ---- */}
        <div className="flex flex-col gap-3">
          <div className="rounded-[10px] border border-line bg-cream-50 p-3">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-sage-500">
              The room
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Width (cm)" htmlFor="floor-w">
                <Input
                  id="floor-w"
                  numeric
                  inputMode="numeric"
                  value={String(floor.floorWidthCm)}
                  onChange={(e) =>
                    void saveFloor({
                      ...floor,
                      floorWidthCm: Math.max(
                        100,
                        Math.min(5000, Number(e.target.value.replace(/\D/g, "")) || 100),
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Depth (cm)" htmlFor="floor-d">
                <Input
                  id="floor-d"
                  numeric
                  inputMode="numeric"
                  value={String(floor.floorDepthCm)}
                  onChange={(e) =>
                    void saveFloor({
                      ...floor,
                      floorDepthCm: Math.max(
                        100,
                        Math.min(5000, Number(e.target.value.replace(/\D/g, "")) || 100),
                      ),
                    })
                  }
                />
              </Field>
            </div>
          </div>

          {selected ? (
            <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-cream-50 p-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-sage-500">
                {FURNITURE_LABEL[selected.kind]}
              </h2>

              <Field label="Name" htmlFor="piece-name">
                <Input
                  id="piece-name"
                  value={selected.name}
                  onChange={(e) =>
                    setPieces((prev) =>
                      prev.map((p) =>
                        p.id === selected.id ? { ...p, name: e.target.value } : p,
                      ),
                    )
                  }
                  onBlur={() => void saveDetails({})}
                />
              </Field>

              <Field label="What it is" htmlFor="piece-kind">
                <Select
                  id="piece-kind"
                  value={selected.kind}
                  onChange={(e) =>
                    void saveDetails({ kind: asFurnitureKind(e.target.value) })
                  }
                >
                  {FURNITURE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {FURNITURE_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Width (cm)" htmlFor="piece-w">
                  <Input
                    id="piece-w"
                    numeric
                    inputMode="numeric"
                    value={String(selected.widthCm)}
                    onChange={(e) => {
                      const v = clampSide(Number(e.target.value.replace(/\D/g, "")) || MIN_SIDE);
                      mutate((prev) =>
                        prev.map((p) => (p.id === selected.id ? { ...p, widthCm: v } : p)),
                      );
                    }}
                  />
                </Field>
                <Field label="Depth (cm)" htmlFor="piece-d">
                  <Input
                    id="piece-d"
                    numeric
                    inputMode="numeric"
                    value={String(selected.depthCm)}
                    onChange={(e) => {
                      const v = clampSide(Number(e.target.value.replace(/\D/g, "")) || MIN_SIDE);
                      mutate((prev) =>
                        prev.map((p) => (p.id === selected.id ? { ...p, depthCm: v } : p)),
                      );
                    }}
                  />
                </Field>
              </div>

              {FURNITURE_HOLDS_STOCK[selected.kind] && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Shelves down" htmlFor="piece-rows">
                    <Input
                      id="piece-rows"
                      numeric
                      inputMode="numeric"
                      value={String(selected.rows)}
                      onChange={(e) =>
                        setPieces((prev) =>
                          prev.map((p) =>
                            p.id === selected.id
                              ? {
                                  ...p,
                                  rows: Math.max(
                                    1,
                                    Math.min(26, Number(e.target.value.replace(/\D/g, "")) || 1),
                                  ),
                                }
                              : p,
                          ),
                        )
                      }
                      onBlur={() => void saveDetails({})}
                    />
                  </Field>
                  <Field label="Across" htmlFor="piece-cols">
                    <Input
                      id="piece-cols"
                      numeric
                      inputMode="numeric"
                      value={String(selected.cols)}
                      onChange={(e) =>
                        setPieces((prev) =>
                          prev.map((p) =>
                            p.id === selected.id
                              ? {
                                  ...p,
                                  cols: Math.max(
                                    1,
                                    Math.min(26, Number(e.target.value.replace(/\D/g, "")) || 1),
                                  ),
                                }
                              : p,
                          ),
                        )
                      }
                      onBlur={() => void saveDetails({})}
                    />
                  </Field>
                </div>
              )}

              <Field label="Note" htmlFor="piece-note" hint="optional">
                <Input
                  id="piece-note"
                  value={selected.note}
                  maxLength={120}
                  placeholder="e.g. cold chain, keep locked"
                  onChange={(e) =>
                    setPieces((prev) =>
                      prev.map((p) =>
                        p.id === selected.id ? { ...p, note: e.target.value } : p,
                      ),
                    )
                  }
                  onBlur={() => void saveDetails({})}
                />
              </Field>

              {(clashing.has(selected.id) || outside.has(selected.id)) && (
                <div className="flex items-start gap-1.5 rounded-[8px] bg-warn-100 p-2 text-[12px] text-warn-600">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {outside.has(selected.id)
                      ? "This is standing outside the room."
                      : "This is standing in the same place as something else."}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                <Button variant="secondary" onClick={turnSelected}>
                  <RotateCw className="h-4 w-4" />
                  Turn
                </Button>
                <button
                  type="button"
                  onClick={() => void removeSelected()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium text-danger-600 hover:bg-danger-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>

              {selected.itemCount > 0 && (
                <p className="text-[12px] text-sage-500">
                  {selected.itemCount} medicine
                  {selected.itemCount === 1 ? " is" : "s are"} kept here.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-[10px] border border-dashed border-line bg-cream-50 p-4 text-[13px] text-sage-500">
              <p className="font-medium text-sage-900">Nothing selected</p>
              <p className="mt-1">
                Add something from the toolbar, then drag it into place. Drag the
                white squares to resize, press <b>R</b> to turn it, and use the
                arrow keys to nudge. Hold <b>Alt</b> while dragging to ignore the
                5 cm grid.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** One piece of furniture, drawn where it stands. */
function Piece({
  piece,
  zoom,
  selected,
  clash,
  outside,
  onPointerDown,
  onFocus,
}: {
  piece: PlannerPiece;
  zoom: number;
  selected: boolean;
  clash: boolean;
  outside: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onFocus: () => void;
}) {
  const f = footprint(piece);
  const style = KIND_STYLE[piece.kind];
  const holds = FURNITURE_HOLDS_STOCK[piece.kind];

  // Shelf lines are only drawn when a cell is big enough on screen to read.
  // Below that they are grey mush that makes the plan harder to use, not
  // easier, so they are simply left out.
  const cellW = (f.w / piece.cols) * zoom;
  const cellH = (f.h / piece.rows) * zoom;
  const showCells = holds && cellW > 9 && cellH > 9;

  const labelSize = Math.min(22, Math.max(11, 13 / zoom));
  const fits = f.w * zoom > 46;

  /** Which side you stand at, so an aisle can be planned. */
  const front =
    piece.rotation === 0
      ? { x1: 0, y1: f.h, x2: f.w, y2: f.h }
      : piece.rotation === 90
        ? { x1: 0, y1: 0, x2: 0, y2: f.h }
        : piece.rotation === 180
          ? { x1: 0, y1: 0, x2: f.w, y2: 0 }
          : { x1: f.w, y1: 0, x2: f.w, y2: f.h };

  return (
    <g
      transform={`translate(${piece.xCm} ${piece.yCm})`}
      tabIndex={0}
      role="button"
      aria-label={`${FURNITURE_LABEL[piece.kind]} ${piece.name}, ${f.w} by ${f.h} centimetres, at ${piece.xCm} across and ${piece.yCm} down${
        holds ? `, ${piece.rows} shelves by ${piece.cols}` : ""
      }${piece.itemCount > 0 ? `, holding ${piece.itemCount} medicines` : ""}`}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
      style={{ cursor: "move", outline: "none" }}
    >
      <rect
        width={f.w}
        height={f.h}
        rx={4}
        fill={style.fill}
        stroke={clash || outside ? "#b4453f" : selected ? "#22301f" : style.stroke}
        strokeWidth={(selected ? 3 : 1.5) / zoom}
        strokeDasharray={clash || outside ? `${6 / zoom} ${4 / zoom}` : undefined}
      />

      {showCells && (
        <g stroke={style.stroke} strokeWidth={0.6 / zoom} opacity={0.45}>
          {Array.from({ length: piece.rows - 1 }, (_, i) => (
            <line
              key={`r${i}`}
              x1={0}
              y1={((i + 1) * f.h) / piece.rows}
              x2={f.w}
              y2={((i + 1) * f.h) / piece.rows}
            />
          ))}
          {Array.from({ length: piece.cols - 1 }, (_, i) => (
            <line
              key={`c${i}`}
              x1={((i + 1) * f.w) / piece.cols}
              y1={0}
              x2={((i + 1) * f.w) / piece.cols}
              y2={f.h}
            />
          ))}
        </g>
      )}

      {holds && (
        <line
          x1={front.x1}
          y1={front.y1}
          x2={front.x2}
          y2={front.y2}
          stroke={style.stroke}
          strokeWidth={5 / zoom}
          strokeLinecap="round"
        />
      )}

      {fits && (
        <text
          x={f.w / 2}
          y={f.h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={labelSize}
          fontWeight={600}
          fill={style.text}
          style={{ pointerEvents: "none" }}
        >
          {piece.name}
        </text>
      )}
    </g>
  );
}
