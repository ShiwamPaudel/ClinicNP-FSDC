"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatPaisa } from "@/lib/money";

/**
 * The 30-day trend.
 *
 * With both modules on it carries two series: sage for medicines, navy for
 * services, matching the colour each half of the product uses everywhere else
 * (Design.md §1). With one module on it stays a single series, because a
 * legend explaining one line is noise.
 */
export function SalesTrend({
  data,
  showServices = false,
}: {
  data: { label: string; value: number; services?: number }[];
  showServices?: boolean;
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#557f60" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#557f60" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="clinic" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3e6fa3" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#3e6fa3" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e3dbc6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#557f60" }}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={{ stroke: "#e3dbc6" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#557f60" }}
            tickFormatter={(v) => `${Math.round(v / 100)}`}
            width={44}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v: number, name: string) => [
              formatPaisa(v),
              name === "services" ? "Services" : showServices ? "Medicines" : "Sales",
            ]}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #e3dbc6",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#35553f"
            strokeWidth={2}
            fill="url(#sage)"
          />
          {showServices && (
            <Area
              type="monotone"
              dataKey="services"
              stroke="#234a78"
              strokeWidth={2}
              fill="url(#clinic)"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
