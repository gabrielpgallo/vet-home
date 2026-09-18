import { withAccess } from "@/server/access";
import { requestIdentity } from "@/server/context";
import { listIam, manageIam } from "@/server/iam";
export const GET = withAccess("iam.manage", async () =>
  Response.json(await listIam(requestIdentity.getStore()!), {
    headers: { "Cache-Control": "no-store" },
  }),
);
export const POST = withAccess("iam.manage", async (req) => {
  const body = await req.text();
  if (body.length > 4000)
    return Response.json(
      { error: "Formulário acima do limite." },
      { status: 413 },
    );
  return Response.json(
    await manageIam(JSON.parse(body), requestIdentity.getStore()!),
  );
});
