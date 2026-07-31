import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type VkMessage = { id: number; date: number; from_id: number; out?: number; text?: string };
type Conversation = {
  conversation?: { peer?: { id?: number } };
  last_message?: VkMessage;
};

export type CommunityMeasurementSummary = {
  month: number;
  week: number;
  needsReviewMonth: number;
  needsReviewWeek: number;
  analyzedConversations: number;
  updatedAt: string;
};

const GROUP_ID = 79539652;
const API_VERSION = "5.199";
const CACHE_TTL = 15 * 60_000;
const CACHE_FILE = resolve(process.cwd(), ".runtime-cache", "russian-height-measurements.json");
const ALLOWED_METHODS = new Set(["messages.getConversations", "messages.getHistory"]);
let cache: { expiresAt: number; value: CommunityMeasurementSummary } | undefined;

function loadSavedCache() {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8")) as { expiresAt: number; value: CommunityMeasurementSummary };
  } catch {
    return undefined;
  }
}

function saveCache(value: { expiresAt: number; value: CommunityMeasurementSummary }) {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(value), "utf8");
  } catch {
    // Some hosted runtimes have a read-only filesystem; the in-memory cache still works there.
  }
}

async function vkRead<T>(method: string, params: Record<string, string | number>, attempt = 0): Promise<T> {
  if (!ALLOWED_METHODS.has(method)) throw new Error("VK Community API работает только в режиме чтения");
  const token = process.env.VK_COMMUNITY_RUSSIAN_HEIGHT_TOKEN;
  if (!token) throw new Error("Ключ сообщества «Русская высота» не найден");
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    access_token: token,
    v: API_VERSION,
  });
  const response = await fetch(`https://api.vk.com/method/${method}?${query}`, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json() as { response?: T; error?: { error_code?: number; error_msg?: string } };
  if ([6, 9].includes(Number(payload.error?.error_code)) && attempt < 5) {
    await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    return vkRead<T>(method, params, attempt + 1);
  }
  if (!response.ok || payload.error || payload.response === undefined) {
    throw new Error(payload.error?.error_msg || `VK Community API вернул ошибку ${response.status}`);
  }
  return payload.response;
}

function normalized(value: string | undefined) {
  return (value || "").toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
}

function hasPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return /(?:\+?7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/.test(value)
    || (digits.length >= 10 && digits.length <= 12);
}

function classifyConversation(messages: VkMessage[]) {
  const ordered = [...messages].sort((a, b) => a.date - b.date);
  let probableAt = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const message = ordered[index];
    const text = normalized(message.text);
    if (!text) continue;
    const context = ordered.slice(Math.max(0, index - 2), Math.min(ordered.length, index + 3))
      .map((item) => normalized(item.text)).join(" ");
    const mentionsMeasurement = /(замер|замерщик|выезд специалист)/.test(text);
    const contextMentionsMeasurement = /(замер|замерщик|выезд специалист)/.test(context);
    const incomingIntent = !message.out && mentionsMeasurement
      && /(хочу|нужен|нужно|можно|давайте|готов|интерес|запис|назнач|договор|приед|подъед|дата|адрес|время|удобн)/.test(text);
    const incomingPhoneForMeasurement = !message.out && hasPhone(text) && contextMentionsMeasurement;
    const staffConfirmation = Boolean(message.out)
      && /(записали.{0,40}замер|замер.{0,40}(назначен|согласован)|договорились.{0,40}замер|замерщик.{0,40}(приед|подъед))/i.test(text);
    if (incomingIntent || incomingPhoneForMeasurement || staffConfirmation) {
      return { status: "confirmed" as const, date: message.date };
    }
    if (!message.out && (mentionsMeasurement || hasPhone(text))) probableAt ||= message.date;
  }
  return probableAt ? { status: "review" as const, date: probableAt } : { status: "none" as const, date: 0 };
}

async function recentConversations(monthStart: number) {
  const rows: Conversation[] = [];
  for (let offset = 0; offset < 1200; offset += 200) {
    const page = await vkRead<{ count: number; items: Conversation[] }>("messages.getConversations", {
      group_id: GROUP_ID, count: 200, offset, filter: "all",
    });
    const items = page.items || [];
    rows.push(...items.filter((item) => Number(item.last_message?.date || 0) >= monthStart));
    const oldest = Number(items.at(-1)?.last_message?.date || 0);
    if (items.length < 200 || oldest < monthStart) break;
  }
  return rows;
}

async function histories(conversations: Conversation[]) {
  const output: VkMessage[][] = [];
  for (const item of conversations) {
    const peerId = Number(item.conversation?.peer?.id || 0);
    if (!peerId) continue;
    const history = await vkRead<{ items: VkMessage[] }>("messages.getHistory", {
      group_id: GROUP_ID, peer_id: peerId, count: 200,
    });
    output.push(history.items || []);
    await new Promise((resolve) => setTimeout(resolve, 375));
  }
  return output;
}

export async function getRussianHeightMeasurements(): Promise<CommunityMeasurementSummary> {
  cache ||= loadSavedCache();
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  try {
    const now = new Date();
    const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    const weekStart = Math.floor((now.getTime() - 6 * 86400000) / 1000);
    const conversations = await recentConversations(monthStart);
    const rows = await histories(conversations);
    let month = 0;
    let week = 0;
    let needsReviewMonth = 0;
    let needsReviewWeek = 0;
    for (const messages of rows) {
      const result = classifyConversation(messages);
      if (result.status === "confirmed" && result.date >= monthStart) month += 1;
      if (result.status === "confirmed" && result.date >= weekStart) week += 1;
      if (result.status === "review" && result.date >= monthStart) needsReviewMonth += 1;
      if (result.status === "review" && result.date >= weekStart) needsReviewWeek += 1;
    }
    const value = { month, week, needsReviewMonth, needsReviewWeek, analyzedConversations: conversations.length, updatedAt: now.toISOString() };
    cache = { expiresAt: Date.now() + CACHE_TTL, value };
    saveCache(cache);
    return value;
  } catch (error) {
    if (cache) return cache.value;
    throw error;
  }
}
