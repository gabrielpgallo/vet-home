import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appUrl } from "@/lib/app-url";
import { localAuthOrigin } from "@/lib/local-auth-origin";
export async function redirectLocalAuth(path: string) {
  const origin = localAuthOrigin(
    (await headers()).get("host") || "",
    appUrl(),
    Boolean(process.env.VERCEL),
  );
  if (origin) redirect(origin + path);
}
