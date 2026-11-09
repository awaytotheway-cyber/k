"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCents, formatCompactCents } from "@/lib/format";
import type { TrendPoint } from "@/lib/reporting/queries";

/**
 * Spend and acquisitions over time, as two stacked charts sharing an x-axis.
 *
 * Deliberately NOT one chart with two y-axes. Spend is money and acquisitions
 * are a count; putting them on two scales in one frame lets the reader infer a
 * relationship from where the lines happen to cross, which is an artifact of
 * the chosen scales and not a fact about the data. Small multiples make the
 * same comparison without inviting that mistake.
 *
 * One series per chart, so the title names it and no legend box is needed.
 */
export function TrendChart({ data, currency }: { data: TrendPoint[]; currency: string }) {
  const hasSpend = data.some((d) => d.spendCents > 0);
  const hasAcquisitions = data.some((d) => d.acquisitions > 0);

  if (!hasSpend && !hasAcquisitions) {
    return (
      <p className="py-12 text-center text-sm text-fg-muted">
        No spend or conversions in this period.
      </p>
    );
  }

  // Fewer points read better as bars; a long window reads better as an area.
  const dense = data.length > 45;

  return (
    <div className="space-y-5">
      <Panel title="Ad spend" total={formatCents(sum(data, "spendCents"), { currency })}>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={data} margin={CHART_MARGIN}>
            <defs>
              <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...X_AXIS} tickFormatter={formatDay} />
            <YAxis
              {...Y_AXIS}
              tickFormatter={(v: number) => formatCompactCents(v, { currency })}
              width={52}
            />
            <Tooltip
              cursor={CURSOR}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    label={formatFullDay(String(label))}
                    rows={[
                      {
                        swatch: "var(--chart-1)",
                        name: "Spend",
                        value: formatCents(Number(payload[0]!.value), { currency }),
                      },
                    ]}
                  />
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="spendCents"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#spendFill)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title="Attributed conversions"
        total={round1(sum(data, "acquisitions")).toLocaleString("en-US")}
      >
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={data} margin={CHART_MARGIN} barCategoryGap={dense ? 1 : "18%"}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...X_AXIS} tickFormatter={formatDay} />
            <YAxis {...Y_AXIS} allowDecimals={false} width={52} />
            <Tooltip
              cursor={{ fill: "var(--bg-subtle)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    label={formatFullDay(String(label))}
                    rows={[
                      {
                        swatch: "var(--chart-6)",
                        name: "Conversions",
                        value: round1(Number(payload[0]!.value)).toLocaleString("en-US"),
                      },
                    ]}
                  />
                ) : null
              }
            />
            <Bar
              dataKey="acquisitions"
              fill="var(--chart-6)"
              // Rounded data-end only, anchored to the baseline.
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

const CHART_MARGIN = { top: 4, right: 4, bottom: 0, left: 0 };

/** Grid and axes stay recessive: they orient, they do not compete with the data. */
const GRID = {
  stroke: "var(--border)",
  strokeDasharray: "2 4",
  vertical: false,
} as const;

const X_AXIS = {
  tickLine: false,
  axisLine: false,
  minTickGap: 28,
  tick: { fill: "var(--fg-subtle)", fontSize: 11 },
} as const;

const Y_AXIS = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--fg-subtle)", fontSize: 11 },
} as const;

const CURSOR = { stroke: "var(--border-strong)", strokeWidth: 1 };

function Panel({
  title,
  total,
  children,
}: {
  title: string;
  total: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          {title}
        </h3>
        <span className="tabular text-sm font-medium text-fg">{total}</span>
      </div>
      {children}
    </div>
  );
}

function TooltipBox({
  label,
  rows,
}: {
  label: string;
  rows: Array<{ swatch: string; name: string; value: string }>;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-surface-raised px-2.5 py-2 shadow-lg">
      <p className="text-xs font-medium text-fg-muted">{label}</p>
      {rows.map((row) => (
        <p key={row.name} className="mt-1 flex items-center gap-1.5 text-sm text-fg">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: row.swatch }}
          />
          <span className="text-fg-muted">{row.name}</span>
          <span className="tabular ml-auto pl-3 font-medium">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

function sum(data: TrendPoint[], key: "spendCents" | "acquisitions"): number {
  return data.reduce((total, point) => total + point[key], 0);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatDay(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatFullDay(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
