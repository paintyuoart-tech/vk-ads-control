import type { Recommendation } from "@/types";

export function evaluateRules(input: { projectId: string; currentCpl: number; targetCpl: number; spend: number; results: number; clicks: number; lastSyncAt?: string }): Recommendation[] {
  const output: Recommendation[] = [];
  if (input.clicks < 10) output.push({ id: crypto.randomUUID(), projectId: input.projectId, title: "Недостаточно данных", description: "Кликов слишком мало для категоричного вывода.", severity: "info", status: "open", metric: "Клики" });
  else if (input.currentCpl > input.targetCpl * 1.3) output.push({ id: crypto.randomUUID(), projectId: input.projectId, title: "Стоимость результата выросла", description: "CPL выше планового более чем на 30%.", severity: "critical", status: "open", metric: "CPL" });
  if (input.spend >= input.targetCpl * 1.5 && input.results === 0) output.push({ id: crypto.randomUUID(), projectId: input.projectId, title: "Расход без результатов", description: "Расход достиг порога, но конверсий нет.", severity: "critical", status: "open", metric: "Расход" });
  if (input.lastSyncAt && Date.now() - new Date(input.lastSyncAt).getTime() > 86_400_000) output.push({ id: crypto.randomUUID(), projectId: input.projectId, title: "Нет свежих данных", description: "Синхронизация не выполнялась более 24 часов.", severity: "warning", status: "open", metric: "Синхронизация" });
  return output;
}
