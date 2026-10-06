/**
 * wordmark.tsx — the ClinicNP mark, set in type rather than shipped as art.
 *
 * The product name is derived from the enabled modules (D-025), so the mark has
 * to be derived too: a raster wordmark could not follow a module toggle. Design.md
 * §1 puts the mark in sage and navy; a pharmacy-only install shows the Faarma
 * wordmark in sage alone, and the retired orange never returns.
 *
 * This is the one place navy appears without a patient behind it — Design.md
 * sanctions it explicitly for the mark.
 */
import { cn } from "@/lib/cn";
import { CLINIC_APP_NAME } from "@/lib/app-name";

type Tone = "dark" | "light";

/** The full wordmark. `light` is for the sage-900 sidebar; `dark` for cream. */
export function Wordmark({
  name,
  tone = "dark",
  className,
}: {
  name: string;
  tone?: Tone;
  className?: string;
}) {
  // "ClinicNP" reads as Clinic + NP; anything else is set as one piece.
  const split = name === CLINIC_APP_NAME;
  const head = split ? name.slice(0, -2) : name;
  const tail = split ? name.slice(-2) : "";

  return (
    <span
      className={cn(
        "font-display text-[19px] font-bold leading-none tracking-[-0.01em]",
        tone === "light" ? "text-cream-50" : "text-sage-900",
        className,
      )}
    >
      {head}
      {tail && (
        <span className={tone === "light" ? "text-clinic-150" : "text-clinic-700"}>
          {tail}
        </span>
      )}
    </span>
  );
}

/** The compact mark for the collapsed sidebar: the name's first letter. */
export function AppMark({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        "bg-cream-50 font-display text-[17px] font-bold leading-none text-sage-900",
        className,
      )}
    >
      {name.charAt(0)}
    </span>
  );
}

/**
 * The ClinicNP logo as artwork, for the sidebar's dark panel.
 *
 * The typeset `Wordmark` above still exists and is still the fallback, because
 * the product name follows the enabled modules (D-025) and a raster cannot: a
 * pharmacy-only install calls itself Faarma, and showing it a ClinicNP logo
 * would be worse than showing it type. So this is used only when the derived
 * name really is ClinicNP, which is every install with the clinic module on.
 *
 * The file is `logo-white-trim.png` rather than `logo-white.png` — the same
 * artwork with its transparent margin cropped off, so the height here is the
 * height of the mark instead of a third of it being empty.
 */
export function AppLogo({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  if (name !== CLINIC_APP_NAME) {
    return <Wordmark name={name} tone="light" className={className} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/logo-white-trim.png"
      alt={name}
      width={1316}
      height={360}
      className={cn("h-auto w-[142px] select-none", className)}
      draggable={false}
    />
  );
}
