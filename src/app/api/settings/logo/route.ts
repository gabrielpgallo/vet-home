import { NextResponse } from "next/server";
import { withAccess } from "@/server/access";
import { loadBrand } from "@/server/settings";
import { AppError } from "@/server/db";
import { apiError } from "@/server/http";
export const runtime = "nodejs";
async function handleGET() {
  try {
    const { logo } = await loadBrand();
    if (!logo) throw new AppError("Logo não cadastrado.", 404);
    return new NextResponse(new Uint8Array(logo), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

export const GET = withAccess(null, handleGET);
