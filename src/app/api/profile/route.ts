import { withAccess } from "@/server/access";
import { limitedBody } from "@/server/limited-body";
import { saveProfessionalProfile } from "@/server/professional-profile";
export const POST = withAccess("profile.write", async (req: Request) => {
  const input = JSON.parse((await limitedBody(req, 4000)).toString("utf8"));
  return Response.json(await saveProfessionalProfile(input), {
    headers: { "Cache-Control": "no-store" },
  });
});
