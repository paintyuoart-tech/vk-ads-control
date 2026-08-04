import { env } from "cloudflare:workers";
import { createChatMessagesIndex, createChatMessagesTable } from "./schema";

type D1Result<T = unknown> = { results?: T[] };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
};
type D1Database = {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
};

let initialized: Promise<void> | undefined;

export function getDb(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("Хранилище истории чата временно недоступно");
  return db;
}

export async function ensureChatSchema() {
  if (!initialized) {
    const db = getDb();
    initialized = db.batch([
      db.prepare(createChatMessagesTable),
      db.prepare(createChatMessagesIndex),
    ]).then(() => undefined).catch((error) => {
      initialized = undefined;
      throw error;
    });
  }
  await initialized;
}
