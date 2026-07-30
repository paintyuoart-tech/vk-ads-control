export type SheetMapping = { date: string; spend: string; impressions?: string; clicks?: string; leads?: string; messages?: string; subscriptions?: string; cpl?: string };
export async function upsertSheetRow() { return { skipped: true, message: "Синхронизация Google Sheets выключена" }; }
