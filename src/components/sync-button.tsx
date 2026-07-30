"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { projects } from "@/config/seed";

export function SyncButton({ projectId }: { projectId?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function sync() {
    setState("loading");
    try {
      if (projectId) {
        const response = await fetch(`/api/sync/project/${projectId}`, { method: "POST" });
        if (!response.ok) throw new Error();
      } else {
        const slugs = projects
          .filter((project) => project.connectionType !== "mock")
          .map((project) => project.slug);

        let hasSuccess = false;
        for (let index = 0; index < slugs.length; index += 3) {
          const batch = slugs.slice(index, index + 3);
          const responses = await Promise.all(
            batch.map((slug) => fetch(`/api/sync/project/${slug}`, { method: "POST" })),
          );
          hasSuccess ||= responses.some((response) => response.ok);
        }
        if (!hasSuccess) throw new Error();
      }

      setState("done");
      window.location.reload();
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2600);
    }
  }

  return (
    <button className="btn primary" onClick={sync} disabled={state === "loading"}>
      <RefreshCw size={15} className={state === "loading" ? "animate-spin" : ""} />
      {state === "loading"
        ? "Обновляем…"
        : state === "done"
          ? "Готово"
          : state === "error"
            ? "Ошибка"
            : "Обновить данные"}
    </button>
  );
}
