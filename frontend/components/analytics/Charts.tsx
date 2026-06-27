"use client";

import { memo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NameValue, SeriesPoint } from "@/lib/types";
import { formatCompact } from "@/lib/formatting";

const AXIS = "#9ca3af";
const GRID = "rgba(255,255,255,0.04)";

const TOOLTIP_STYLE = {
  backgroundColor: "rgba(17, 24, 39, 0.95)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "12px",
  fontSize: "13px",
  color: "#f9fafb",
  padding: "12px 14px",
  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
} as const;

/** A titled chart container matching the dashboard card style. */
export const ChartCard = memo(function ChartCard({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/[0.06] bg-bg-secondary/50 p-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-txt-primary">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-txt-tertiary">{subtitle}</p>
        )}
      </div>
      {empty ? (
        <div className="flex h-[260px] items-center justify-center text-xs text-txt-tertiary">
          No data for this range yet
        </div>
      ) : (
        <div className="h-[260px] w-full">{children}</div>
      )}
    </div>
  );
});

function fmtTime(t: string): string {
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const LineTrend = memo(function LineTrend({
  data,
  dataKey,
  color,
}: {
  data: SeriesPoint[];
  dataKey: keyof SeriesPoint;
  color: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="4 4" opacity={0.5} />
        <XAxis
          dataKey="t"
          tickFormatter={fmtTime}
          stroke={AXIS}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tick={{ fill: AXIS }}
        />
        <YAxis
          stroke={AXIS}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={50}
          tickFormatter={(v) => formatCompact(v)}
          tick={{ fill: AXIS }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={fmtTime}
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "4 4" }}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={3}
          dot={false}
          activeDot={{
            r: 6,
            strokeWidth: 2,
            stroke: color,
            fill: "#fff",
          }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});

export const AreaTrend = memo(function AreaTrend({
  data,
  dataKey,
  color,
}: {
  data: SeriesPoint[];
  dataKey: keyof SeriesPoint;
  color: string;
}) {
  const id = `grad-${String(dataKey)}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.6} />
            <stop offset="50%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="4 4" opacity={0.5} />
        <XAxis
          dataKey="t"
          tickFormatter={fmtTime}
          stroke={AXIS}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tick={{ fill: AXIS }}
        />
        <YAxis
          stroke={AXIS}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={50}
          tickFormatter={(v) => formatCompact(v)}
          tick={{ fill: AXIS }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={fmtTime}
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "4 4" }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={3}
          fill={`url(#${id})`}
          activeDot={{
            r: 6,
            strokeWidth: 2,
            stroke: color,
            fill: "#fff",
          }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
});

/** Stacked input vs output tokens over time. */
export const StackedTokens = memo(function StackedTokens({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="input-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e5e5e5" stopOpacity={1} />
            <stop offset="100%" stopColor="#a1a1aa" stopOpacity={0.9} />
          </linearGradient>
          <linearGradient id="output-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#71717a" stopOpacity={1} />
            <stop offset="100%" stopColor="#52525b" stopOpacity={0.9} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="4 4" opacity={0.5} />
        <XAxis
          dataKey="t"
          tickFormatter={fmtTime}
          stroke={AXIS}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tick={{ fill: AXIS }}
        />
        <YAxis
          stroke={AXIS}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={50}
          tickFormatter={(v) => formatCompact(v)}
          tick={{ fill: AXIS }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={fmtTime}
          cursor={{ fill: "rgba(255, 255, 255, 0.03)" }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 12, fontWeight: 500 }}
          iconType="rect"
        />
        <Bar
          dataKey="input_tokens"
          name="Input"
          stackId="t"
          fill="url(#input-gradient)"
          radius={[0, 0, 0, 0]}
          isAnimationActive={false}
        />
        <Bar
          dataKey="output_tokens"
          name="Output"
          stackId="t"
          fill="url(#output-gradient)"
          radius={[6, 6, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
});

/** Horizontal bar distribution from NameValue[]. */
export const BarDist = memo(function BarDist({
  data,
  color = "#a1a1aa",
  max = 10,
}: {
  data: NameValue[];
  color?: string;
  max?: number;
}) {
  const top = data.slice(0, max);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={top}
        layout="vertical"
        margin={{ top: 8, right: 20, left: 8, bottom: 4 }}
      >
        <defs>
          <linearGradient id={`bar-gradient-${color}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.9} />
            <stop offset="100%" stopColor={color} stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} horizontal={false} strokeDasharray="4 4" opacity={0.5} />
        <XAxis
          type="number"
          stroke={AXIS}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tick={{ fill: AXIS }}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke={AXIS}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={120}
          tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + "…" : v)}
          tick={{ fill: AXIS }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "rgba(255, 255, 255, 0.03)" }}
        />
        <Bar
          dataKey="value"
          fill={`url(#bar-gradient-${color})`}
          radius={[0, 8, 8, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
});

const PIE_COLORS = ["#f4f4f5", "#a1a1aa", "#71717a", "#52525b", "#3f3f46", "#27272a", "#d4d4d8", "#e4e4e7"];

export const PieDist = memo(function PieDist({
  data,
  colors,
}: {
  data: NameValue[];
  colors?: string[];
}) {
  const palette = colors || PIE_COLORS;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <defs>
          {palette.map((color, i) => (
            <linearGradient key={i} id={`pie-gradient-${i}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={1} />
              <stop offset="100%" stopColor={color} stopOpacity={0.7} />
            </linearGradient>
          ))}
        </defs>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={4}
          strokeWidth={0}
          isAnimationActive={false}
        >
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={`url(#pie-gradient-${i % palette.length})`}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number) => formatCompact(value)}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 16, fontWeight: 500 }}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  );
});
