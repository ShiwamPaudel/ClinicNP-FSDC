"use client";

/**
 * rack-map.tsx — the shop floor, drawn the way it stands.
 *
 * The same room the floor planner draws, read-only and small enough to sit
 * beside the billing lines. It is deliberately the same picture: somebody who
 * arranged the room in Settings should recognise it instantly at the counter,
 * and a map drawn in a different order from the shop is slower to read than no
 * map at all, because the person has to translate it.
 *
 * The lit cell is loud on purpose — colour, ring and a dot — because it is read
 * across a counter, in a hurry, often by somebody who started last week.
 */
import { footprint, FURNITURE_HOLDS_STOCK, asFurnitureKind } from "@/lib/furniture";

/**
 * The map needs a piece's shape and where it stands, and nothing else.
 * Declaring that here rather than taking the repo's `Rack` lets the counter
 * pass the lighter rack it carries in its offline catalog, without inventing
 * an `active` flag and a `note` it does not have.
 */
export interface MapRack {
  id: string;
  name: string;
  /** rack | shelf | desk | counter | fridge | door */
  kind?: string;
  rows: number;
  cols: number;
  xCm: number;
  yCm: number;
  widthCm: number;
  depthCm: number;
  rotation: number;
}

export interface HighlightCell {
  rackId: string;
  row: number;
  col: number;
}

interface Props {
  racks: MapRack[];
  floor?: { floorWidthCm: number; floorDepthCm: number } | null;
  /** The cell to light up. Everything else dims around it. */
  highlight?: HighlightCell | null;
  /** rackId → "row:col" → how many items stand there. */
  counts?: Record<string, Record<string, number>>;
  onCellClick?: (rackId: string, row: number, col: number) => void;
  /** Small enough to sit beside the billing lines rather than fill a page. */
  compact?: boolean;
}

const FILL: Record<string, string> = {
  rack: "#dfe7df",
  shelf: "#e7ecdf",
  desk: "#efe4d7",
  counter: "#f3e2ea",
  fridge: "#dde8f2",
  door: "#ffffff",
};
const STROKE: Record<string, string> = {
  rack: "#5c7060",
  shelf: "#6b7a55",
  desk: "#8a7256",
  counter: "#9c5f79",
  fridge: "#4f7391",
  door: "#8a8a8a",
};

