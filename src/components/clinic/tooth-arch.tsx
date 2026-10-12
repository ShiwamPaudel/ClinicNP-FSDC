"use client";

/**
 * The drawn tooth chart (C-039): both arches as the dentist looks into the
 * mouth, every tooth shaped as its kind looks from above — incisors a blade,
 * the canine a point, premolars an oval with a groove, molars four cusps.
 *
 * A tooth's latest mark colours it. A mark on some surfaces colours only those
 * parts of the tooth (mesial towards the midline, distal away from it, buccal
 * outside the arch, lingual inside, occlusal in the middle); a mark on no
 * surface colours the whole tooth. A missing tooth is a dashed outline.
 */
import { useId, useMemo } from "react";
import { CHART, chartLayout, type PlacedTooth, type ToothKind } from "@/lib/teeth-layout";
import { CONDITIONS, conditionLabel, toothName, type ToothRecord } from "@/lib/teeth";

const v = (name: string) => `var(--color-${name})`;

/** strong: outline and marked surfaces; soft: a whole tooth marked */
export const TONE_COLOR: Record<string, { strong: string; soft: string }> = {
  ok: { strong: v("ok-600"), soft: v("ok-100") },
  danger: { strong: v("danger-600"), soft: v("danger-100") },
  info: { strong: v("info-600"), soft: v("info-100") },
  magenta: { strong: v("magenta-600"), soft: v("magenta-100") },
  warn: { strong: v("warn-600"), soft: v("warn-100") },
  clinic: { strong: v("clinic-700"), soft: v("clinic-150") },
  sage: { strong: v("sage-600"), soft: v("sage-150") },
  gone: { strong: v("sage-300"), soft: v("cream-200") },
};

function toneFor(condition: string | undefined) {
  if (!condition) return null;
  const tone = CONDITIONS.find((c) => c.key === condition)?.tone;
  return tone ? (TONE_COLOR[tone] ?? null) : null;
}

const f = (n: number) => Math.round(n * 100) / 100;

function roundRect(w: number, d: number, r: number): string {
  const x = w / 2;
  const y = d / 2;
  return [
    `M ${f(-x + r)} ${f(-y)}`,
    `L ${f(x - r)} ${f(-y)} Q ${f(x)} ${f(-y)} ${f(x)} ${f(-y + r)}`,
    `L ${f(x)} ${f(y - r)} Q ${f(x)} ${f(y)} ${f(x - r)} ${f(y)}`,
    `L ${f(-x + r)} ${f(y)} Q ${f(-x)} ${f(y)} ${f(-x)} ${f(y - r)}`,
    `L ${f(-x)} ${f(-y + r)} Q ${f(-x)} ${f(-y)} ${f(-x + r)} ${f(-y)} Z`,
  ].join(" ");
}

/** The tooth's outline in its own frame: x along the arch, +y out of the arch. */
export function toothOutline(kind: ToothKind, w: number, d: number): string {
  const x = w / 2;
  const y = d / 2;
  switch (kind) {
    case "molar":
      return roundRect(w, d, Math.min(w, d) * 0.34);
    case "premolar":
      return roundRect(w, d, Math.min(w, d) * 0.48);
    case "canine":
      return [
        `M ${f(-x)} ${f(-y * 0.2)}`,
        `Q ${f(-x)} ${f(-y)} 0 ${f(-y)}`,
        `Q ${f(x)} ${f(-y)} ${f(x)} ${f(-y * 0.2)}`,
        `Q ${f(x * 0.85)} ${f(y * 0.55)} 0 ${f(y)}`,
        `Q ${f(-x * 0.85)} ${f(y * 0.55)} ${f(-x)} ${f(-y * 0.2)} Z`,
      ].join(" ");
    case "incisor":
      return [
        `M ${f(-x)} ${f(y * 0.3)}`,
        `Q ${f(-x)} ${f(y)} ${f(-x * 0.6)} ${f(y)}`,
        `L ${f(x * 0.6)} ${f(y)}`,
        `Q ${f(x)} ${f(y)} ${f(x)} ${f(y * 0.3)}`,
        `Q ${f(x * 0.8)} ${f(-y)} 0 ${f(-y)}`,
        `Q ${f(-x * 0.8)} ${f(-y)} ${f(-x)} ${f(y * 0.3)} Z`,
      ].join(" ");
  }
}

/** Grooves and ridges, drawn thin inside the outline. */
function toothDetail(kind: ToothKind, w: number, d: number): string {
  const x = w / 2;
  const y = d / 2;
  switch (kind) {
    case "molar":
      return `M ${f(-x * 0.45)} 0 L ${f(x * 0.45)} 0 M 0 ${f(-y * 0.45)} L 0 ${f(y * 0.45)}`;
    case "premolar":
      return `M ${f(-x * 0.5)} 0 Q 0 ${f(y * 0.18)} ${f(x * 0.5)} 0`;
    case "canine":
      return `M 0 ${f(-y * 0.35)} L 0 ${f(y * 0.55)}`;
    case "incisor":
      return `M ${f(-x * 0.7)} ${f(y * 0.55)} Q 0 ${f(y * 0.75)} ${f(x * 0.7)} ${f(y * 0.55)}`;
  }
}

