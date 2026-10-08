import { NextResponse } from "next/server";
import { withAccess } from "@/server/access";
import { apiError } from "@/server/http";
import { findPostalCode } from "@/server/postal-code";
export const GET = withAccess(
  "registry.write",
  async (req, ctx: { params: Promise<{ cep: string }> }) => {
    try {
      const { cep } = await ctx.params;
      return NextResponse.json(await findPostalCode(cep, req.signal), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return apiError(error);
    }
  },
);
