import { z } from "zod";
import { withAccess } from "@/server/access";
import { limitedBody } from "@/server/limited-body";
import {
  finishPrescription,
  preparePrescription,
} from "@/server/signatures/service";
export const runtime = "nodejs";
export const POST = withAccess(
  "clinical.write",
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const id = z.uuid().parse((await ctx.params).id);
    const body = JSON.parse((await limitedBody(req, 280000)).toString("utf8"));
    return Response.json(await preparePrescription(id, body), {
      headers: { "Cache-Control": "no-store" },
    });
  },
);
export const PUT = withAccess(
  "clinical.write",
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const id = z.uuid().parse((await ctx.params).id);
    const body = JSON.parse((await limitedBody(req, 2000)).toString("utf8"));
    return Response.json(await finishPrescription(id, body), {
      headers: { "Cache-Control": "no-store" },
    });
  },
);
