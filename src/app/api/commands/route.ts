import { assertPermission } from "@/server/access";
import { commandSchema } from "@/lib/domain";
import { commandPermission } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { z } from "zod";
import { runCommand } from "@/server/commands";
import { withAccess } from "@/server/access";
import { apiError } from "@/server/http";
import { AppError } from "@/server/db";
async function handlePOST(req: Request) {
  try {
    const text = await req.text();
    if (Buffer.byteLength(text) > 256_000)
      throw new AppError("Formulário acima do limite permitido.", 413);
    const input = z
      .object({ id: z.string().uuid(), command: z.unknown() })
      .strict()
      .parse(JSON.parse(text));
    const command = commandSchema.parse(input.command);
    const permission = commandPermission(command.type);
    if (!permission) throw new AppError("Ação não autorizada.", 403);
    assertPermission(permission);
    return NextResponse.json(await runCommand(command, input.id));
  } catch (e) {
    return apiError(e);
  }
}

export const POST = withAccess(null, handlePOST);
