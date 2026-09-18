import { NextResponse } from "next/server";
import { z } from "zod";
import { forOrg, AppError } from "@/server/db";
import { withAccess } from "@/server/access";
import { apiError } from "@/server/http";
async function handleGET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = z
      .string()
      .uuid()
      .parse((await ctx.params).id);
    const file = await forOrg(
      async (db) =>
        (await db.query("SELECT name,data FROM attachments WHERE id=$1", [id]))
          .rows[0],
    );
    if (!file) throw new AppError("Arquivo não encontrado.", 404);
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resultado.pdf"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

export const GET = withAccess("clinical.read", handleGET);
