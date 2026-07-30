import "server-only";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type AsanaTaskInput = { projectId: string; name: string; notes: string; dueOn: string };

function loadAsanaEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), "../.env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const pos = line.indexOf("=");
      if (pos > 0 && !process.env[line.slice(0, pos)]) process.env[line.slice(0, pos)] = line.slice(pos + 1);
    }
  } catch { /* Hosted environments provide variables directly. */ }
}

export function isAsanaConfigured() {
  loadAsanaEnv();
  return Boolean(process.env.ASANA_ACCESS_TOKEN);
}

export async function createAsanaTask(input: AsanaTaskInput) {
  loadAsanaEnv();
  const token = process.env.ASANA_ACCESS_TOKEN;
  if (!token) return { skipped: true, projectId: input.projectId, message: "Asana не подключена" };
  const response = await fetch("https://app.asana.com/api/1.0/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: {
      name: input.name,
      notes: input.notes,
      due_on: input.dueOn,
      projects: [input.projectId],
      workspace: process.env.ASANA_WORKSPACE_ID,
    }}),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.errors?.[0]?.message || "Ошибка Asana API");
  return { skipped: false, projectId: input.projectId, taskId: payload.data.gid, url: payload.data.permalink_url };
}