/** The part of the tooth's frame each surface covers (clipped to the outline). */
function surfaceRegion(surface: string, w: number, d: number): string {
  const W = w / 2 + 2;
  const D = d / 2 + 2;
  const iw = w * 0.2;
  const id = d * 0.2;
  const poly = (pts: [number, number][]) => `M ${pts.map(([a, b]) => `${f(a)} ${f(b)}`).join(" L ")} Z`;
  switch (surface) {
    case "O":
      return poly([[-iw, -id], [iw, -id], [iw, id], [-iw, id]]);
    case "M": // towards the midline: the tooth's −x
      return poly([[-W, -D], [-iw, -id], [-iw, id], [-W, D]]);
    case "D":
      return poly([[W, -D], [iw, -id], [iw, id], [W, D]]);
    case "B": // out of the arch: +y
      return poly([[-W, D], [-iw, id], [iw, id], [W, D]]);
    case "L":
      return poly([[-W, -D], [-iw, -id], [iw, -id], [W, -D]]);
    default:
      return "";
  }
}

function Tooth({
  p,
  current,
  selected,
  disabled,
  clipId,
  onPick,
}: {
  p: PlacedTooth;
  current: ToothRecord | undefined;
  selected: boolean;
  disabled: boolean;
  clipId: string;
  onPick: (t: number) => void;
}) {
  const outline = toothOutline(p.kind, p.w, p.d);
  const tone = toneFor(current?.condition);
  const missing = current?.condition === "missing";
  const surfaces = current?.surfaces ?? "";
  const label = `${toothName(p.tooth)}${
    current ? ` — ${conditionLabel(current.condition)}${surfaces ? ` (${surfaces})` : ""}` : ""
  }`;

  const fill = !tone ? v("cream-50") : missing ? "none" : surfaces ? v("cream-50") : tone.soft;
  const stroke = tone ? tone.strong : v("clinic-500");

  const pick = () => !disabled && onPick(p.tooth);
  return (
    <g
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      }}
      className={disabled ? "group outline-none" : "group cursor-pointer outline-none"}
    >
      <title>{label}</title>
      <g transform={`translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.angle)})${p.flip ? " scale(1 -1)" : ""}`}>
        <clipPath id={clipId}>
          <path d={outline} />
        </clipPath>
        {/* chosen, or focused from the keyboard */}
        <path
          d={outline}
          transform="scale(1.28)"
          fill="none"
          stroke={v("sage-900")}
          strokeWidth={2.2}
          className={selected ? "" : "opacity-0 group-focus-visible:opacity-60"}
        />
        <path
          d={outline}
          fill={fill}
          stroke={stroke}
          strokeWidth={missing ? 1.3 : 1.8}
          strokeDasharray={missing ? "3 2.5" : undefined}
          className="transition-[fill] group-hover:brightness-95"
        />
        {tone && !missing && surfaces && (
          <g clipPath={`url(#${clipId})`}>
            {surfaces.split("").map((s) => (
              <path key={s} d={surfaceRegion(s, p.w, p.d)} fill={tone.strong} fillOpacity={0.75} />
            ))}
          </g>
        )}
        {!missing && (
          <>
            <path d={outline} transform="scale(0.68)" fill="none" stroke={tone ? tone.strong : v("clinic-150")} strokeOpacity={tone ? 0.45 : 1} strokeWidth={1.1} />
            <path d={toothDetail(p.kind, p.w, p.d)} fill="none" stroke={tone ? tone.strong : v("clinic-500")} strokeOpacity={0.55} strokeWidth={1} strokeLinecap="round" />
          </>
        )}
        {missing && (
          <path
            d={`M ${f(-p.w * 0.25)} ${f(-p.d * 0.25)} L ${f(p.w * 0.25)} ${f(p.d * 0.25)} M ${f(p.w * 0.25)} ${f(-p.d * 0.25)} L ${f(-p.w * 0.25)} ${f(p.d * 0.25)}`}
            stroke={v("sage-300")}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        )}
      </g>
      <text
        x={f(p.labelX)}
        y={f(p.labelY)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={current || selected ? 700 : 500}
        fill={tone && !missing ? tone.strong : selected ? v("sage-900") : v("sage-500")}
        className="tnum select-none"
      >
        {p.tooth}
      </text>
    </g>
  );
}

export function ToothArch({
  which,
  current,
  picked,
  canEdit,
  onPick,
}: {
  which: "permanent" | "primary" | "both";
  current: Map<number, ToothRecord>;
  picked: number[];
  canEdit: boolean;
  onPick: (tooth: number) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const layout = useMemo(() => chartLayout(which), [which]);
  const { width, height, cx, upperCy, lowerCy } = CHART;
  const mid = (upperCy + lowerCy) / 2;
  const guide = v("sage-300");
  const word = { fontSize: 12, fontWeight: 600, fill: v("clinic-700"), textAnchor: "middle" as const };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mx-auto block h-auto w-full max-w-[460px]"
      role="group"
      aria-label="Tooth chart: upper and lower teeth, the patient's right on the left"
    >
      {/* the midlines */}
      <line x1={cx} x2={cx} y1={upperCy - 70} y2={lowerCy + 70} stroke={guide} strokeWidth={1} />
      <line x1={cx - 105} x2={cx + 105} y1={mid} y2={mid} stroke={guide} strokeWidth={1} />
      <text x={cx} y={upperCy - 46} {...word}>Upper</text>
      <text x={cx} y={lowerCy + 56} {...word}>Lower</text>
      <text x={6} y={mid + 4} {...word} textAnchor="start">Right</text>
      <text x={width - 6} y={mid + 4} {...word} textAnchor="end">Left</text>

      {layout.map((p) => {
        const cur = current.get(p.tooth);
        return (
          <Tooth
            key={p.tooth}
            p={p}
            current={cur}
            selected={picked.includes(p.tooth)}
            disabled={!canEdit && !cur}
            clipId={`t${uid}-${p.tooth}`}
            onPick={onPick}
          />
        );
      })}
    </svg>
  );
}
