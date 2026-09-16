import { NextResponse } from "next/server";
import { loadData } from "@/server/data";
import { requireLocalAccess } from "@/server/access";
import { apiError } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireLocalAccess();
    return NextResponse.json(await loadData(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
