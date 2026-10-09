import Link from "next/link";
import {
  CalendarCheck,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Activity,
  CalendarClock,
  Wallet,
  Percent,
  Users,
  HandCoins,
  Stethoscope,
  FlaskConical,
  ClipboardList,
  UserPlus,
  Paperclip,
  PieChart,
  MapPin,
  Banknote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getCompany } from "@/lib/repos/company";
import { getModules } from "@/lib/modules";
import { PageShell } from "@/components/app/page-shell";

interface ReportCard {
  href: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  vatOnly?: boolean;
  /** only when the clinic module is on */
  clinicOnly?: boolean;
  /** only when the pharmacy module is on */
  pharmacyOnly?: boolean;
}

const REPORTS: ReportCard[] = [
  { href: "/reports/day-close", label: "Day-close / cash summary", desc: "Bills, sales, returns, expected cash", icon: CalendarCheck },
  { href: "/reports/service-revenue", label: "Service revenue", desc: "What each service earned, after refunds", icon: ClipboardList, adminOnly: true, clinicOnly: true },
  { href: "/reports/doctors", label: "Doctor payouts", desc: "What each doctor has earned", icon: Stethoscope, adminOnly: true, clinicOnly: true },
  { href: "/reports/lab-partners", label: "Laboratory statements", desc: "Tests sent, payments made, balance", icon: FlaskConical, adminOnly: true, clinicOnly: true },
  { href: "/reports/visits", label: "Patient visit register", desc: "Every visit in a date range", icon: Users, adminOnly: true, clinicOnly: true },
  { href: "/reports/new-patients", label: "New and returning patients", desc: "Who is coming back", icon: UserPlus, adminOnly: true, clinicOnly: true },
  { href: "/reports/utilisation", label: "Diagnostics utilisation", desc: "Which departments are busy", icon: PieChart, adminOnly: true, clinicOnly: true },
  { href: "/reports/sales-register", label: "Sales register", desc: "Every invoice in a date range", icon: ReceiptText, adminOnly: true },
  { href: "/reports/purchase-register", label: "Purchase register", desc: "Every purchase entry", icon: ShoppingCart, adminOnly: true },
  { href: "/reports/profit", label: "Profit margin", desc: "Revenue, cost, margin by item", icon: TrendingUp, adminOnly: true, pharmacyOnly: true },
  { href: "/reports/moving", label: "Fast / slow moving", desc: "Best sellers and dead stock", icon: Activity, adminOnly: true, pharmacyOnly: true },
  { href: "/reports/expiry", label: "Expiry report", desc: "Stock expiring soon", icon: CalendarClock, adminOnly: true, pharmacyOnly: true },
  { href: "/reports/valuation", label: "Stock valuation", desc: "Cost and salable value", icon: Wallet, adminOnly: true, pharmacyOnly: true },
  { href: "/reports/shelf", label: "Shelf list", desc: "The shop in the order you walk it", icon: MapPin, adminOnly: true, pharmacyOnly: true },
  { href: "/reports/vat", label: "VAT report", desc: "Sales and purchase VAT summary", icon: Percent, adminOnly: true, vatOnly: true },
  { href: "/suppliers", label: "Supplier statements", desc: "Bought, paid and owed, per supplier", icon: Users, adminOnly: true },
  { href: "/dues", label: "Dues", desc: "Who owes what, and for how long", icon: HandCoins },
  { href: "/payables", label: "Payables", desc: "What is owed to suppliers and laboratories", icon: Banknote, adminOnly: true },
];

export default async function ReportsHubPage() {
  const user = await requireUser();
  const company = await getCompany();
  const modules = await getModules();
  const isAdmin = user.role === "admin";

  // A pharmacy-only shop is never offered a doctor payout report, and a
  // clinic-only one is never offered profit on medicine sales. Purchases,
  // supplier ledgers, expiry and stock value belong to both: a clinic buys
  // and keeps its own materials. No empty panels.
  const visible = REPORTS.filter(
    (r) =>
      (!r.adminOnly || isAdmin) &&
      (!r.vatOnly || company.vatRegistered) &&
      (!r.clinicOnly || modules.clinic) &&
      (!r.pharmacyOnly || modules.pharmacy),
  );

  return (
    <PageShell title="Reports">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.href}
              href={r.href}
              className="flex items-start gap-3 rounded-[10px] border border-line bg-cream-50 p-4 hover:bg-cream-200"
            >
              <div className="rounded-[8px] bg-sage-75 p-2">
                <Icon className="h-5 w-5 text-sage-700" />
              </div>
              <div>
                <div className="text-[15px] font-medium text-sage-900">{r.label}</div>
                <div className="text-[13px] text-sage-500">{r.desc}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}
