import Image from "next/image";
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  FlaskConical,
  Phone,
  Receipt,
  Smartphone,
  Stethoscope,
  WifiOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Wordmark } from "@/components/ui/wordmark";
import { CLINIC_APP_NAME, type ModuleFlags } from "@/lib/app-name";
import { VENDOR_NAME, SUPPORT_PHONES } from "@/lib/vendor";

/**
 * brand-panel.tsx — the half of the sign-in screen that is about the software.
 *
 * Everything here is claimed in the present tense because everything here is
 * already built. A sign-in screen that advertises what is coming is the first
 * thing a new user learns not to trust, and the list is filtered by the
 * modules actually switched on for this clinic so it can never promise a
 * screen that returns 404 (D-025).
 *
 * Sage, not navy: navy in this product means a patient is involved, and nobody
 * has signed in yet. The mark itself is the sanctioned exception, and it
 * arrives as artwork rather than as colour.
 */

/** Each icon sits on its own colour, so the list reads at a glance. */
type Tone = "info" | "ok" | "magenta" | "warn" | "clinic" | "cream";

/** Literal class strings, so Tailwind sees every one of them. */
const TONE_CLASSES: Record<Tone, string> = {
  info: "bg-info-100 text-info-600",
  ok: "bg-ok-100 text-ok-600",
  magenta: "bg-magenta-100 text-magenta-600",
  warn: "bg-warn-100 text-warn-600",
  clinic: "bg-clinic-150 text-clinic-700",
  cream: "bg-cream-50 text-sage-900",
};

interface Feature {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  body: string;
}

/** What this install can actually do, in the order it matters to it. */
export function featuresFor(modules: ModuleFlags): Feature[] {
  return modules.clinic ? clinicFeatures(modules) : pharmacyFeatures();
}

/**
 * With the Clinic module on, the clinic leads: the doctors, their patients
 * and the samples come first, and the pharmacy is folded into the one bill
 * rather than given places of its own. Six, so the two columns come out even.
 */
function clinicFeatures(modules: ModuleFlags): Feature[] {
  return [
    {
      icon: Stethoscope,
      tone: "info",
      title: "Doctor consultations, booked",
      body: "Book a patient with a doctor for a time, and a double booking is caught before it happens.",
    },
    {
      icon: Smartphone,
      tone: "magenta",
      title: "Every doctor gets an app",
      body: "Their day's consultations on their own phone, and an alert the moment a patient is booked.",
    },
    {
      icon: ClipboardList,
      tone: "clinic",
      title: "Patient visits, tracked",
      body: "One record per person, every visit on it, and each doctor's share worked out.",
    },
    {
      icon: FlaskConical,
      tone: "warn",
      title: "Samples followed to the report",
      body: "Collected, sent, come back, handed over — nothing is lost between two of them.",
    },
    {
      icon: Receipt,
      tone: "ok",
      title: "One bill for everything",
      body: modules.pharmacy
        ? "Services and medicines on one invoice, paid now or on dues tracked by name."
        : "Every service on one invoice, paid now or on dues tracked by name.",
    },
    {
      icon: WifiOff,
      tone: "cream",
      title: "Keeps working offline",
      body: "The front desk carries on when the internet stops, and catches up by itself.",
    },
  ];
}

/**
 * A pharmacy-only install. Offline before Nepali dates, deliberately: five is
 * the cap, so the last place goes to the thing a shopkeeper cannot get
 * anywhere else. Bikram Sambat dates are table stakes for anything sold here;
 * billing through a power cut is not.
 */
function pharmacyFeatures(): Feature[] {
  return [
    {
      icon: Receipt,
      tone: "ok",
      title: "Billing that prints",
      body: "Your own letterhead across the top, on a normal A4 sheet.",
    },
    {
      icon: Boxes,
      tone: "warn",
      title: "Stock that watches itself",
      body: "Batch numbers, expiry dates and a warning before anything runs out.",
    },
    {
      icon: WifiOff,
      tone: "cream",
      title: "Keeps working offline",
      body: "The counter carries on when the internet stops, and catches up by itself.",
    },
    {
      icon: CalendarDays,
      tone: "info",
      title: "Nepali dates throughout",
      body: "Bikram Sambat everywhere, and fiscal years that close properly.",
    },
  ];
}

export function BrandPanel({
  appName,
  tagline,
  modules,
}: {
  appName: string;
  tagline: string;
  modules: ModuleFlags;
}) {
  const features = featuresFor(modules);
  // The artwork spells "ClinicNP". A pharmacy-only install is called something
  // else, so it gets the wordmark set in type instead of the wrong logo. Comment to redeploy
  const useArtwork = appName === CLINIC_APP_NAME;

  return (
    // Second on a phone. Somebody opening this on the shop's tablet wants the
    // password box, not the sales pitch; the pitch is still here, underneath.
    <section className="relative order-2 flex flex-col justify-between overflow-hidden bg-sage-900 px-6 py-10 text-cream-50 sm:px-10 lg:order-1 lg:px-14 lg:py-12">
      {/* A soft wash so the panel is not a flat rectangle of green. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-sage-700/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-sage-950/50 blur-3xl"
      />

      <div className="relative">
        {useArtwork ? (
          /* Sized by width: the artwork carries a wide margin of its own, so
             setting a height makes the mark inside it far smaller than asked. */
          <Image
            src="/icons/logo-white.png"
            alt={appName}
            width={1500}
            height={800}
            priority
            className="h-auto w-[168px] sm:w-[196px]"
          />
        ) : (
          <Wordmark name={appName} tone="light" className="text-[30px]" />
        )}
      </div>

      <div className="relative my-auto pt-10 lg:pt-0">
        <h1 className="max-w-[16ch] font-display text-[30px] font-bold leading-[1.15] sm:text-[38px] lg:text-[42px]">
          {modules.clinic
            ? "The whole clinic, on one screen."
            : "The whole counter, on one screen."}
        </h1>
        <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-sage-150">
          {tagline}, built for how a Nepali{" "}
          {modules.clinic ? "clinic" : "counter"} actually runs the day.
        </p>

        <ul className="mt-9 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {features.map((f) => (
            <li key={f.title} className="flex gap-4">
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] shadow-sm ${TONE_CLASSES[f.tone]}`}
              >
                <f.icon aria-hidden="true" className="h-6 w-6" strokeWidth={2.1} />
              </span>
              <span>
                <span className="block text-[14px] font-semibold leading-snug">
                  {f.title}
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-sage-150">
                  {f.body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mt-10 flex flex-col gap-4 border-t border-cream-50/15 pt-6 text-[12.5px] text-sage-150 sm:flex-row sm:items-end sm:justify-between lg:mt-12">
        <p>
          by <span className="font-semibold text-cream-50">{VENDOR_NAME}</span>
        </p>
        <p className="sm:text-right">
          <span className="flex items-center gap-1.5 sm:justify-end">
            <Phone aria-hidden="true" className="h-3.5 w-3.5" />
            Support
          </span>
          <span className="mt-1 block font-medium tnum text-cream-50">
            {SUPPORT_PHONES.join("  ·  ")}
          </span>
        </p>
      </div>
    </section>
  );
}
