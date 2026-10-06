"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Send, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { saveMyProfileAction } from "@/app/(doctor)/my/actions";
import { usePhoneAlerts } from "@/components/doctor/use-phone-alerts";
import { strings } from "@/lib/strings";

export interface ProfileDoctor {
  name: string;
  qualification: string;
  specialty: string;
  nmcNo: string;
  phone: string;
  email: string;
  notifyPush: boolean;
  notifyEmail: boolean;
}

/**
 * A doctor's own details, and the two switches that decide whether they hear
 * about a booking at all.
 *
 * The test button is here because turning alerts on succeeds on every phone,
 * including the ones where nothing will ever arrive — a browser in private
 * mode, a phone that has quietly withdrawn permission. Better to find out on
 * a Tuesday afternoon than on the morning somebody is waiting.
 */
export function DoctorProfile({
  doctor,
  publicKey,
  phoneAlertsReady,
  emailReady,
}: {
  doctor: ProfileDoctor;
  publicKey: string;
  phoneAlertsReady: boolean;
  emailReady: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const alerts = usePhoneAlerts(publicKey);

  const [form, setForm] = useState<ProfileDoctor>(doctor);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof ProfileDoctor>(k: K, v: ProfileDoctor[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const dirty = (Object.keys(form) as (keyof ProfileDoctor)[]).some(
    (k) => form[k] !== doctor[k],
  );

  async function save() {
    setBusy(true);
    const res = await saveMyProfileAction({
      name: form.name.trim(),
      qualification: form.qualification.trim(),
      specialty: form.specialty.trim(),
      nmcNo: form.nmcNo.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      notifyPush: form.notifyPush,
      notifyEmail: form.notifyEmail,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(strings.saved);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  async function toggleAlerts() {
    const message =
      alerts.state === "on" ? await alerts.disable() : await alerts.enable();
    if (message) toast.error(message);
    else
      toast.success(
        alerts.state === "on" ? strings.alertsOff : strings.alertsOn,
      );
  }

  async function sendTest() {
    const res = await alerts.test();
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* ---- who you are ---- */}
      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-cream-50 p-4">
        <h2 className="text-[15px] font-semibold text-sage-900">Your details</h2>
        <p className="-mt-2 text-[13px] text-sage-500">
          This is the name and the letters that go on a slip.
        </p>

        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="h-12 text-[16px]"
          />
        </Field>

        <Field label="Qualification" hint="Printed under your name">
          <Input
            value={form.qualification}
            onChange={(e) => set("qualification", e.target.value)}
            placeholder="MBBS, MD"
            className="h-12 text-[16px]"
          />
        </Field>

        <Field label="Designation" hint="Cardiologist, Pathologist, and so on">
          <Input
            value={form.specialty}
            onChange={(e) => set("specialty", e.target.value)}
            placeholder="Cardiologist"
            className="h-12 text-[16px]"
          />
        </Field>

        <Field label="NMC number">
          <Input
            value={form.nmcNo}
            onChange={(e) => set("nmcNo", e.target.value)}
            className="h-12 text-[16px]"
          />
        </Field>

        <Field label="Phone">
          <Input
            inputMode="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className="h-12 text-[16px]"
          />
        </Field>

        <Field
          label="Email"
          hint="Where a booking is emailed. Leave blank for no emails."
        >
          <Input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className="h-12 text-[16px]"
          />
        </Field>
      </section>

      {/* ---- how you hear about a booking ---- */}
      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-cream-50 p-4">
        <h2 className="text-[15px] font-semibold text-sage-900">
          When somebody is booked in with you
        </h2>

        <label className="flex items-start gap-3 text-[15px] text-sage-900">
          <input
            type="checkbox"
            checked={form.notifyPush}
            onChange={(e) => set("notifyPush", e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-sage-700"
          />
          <span>
            Alert my phone
            {!phoneAlertsReady && (
              <span className="block text-[13px] text-warn-600">
                Not switched on for this clinic yet.
              </span>
            )}
          </span>
        </label>

        <label className="flex items-start gap-3 text-[15px] text-sage-900">
          <input
            type="checkbox"
            checked={form.notifyEmail}
            onChange={(e) => set("notifyEmail", e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-sage-700"
          />
          <span>
            Email me
            {!emailReady && (
              <span className="block text-[13px] text-warn-600">
                Not switched on for this clinic yet.
              </span>
            )}
            {emailReady && !form.email.trim() && (
              <span className="block text-[13px] text-warn-600">
                Add an email address above first.
              </span>
            )}
          </span>
        </label>
      </section>

      {/* ---- this phone ---- */}
      <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-cream-50 p-4">
        <h2 className="text-[15px] font-semibold text-sage-900">
          {strings.alertsOnThisPhone}
        </h2>
        <p className="-mt-1 text-[13px] text-sage-500">
          {alerts.state === "on"
            ? strings.alertsOn
            : alerts.state === "blocked"
              ? strings.alertsBlocked
              : alerts.state === "unsupported"
                ? "Add this to your home screen and open it from there, then alerts can be turned on."
                : alerts.state === "checking"
                  ? "Checking…"
                  : strings.alertsOff}
        </p>

        <Button
          onClick={toggleAlerts}
          disabled={
            alerts.busy ||
            alerts.state === "checking" ||
            alerts.state === "unsupported" ||
            alerts.state === "blocked"
          }
          variant={alerts.state === "on" ? "secondary" : "primary"}
          className="h-12 w-full text-[16px]"
        >
          {alerts.state === "on" ? (
            <>
              <Check className="h-5 w-5" />
              {strings.turnAlertsOff}
            </>
          ) : (
            <>
              <Bell className="h-5 w-5" />
              {strings.turnAlertsOn}
            </>
          )}
        </Button>

        <Button
          onClick={sendTest}
          variant="secondary"
          disabled={alerts.busy || alerts.state !== "on"}
          className="h-12 w-full text-[16px]"
        >
          <Send className="h-5 w-5" />
          {strings.sendTestAlert}
        </Button>

        {alerts.state === "on" && (
          <p className="flex items-start gap-2 text-[12px] text-sage-500">
            <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Alerts are on for this phone only. Turn them on again on any other
            phone or tablet you want to be alerted on.
          </p>
        )}
      </section>

      {/* ---- save ---- */}
      {/* A bar, not a floating button. Sticky over a long form with nothing
          behind it lets the fields read straight through the label. */}
      <div
        className="sticky z-20 -mx-4 border-t border-line bg-cream-100 px-4 py-3"
        style={{ bottom: "calc(64px + env(safe-area-inset-bottom))" }}
      >
        <Button
          onClick={save}
          disabled={busy || !dirty || !form.name.trim()}
          className="h-12 w-full text-[16px] shadow-card"
        >
          {busy ? "Saving…" : dirty ? "Save changes" : "Nothing to save"}
        </Button>
      </div>
    </div>
  );
}