export function RackMap({
  racks,
  floor = null,
  highlight = null,
  counts,
  onCellClick,
  compact = false,
}: Props) {
  if (racks.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line p-6 text-center text-sage-500">
        The shop floor has not been drawn yet.
      </p>
    );
  }

  // The room if one is known, otherwise whatever the furniture covers plus a
  // margin — a counter working from the offline catalog has the furniture but
  // not necessarily the room.
  const bounds = (() => {
    if (floor) {
      return { x: 0, y: 0, w: floor.floorWidthCm, h: floor.floorDepthCm };
    }
    const xs = racks.map((r) => r.xCm);
    const ys = racks.map((r) => r.yCm);
    const x2 = racks.map((r) => r.xCm + footprint(r).w);
    const y2 = racks.map((r) => r.yCm + footprint(r).h);
    const pad = 30;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    return {
      x: minX,
      y: minY,
      w: Math.max(60, Math.max(...x2) + pad - minX),
      h: Math.max(60, Math.max(...y2) + pad - minY),
    };
  })();

  // One stroke width that reads the same whatever the room's size, worked out
  // from the drawing's own units rather than guessed in pixels.
  const unit = Math.max(bounds.w, bounds.h) / 400;

  return (
    <svg
      viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
      className={compact ? "h-[190px] w-full" : "h-[420px] w-full"}
      role="img"
      aria-label={
        highlight
          ? `Shop floor plan with one shelf lit up`
          : `Shop floor plan showing ${racks.length} pieces of furniture`
      }
    >
      {floor && (
        <rect
          x={0}
          y={0}
          width={floor.floorWidthCm}
          height={floor.floorDepthCm}
          fill="#fbfaf7"
          stroke="#3f4f43"
          strokeWidth={unit * 2}
        />
      )}

      {racks.map((rack) => {
        const kind = asFurnitureKind(rack.kind);
        const f = footprint(rack);
        const holds = FURNITURE_HOLDS_STOCK[kind];
        const dim = highlight != null && highlight.rackId !== rack.id;

        // Cells are drawn only when one would be big enough to see. Below that
        // they are grey mush that makes the map harder to read, not easier.
        const cellW = (f.w / rack.cols / bounds.w) * 100;
        const cellH = (f.h / rack.rows / bounds.h) * 100;
        const showCells = holds && cellW > 1.6 && cellH > 2.4;

        return (
          <g key={rack.id} opacity={dim ? 0.45 : 1}>
            <rect
              x={rack.xCm}
              y={rack.yCm}
              width={f.w}
              height={f.h}
              rx={unit * 2}
              fill={FILL[kind] ?? FILL.rack}
              stroke={STROKE[kind] ?? STROKE.rack}
              strokeWidth={unit * 1.5}
            />

            {showCells &&
              Array.from({ length: rack.rows }, (_, ri) =>
                Array.from({ length: rack.cols }, (__, ci) => {
                  const row = ri + 1;
                  const col = ci + 1;
                  const lit =
                    highlight != null &&
                    highlight.rackId === rack.id &&
                    highlight.row === row &&
                    highlight.col === col;
                  const n = counts?.[rack.id]?.[`${row}:${col}`] ?? 0;
                  const gap = unit * 1.2;
                  const cw = f.w / rack.cols;
                  const ch = f.h / rack.rows;
                  const cx = rack.xCm + ci * cw + gap;
                  const cy = rack.yCm + ri * ch + gap;
                  const label = `${rack.name} row ${row} column ${col}${
                    n > 0 ? `, ${n} item${n === 1 ? "" : "s"}` : ", empty"
                  }`;

                  const common = {
                    x: cx,
                    y: cy,
                    width: Math.max(1, cw - gap * 2),
                    height: Math.max(1, ch - gap * 2),
                    rx: unit,
                    fill: lit ? "#f4d9e6" : n > 0 ? "#eef2ec" : "#ffffff",
                    stroke: lit ? "#a3336b" : n > 0 ? "#8fa593" : "#d8ded6",
                    strokeWidth: lit ? unit * 2.5 : unit,
                  };

                  if (onCellClick) {
                    return (
                      <rect
                        key={`${row}:${col}`}
                        {...common}
                        role="button"
                        tabIndex={0}
                        aria-label={label}
                        style={{ cursor: "pointer", outline: "none" }}
                        onClick={() => onCellClick(rack.id, row, col)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onCellClick(rack.id, row, col);
                          }
                        }}
                      />
                    );
                  }
                  return (
                    <rect key={`${row}:${col}`} {...common}>
                      <title>{label}</title>
                    </rect>
                  );
                }),
              )}

            {/* The lit cell gets a dot too: colour alone is not enough across
                a counter, and it survives a bad screen and a colour-blind eye. */}
            {highlight?.rackId === rack.id && showCells && (
              <circle
                cx={
                  rack.xCm +
                  (highlight.col - 0.5) * (f.w / rack.cols)
                }
                cy={
                  rack.yCm +
                  (highlight.row - 0.5) * (f.h / rack.rows)
                }
                r={Math.min(f.w / rack.cols, f.h / rack.rows) * 0.18}
                fill="#a3336b"
              />
            )}

            <text
              x={rack.xCm + f.w / 2}
              y={rack.yCm + f.h + unit * 9}
              textAnchor="middle"
              fontSize={unit * 11}
              fontWeight={600}
              fill="#3f4f43"
              style={{ pointerEvents: "none" }}
            >
              {rack.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
