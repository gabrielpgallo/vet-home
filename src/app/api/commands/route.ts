import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCommand } from "@/server/commands";
import { requireLocalAccess } from "@/server/access";
import { apiError } from "@/server/http";
import { AppError } from "@/server/db";
export async function POST(req: NextRequest) {
  try {
    await requireLocalAccess(true);
    const text = await req.text();
    if (Buffer.byteLength(text) > 256_000)
      throw new AppError("Formulário acima do limite permitido.", 413);
    const input = z
      .object({ id: z.string().uuid(), command: z.unknown() })
      .strict()
      .parse(JSON.parse(text));
    return NextResponse.json(await runCommand(input.command, input.id));
  } catch (e) {
    return apiError(e);
  }
}
