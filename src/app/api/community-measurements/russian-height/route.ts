import { NextResponse } from "next/server";
import { getRussianHeightMeasurements } from "@/integrations/vk-community/russian-height";

export async function GET() {
  try {
    return NextResponse.json(await getRussianHeightMeasurements());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось проанализировать сообщения сообщества" },
      { status: 502 },
    );
  }
}
