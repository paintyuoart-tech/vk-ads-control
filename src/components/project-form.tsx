"use client";

import { useState } from "react";
import type { Project } from "@/types";

export function ProjectForm({ project }: { project?: Project }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;

    setState("saving");
    setMessage("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      const values = new FormData(event.currentTarget);
      const response = await fetch(`/api/projects/${encodeURIComponent(project.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(values.get("name")),
          primary_conversion: String(values.get("primary_conversion")),
          target_cpl: Number(values.get("target_cpl")),
          daily_budget: Number(values.get("daily_budget")),
          monthly_budget: Number(values.get("monthly_budget")),
          spreadsheet_id: String(values.get("spreadsheet_id") || "") || null,
          asana_project_id: String(values.get("asana_project_id") || "") || null,
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить изменения");

      setState("saved");
      setMessage("Изменения сохранены");
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      setState("error");
      setMessage(error instanceof DOMException && error.name === "AbortError"
        ? "Сервер не ответил. Попробуйте ещё раз."
        : error instanceof Error ? error.message : "Не удалось сохранить изменения");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return <form className="card panel" style={{ maxWidth: 900 }} onSubmit={save}>
    <div className="section-head"><h2>Основные данные</h2><span className="small muted">* обязательные поля</span></div>
    <div className="form-grid">
      <label>Название *<input name="name" required defaultValue={project?.name}/></label>
      <label>Идентификатор<input value={project?.slug || ""} readOnly title="Идентификатор связан с API-подключением"/></label>
      <label>Рекламная система<input value={project?.connectionType === "yandex" ? "Яндекс Директ" : project?.connectionType === "api" ? "VK Ads" : "Без API"} readOnly/></label>
      <label>Основная конверсия<input name="primary_conversion" required defaultValue={project?.primaryConversion || "Лиды"}/></label>
      <label>Плановый CPL, ₽<input name="target_cpl" type="number" min="0" step="0.01" defaultValue={project?.targetCpl || 0}/></label>
      <label>Дневной бюджет, ₽<input name="daily_budget" type="number" min="0" step="0.01" defaultValue={project?.dailyBudget || 0}/></label>
      <label>Месячный бюджет, ₽<input name="monthly_budget" type="number" min="0" step="0.01" defaultValue={project?.monthlyBudget || 0}/></label>
      <label>ID Google-таблицы<input name="spreadsheet_id" defaultValue={project?.spreadsheetId || ""} placeholder="Не подключено"/></label>
      <label>ID проекта Asana<input name="asana_project_id" defaultValue={project?.asanaProjectId || ""} placeholder="Не подключено"/></label>
    </div>
    {message && <div className={`notice ${state === "error" ? "error" : ""}`} style={{ marginTop: 20 }}>{message}</div>}
    <div className="actions" style={{ marginTop: 20 }}>
      <button className="btn primary" type="submit" disabled={state === "saving"}>
        {state === "saving" ? "Сохраняем…" : state === "saved" ? "Сохранено" : "Сохранить изменения"}
      </button>
    </div>
  </form>;
}
