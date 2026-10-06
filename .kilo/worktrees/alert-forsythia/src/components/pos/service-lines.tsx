"use client";

/**
 * service-lines.tsx — the service block on the active bill.
 *
 * Kept as its own table rather than squeezed into the medicine table: a
 * service has no batch, no expiry and no unit ladder, and the medicine table
 * is the most-tested thing at the counter (Architecture §3.4). Services print
 * above medicines too, so the two blocks match what comes out of the printer.
 */
import { useEffect, useRef, useState } from "react";
import { Trash2, Undo2 } from "lucide-react";
import { useBillStore } from "@/stores/bill-store";
import { serviceLineAmountPaisa, type ServiceLine } from "@/lib/bill-calc";
import { toPaisa, paisaToRupees, formatPaisa } from "@/lib/money";
import type { PosDoctor, PosLabPartner, PosService } from "@/lib/pos-types";
import { cn } from "@/lib/cn";

export function ServiceLines({
  doctors,
  partners,
  services,
  canEditRate,
}: {
  doctors: PosDoctor[];
  partners: PosLabPartner[];
  services: PosService[];
  canEditRate: boolean;
}) {
  const lines = useBillStore((s) => s.serviceLines);
  if (lines.length === 0) return null;

  const byId = new Map(services.map((s) => [s.id, s]));

  return (
    <div className="mb-3 overflow-x-auto rounded-[10px] border border-clinic-150 bg-clinic-75/40 p-3">
      <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-clinic-700">
        Services
      </div>
      <table className="w-full text-[15px]">
        <thead>
          <tr className="border-b border-clinic-150 text-[12px] font-semibold uppercase tracking-wide text-sage-500">
            <th className="py-2 text-left">Service</th>
            <th className="w-40 text-left">Doctor</th>
            <th className="w-16 text-right">Qty</th>
            <th className="w-28 text-right">Rate</th>
            <th className="w-24 text-right">Disc.</th>
            <th className="w-28 text-right">Amount</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <ServiceLineRow
              key={line.lineId}
              line={line}
              service={byId.get(line.serviceId)}
              doctors={doctors}
              partners={partners}
              canEditRate={canEditRate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServiceLineRow({
  line,
  service,
  doctors,
  partners,
  canEditRate,
}: {
  line: ServiceLine;
  service: PosService | undefined;
  doctors: PosDoctor[];
  partners: PosLabPartner[];
  canEditRate: boolean;
}) {
  const {
    setServiceQty,
    setServiceRate,
    setServiceDiscount,
    setServiceDoctor,
    setServicePartner,
    applyFollowup,
    removeServiceLine,
    setActiveLine,
    activeLineId,
  } = useBillStore();

  const qtyRef = useRef<HTMLInputElement>(null);
  const [rateStr, setRateStr] = useState(String(paisaToRupees(line.ratePaisa)));
  const [discStr, setDiscStr] = useState(
    line.discountPaisa ? String(paisaToRupees(line.discountPaisa)) : "",
  );

  useEffect(() => {
    setRateStr(String(paisaToRupees(line.ratePaisa)));
  }, [line.ratePaisa]);

  useEffect(() => {
    if (activeLineId === line.lineId) qtyRef.current?.focus();
  }, [activeLineId, line.lineId]);

  const needsDoctor = service?.doctorRequired ?? false;
  const outsourced = service?.outsourced ?? false;
  const missingDoctor = needsDoctor && !line.doctorId;
  const missingPartner = outsourced && !line.labPartnerId;

  return (
    <tr
      className={cn(
        "border-b border-clinic-150/60 align-top",
        line.rateOverridden && "border-l-2 border-l-magenta-600",
      )}
      onFocus={() => setActiveLine(line.lineId)}
    >
      <td className="py-2 pr-2">
        <div className="font-medium text-sage-900">{line.name}</div>
        {service && (
          <div className="text-[12px] text-sage-500">{service.groupName}</div>
        )}

        {line.followupApplied && line.followupNote && (
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-clinic-700">
            <span>{line.followupNote}</span>
            <button
              onClick={() =>
                applyFollowup(line.lineId, {
                  ratePaisa: service?.ratePaisa ?? line.ratePaisa,
                  applied: false,
                  note: "",
                })
              }
              className="rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium text-magenta-700 underline hover:bg-magenta-100"
            >
              Charge the full rate
            </button>
          </div>
        )}

        {!line.followupApplied && line.rateOverridden && service?.followupDays ? (
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-magenta-700">
            <span>Follow-up rule overridden — charged in full.</span>
            <button
              onClick={() =>
                applyFollowup(line.lineId, {
                  ratePaisa: service.followupRatePaisa,
                  applied: true,
                  note:
                    service.followupRatePaisa === 0
                      ? `Follow-up within ${service.followupDays} days — no charge.`
                      : `Follow-up within ${service.followupDays} days — reduced rate.`,
                })
              }
              className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] underline hover:bg-magenta-100"
            >
              <Undo2 className="h-3 w-3" />
              Put it back
            </button>
          </div>
        ) : null}

        {outsourced && (
          <div className="mt-1">
            <select
              value={line.labPartnerId ?? ""}
              onChange={(e) => setServicePartner(line.lineId, e.target.value || null)}
              className={cn(
                "h-8 rounded-[6px] border bg-cream-50 px-2 text-[13px]",
                missingPartner ? "border-danger-600" : "border-line",
              )}
              aria-label="Laboratory this is sent to"
            >
              <option value="">Which laboratory?</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </td>

      <td className="pr-2">
        <select
          value={line.doctorId ?? ""}
          onChange={(e) => setServiceDoctor(line.lineId, e.target.value || null)}
          className={cn(
            "h-9 w-full rounded-[6px] border bg-cream-50 px-2 text-[13px]",
            missingDoctor ? "border-danger-600" : "border-line",
          )}
          aria-label="Doctor for this service"
        >
          <option value="">{needsDoctor ? "Choose a doctor" : "No doctor"}</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </td>

      <td className="pr-2 text-right">
        <input
          ref={qtyRef}
          inputMode="numeric"
          value={line.qty}
          onChange={(e) =>
            setServiceQty(line.lineId, Number(e.target.value.replace(/\D/g, "")) || 1)
          }
          className="h-9 w-14 rounded-[6px] border border-line bg-cream-50 px-2 text-right tnum focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-700"
          aria-label={`Quantity of ${line.name}`}
        />
      </td>

      <td className="pr-2 text-right">
        <input
          inputMode="decimal"
          value={rateStr}
          disabled={!canEditRate}
          onChange={(e) => setRateStr(e.target.value)}
          onBlur={() => {
            const n = Number(rateStr);
            if (Number.isFinite(n) && n >= 0) setServiceRate(line.lineId, toPaisa(n));
            else setRateStr(String(paisaToRupees(line.ratePaisa)));
          }}
          className={cn(
            "h-9 w-24 rounded-[6px] border bg-cream-50 px-2 text-right tnum focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-700 disabled:opacity-60",
            line.rateOverridden ? "border-magenta-600" : "border-line",
          )}
          aria-label={`Rate for ${line.name}`}
        />
        {line.rateOverridden && (
          <span
            className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-magenta-600 align-middle"
            title="This rate was changed by hand"
          />
        )}
      </td>

      <td className="pr-2 text-right">
        <input
          inputMode="decimal"
          value={discStr}
          onChange={(e) => setDiscStr(e.target.value)}
          onBlur={() => {
            const n = Number(discStr);
            setServiceDiscount(
              line.lineId,
              Number.isFinite(n) && n > 0 ? toPaisa(n) : 0,
            );
          }}
          placeholder="0"
          className="h-9 w-20 rounded-[6px] border border-line bg-cream-50 px-2 text-right tnum focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-700"
          aria-label={`Discount on ${line.name}`}
        />
      </td>

      <td className="pr-2 text-right font-medium tnum text-sage-900">
        {formatPaisa(serviceLineAmountPaisa(line))}
      </td>

      <td className="text-right">
        <button
          onClick={() => removeServiceLine(line.lineId)}
          aria-label={`Take ${line.name} off the bill`}
          className="rounded-[6px] p-1.5 text-sage-500 hover:bg-danger-100 hover:text-danger-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
