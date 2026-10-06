"use client";

/**
 * unit-art.tsx — crafted SVG art for the pictorial unit picker. Each item's
 * `shape` (chosen at item entry) maps to a base-unit glyph; packs (strip/box/
 * bottle) compose them. All vector, self-contained, offline-safe.
 */
import type { ItemShape, PackKind } from "@/lib/item-shape";
import { cn } from "@/lib/cn";

/** A single base unit drawn in the item's shape. `dim` fades unselected ones. */
export function ShapeIcon({
  shape,
  className,
  dim = false,
}: {
  shape: ItemShape;
  className?: string;
  dim?: boolean;
}) {
  const o = dim ? 0.32 : 1;
  const common = { className: cn("block", className), viewBox: "0 0 40 40" } as const;

  switch (shape) {
    case "capsule":
      return (
        <svg {...common} style={{ opacity: o }} aria-hidden>
          <g transform="rotate(-35 20 20)">
            <rect x="6" y="15.5" width="28" height="10" rx="5" fill="#c94a3f" />
            <path d="M20 15.5h9a5 5 0 0 1 0 10h-9z" fill="#3f7fbf" />
            <rect x="9" y="17.4" width="9" height="2.3" rx="1.15" fill="#fff" opacity="0.55" />
          </g>
        </svg>
      );
    case "tablet":
    case "strip": // a strip's base is a tablet
      return (
        <svg {...common} style={{ opacity: o }} aria-hidden>
          <circle cx="20" cy="20" r="12" fill="#f4efe1" stroke="#d6cbac" strokeWidth="1.3" />
          <line x1="20" y1="9.5" x2="20" y2="30.5" stroke="#c7bd9c" strokeWidth="1.4" />
          <ellipse cx="16" cy="15.5" rx="4" ry="2.2" fill="#fff" opacity="0.6" />
        </svg>
      );
    case "bottle":
      return (
        <svg {...common} style={{ opacity: o }} aria-hidden>
          <rect x="15.5" y="4.5" width="9" height="4" rx="1" fill="#7a4e1e" />
          <path d="M16 8.5h8l2.5 4.2V33a2 2 0 0 1-2 2H15.5a2 2 0 0 1-2-2V12.7z" fill="#bd7d32" />
          <rect x="15" y="20" width="10" height="9" rx="1" fill="#f7f1e2" />
          <rect x="17" y="12" width="3" height="18" rx="1.5" fill="#fff" opacity="0.25" />
        </svg>
      );
    case "box":
      return (
        <svg {...common} style={{ opacity: o }} aria-hidden>
          <rect x="9" y="13" width="22" height="19" rx="2" fill="#e7dfca" stroke="#cabf9b" strokeWidth="1.2" />
          <path d="M9 13l3.5-4H32l-3.5 4z" fill="#d8cca8" />
          <path d="M20 18v9M15.5 22.5h9" stroke="#b0362b" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case "tube":
      return (
        <svg {...common} style={{ opacity: o }} aria-hidden>
          <rect x="14" y="11" width="12" height="21" rx="3" fill="#eef1f3" stroke="#c6ced4" strokeWidth="1.2" />
          <rect x="17.5" y="6.5" width="5" height="5" rx="1" fill="#9aa6ad" />
          <path d="M14 30h12l-2.5 3h-7z" fill="#c6ced4" />
          <rect x="17" y="14" width="2.4" height="14" rx="1.2" fill="#fff" opacity="0.4" />
        </svg>
      );
    case "sachet":
      return (
        <svg {...common} style={{ opacity: o }} aria-hidden>
          <path d="M11 12h18v18H11z" fill="#dfe4e7" stroke="#c2cace" strokeWidth="1" />
          <path d="M11 12l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2v0H11z" fill="#c8d0d4" />
          <rect x="15" y="18" width="10" height="6" rx="1" fill="#eef1f3" opacity="0.7" />
        </svg>
      );
    case "drops":
      return (
        <svg {...common} style={{ opacity: o }} aria-hidden>
          <rect x="16" y="4.5" width="8" height="6" rx="1" fill="#3a6f4b" />
          <path d="M15 10.5h10v20a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2z" fill="#4f8f60" />
          <path d="M20 22c1.6 1.8 2.6 3 2.6 4a2.6 2.6 0 1 1-5.2 0c0-1 1-2.2 2.6-4z" fill="#bfe3ca" />
        </svg>
      );
    case "vial":
      return (
        <svg {...common} style={{ opacity: o }} aria-hidden>
          <rect x="14.5" y="8.5" width="11" height="4" rx="1" fill="#b8bec4" />
          <rect x="15.5" y="11" width="9" height="21" rx="2" fill="#e2edf2" stroke="#c1ccd2" strokeWidth="1.1" />
          <rect x="16.5" y="19" width="7" height="11" rx="1" fill="#cfe0ea" />
        </svg>
      );
  }
}

/** A container thumbnail for the left rail: loose / strip / box / bottle. */
export function PackIcon({
  kind,
  shape,
  className,
}: {
  kind: PackKind;
  shape: ItemShape;
  className?: string;
}) {
  if (kind === "loose") {
    return (
      <div className={cn("relative", className)}>
        <ShapeIcon shape={shape} className="absolute inset-0 h-full w-full -rotate-6" />
        <ShapeIcon shape={shape} className="absolute inset-0 h-full w-full translate-x-[18%] translate-y-[14%] rotate-6" />
      </div>
    );
  }
  if (kind === "bottle") return <ShapeIcon shape="bottle" className={className} />;
  if (kind === "box") return <ShapeIcon shape="box" className={className} />;
  // strip → a mini blister tray
  return (
    <svg viewBox="0 0 48 40" className={cn("block", className)} aria-hidden>
      <rect x="4" y="9" width="40" height="22" rx="4" fill="#c9cfd3" />
      <rect x="4" y="9" width="40" height="22" rx="4" fill="url(#stripSheen)" />
      <defs>
        <linearGradient id="stripSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((c) =>
        [0, 1].map((r) => (
          <g key={`${c}-${r}`} transform={`translate(${8 + c * 9.5} ${13 + r * 9})`}>
            <rect x="0" y="0" width="7.5" height="7" rx="3.5" fill="#aeb6bb" />
            <g transform="scale(0.2)">
              <ShapeIconRaw shape={shape} />
            </g>
          </g>
        )),
      )}
    </svg>
  );
}

// Raw glyph paths without <svg> wrapper, for embedding inside other SVGs.
function ShapeIconRaw({ shape }: { shape: ItemShape }) {
  if (shape === "bottle" || shape === "vial" || shape === "drops") {
    return <rect x="10" y="6" width="20" height="30" rx="6" fill="#bd7d32" />;
  }
  if (shape === "box") return <rect x="6" y="10" width="28" height="22" rx="3" fill="#e7dfca" />;
  if (shape === "capsule") {
    return (
      <g transform="rotate(-35 20 20)">
        <rect x="6" y="15.5" width="28" height="10" rx="5" fill="#c94a3f" />
        <path d="M20 15.5h9a5 5 0 0 1 0 10h-9z" fill="#3f7fbf" />
      </g>
    );
  }
  return <circle cx="20" cy="20" r="12" fill="#f4efe1" />;
}
