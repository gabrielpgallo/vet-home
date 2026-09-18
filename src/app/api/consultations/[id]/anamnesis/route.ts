import { z } from "zod";
import { NextResponse } from "next/server";
import { AI_AUDIO_LIMIT, AI_TEXT_LIMIT } from "@/lib/anamnesis-ai";
import { withAccess } from "@/server/access";
import { AppError } from "@/server/db";
import { apiError } from "@/server/http";
import { limitedBody } from "@/server/limited-body";
import { detectAudio } from "@/server/gemini";
import { suggestAnamnesis } from "@/server/anamnesis-service";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handlePOST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = z
      .string()
      .uuid()
      .parse((await ctx.params).id);
    const body = await limitedBody(req, AI_AUDIO_LIMIT + 150000);
    const form = await new Response(new Uint8Array(body), {
      headers: { "content-type": req.headers.get("content-type") || "" },
    }).formData();
    const text = z
      .string()
      .trim()
      .max(AI_TEXT_LIMIT)
      .parse(form.get("text") ?? "");
    const revision = z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(0))
      .parse(form.get("revision"));
    const file = form.get("audio");
    let audio;
    if (file instanceof File) {
      if (!file.size || file.size > AI_AUDIO_LIMIT)
        throw new AppError("Selecione um áudio de até 3 MB.", 413);
      const bytes = Buffer.from(await file.arrayBuffer());
      audio = { bytes, mimeType: detectAudio(bytes) };
    }
    if (!text && !audio)
      throw new AppError("Escreva suas anotações ou selecione um áudio.");
    return NextResponse.json(
      await suggestAnamnesis(id, revision, { text, audio }, req.signal),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export const POST = withAccess("clinical.write", handlePOST);
