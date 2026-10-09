import { NextResponse } from "next/server";
import { z } from "zod";
import { forOrg } from "@/server/db";
import { withAccess } from "@/server/access";
import { apiError } from "@/server/http";
import { documentPdf } from "@/server/issued-documents";
export const runtime = "nodejs";
async function handleGET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().parse((await ctx.params).id);
    const pdf = await forOrg((db) => documentPdf(db, "prescription", id));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="prescriptions-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
export const GET = withAccess("clinical.read", handleGET);
