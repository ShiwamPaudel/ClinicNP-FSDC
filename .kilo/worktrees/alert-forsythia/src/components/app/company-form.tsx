"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { saveCompanyAction } from "@/app/(app)/settings/actions";
import { LogoUpload } from "@/components/app/logo-upload";
import type { Company } from "@/lib/repos/company";
import { strings } from "@/lib/strings";

export function CompanyForm({ initial }: { initial: Company }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, watch, setValue } = useForm<Company>({
    defaultValues: initial,
  });

  const values = watch();

  async function onSubmit(data: Company) {
    setSaving(true);
    const res = await saveCompanyAction({
      ...data,
      vatRegistered: Boolean(data.vatRegistered),
      roundingOn: Boolean(data.roundingOn),
      minRateIsCost: Boolean(data.minRateIsCost),
      expiryAlertDays: Number(data.expiryAlertDays) as 30 | 60 | 90,
      logoUrl: data.logoUrl || null,
      rackDisplay: data.rackDisplay ?? "off",
      dateCalendar: data.dateCalendar ?? "bs",
    });
    setSaving(false);
    if (res.ok) toast.success(strings.saved);
    else toast.error(res.userMessage ?? strings.somethingWentWrong);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4 rounded-[10px] border border-line bg-cream-50 p-6"
      >
        <h2 className="text-[16px] font-semibold text-sage-900">
          {strings.companyDetails}
        </h2>

        <Field label={strings.pharmacyName} htmlFor="name">
          <Input id="name" {...register("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={strings.phone} htmlFor="phone">
            <Input id="phone" {...register("phone")} />
          </Field>
          <Field label={strings.panNumber} htmlFor="pan">
            <Input id="pan" {...register("panNo")} />
          </Field>
        </div>
        <Field label={strings.address} htmlFor="address">
          <Input id="address" {...register("address")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={strings.ddaNumber} htmlFor="dda">
            <Input id="dda" {...register("ddaNo")} />
          </Field>
          <Field label={strings.invoiceFooter} htmlFor="footer">
            <Input id="footer" {...register("invoiceFooter")} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={strings.expiryAlertWindow} htmlFor="expiry">
            <Select id="expiry" {...register("expiryAlertDays")}>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </Select>
          </Field>
          <Field
            label="Calendar for dates"
            htmlFor="dateCalendar"
            hint="Date boxes open in this one. Each box can switch for a single pick. Bills and reports stay in Nepali dates."
          >
            <Select id="dateCalendar" {...register("dateCalendar")}>
              <option value="bs">Nepali (BS)</option>
              <option value="ad">English (AD)</option>
            </Select>
          </Field>
        </div>

        <LogoUpload
          value={values.logoUrl ?? null}
          onChange={(v) => setValue("logoUrl", v, { shouldDirty: true })}
        />

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input type="checkbox" {...register("vatRegistered")} />
            {strings.vatRegistered}
          </label>
          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input type="checkbox" {...register("roundingOn")} />
            {strings.roundGrandTotal}
          </label>
          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input type="checkbox" {...register("minRateIsCost")} />
            {strings.minRateIsCost}
          </label>
        </div>

        <div className="border-t border-line pt-3">
          <Field
            label="Where a medicine is kept"
            htmlFor="rackDisplay"
            hint="Shown at the counter once a medicine is found."
          >
            <Select id="rackDisplay" {...register("rackDisplay")}>
              <option value="off">Do not show</option>
              <option value="text">Write the shelf out — Rack 1 · R2C3</option>
              <option value="visual">Show the racks and light up the shelf</option>
            </Select>
          </Field>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "…" : "Save details"}
          </Button>
        </div>
      </form>

      {/* A picture of what invoice-a4.tsx prints. It is drawn separately here
          rather than rendering the real bill, which needs a whole saved bill to
          render at all — so when the bill changes, this has to change with it. */}
      <div className="h-fit rounded-[10px] border border-line bg-cream-50 p-4">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage-500">
          Top of the bill
        </div>
        {/* Not a thermal receipt any more: one A4 bill, and this is the band
            that prints across the top of it. */}
        <div className="rounded-[8px] border border-dashed border-line bg-white p-4 text-[12px] leading-relaxed text-sage-950">
          {values.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={values.logoUrl}
              alt=""
              className="mx-auto mb-2 block max-h-[80px] w-full object-contain"
            />
          ) : (
            <>
              <div className="text-center text-[15px] font-bold">
                {values.name || "Your pharmacy name"}
              </div>
              <div className="text-center text-[11px]">
                {values.address || "Address"}
                {values.phone ? ` · Ph: ${values.phone}` : ""}
              </div>
            </>
          )}
          {/* No PAN or DDA line: both are printed on the letterhead image
              itself, and the bill does not repeat them. */}
          <div className="mt-2 text-center text-[11px] font-bold tracking-[0.14em]">
            {values.vatRegistered ? "TAX INVOICE" : "INVOICE"}
          </div>
          <div className="my-2 border-t border-dashed border-line" />
          {/* Left, and last. Nothing prints below this line. */}
          <div className="text-left text-[11px] text-sage-500">
            {values.invoiceFooter || "Get well soon"}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-sage-500">
          Bills print on a normal A4 sheet. Change the header image above to
          change how this looks.
        </p>
      </div>
    </div>
  );
}
