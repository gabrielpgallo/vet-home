import { NextResponse } from "next/server";
import { z } from "zod";
import { withAccess } from "@/server/access";
import { apiError } from "@/server/http";
import { loadData } from "@/server/data";
import { loadBrand } from "@/server/settings";
import { financeRangeSchema } from "@/lib/finance-schema";
import { buildFinance, financeCsv } from "@/lib/finance";
import { financePdf } from "@/server/finance-pdf";
export const runtime = "nodejs";
async function handleGET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const range = financeRangeSchema.parse({
      start: params.get("start"),
      end: params.get("end"),
    });
    const format = z.enum(["pdf", "csv"]).parse(params.get("format") || "pdf");
    const data = await loadData(),
      report = buildFinance(data, range);
    const body =
      format === "csv"
        ? financeCsv(report, data.settings.companyName)
        : new Uint8Array(await financePdf(report, await loadBrand()));
    return new NextResponse(body, {
      headers: {
        "Content-Type":
          format === "csv" ? "text/csv; charset=utf-8" : "application/pdf",
        "Content-Disposition": `attachment; filename="financeiro-${range.start}-a-${range.end}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

export const GET = withAccess("finance.read", handleGET);
