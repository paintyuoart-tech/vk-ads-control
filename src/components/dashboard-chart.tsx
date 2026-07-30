"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { daily as fallbackDaily } from "@/config/seed";
import type { DailyMetric } from "@/types";

export function DashboardChart({ data = fallbackDaily }: { data?: DailyMetric[] }) {
  return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}>
    <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6c5ce7" stopOpacity=".26"/><stop offset="100%" stopColor="#6c5ce7" stopOpacity=".02"/></linearGradient></defs>
    <CartesianGrid stroke="#eeeef2" vertical={false}/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#7a7f8b" }}/><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#7a7f8b" }} tickFormatter={(v) => `${v / 1000}k`}/><Tooltip formatter={(v) => `${Number(v).toLocaleString("ru-RU")} ₽`}/><Area type="monotone" dataKey="spend" stroke="#6c5ce7" strokeWidth={2.5} fill="url(#fill)"/>
  </AreaChart></ResponsiveContainer></div>;
}
