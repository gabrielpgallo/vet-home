import { redirectLocalAuth } from "@/server/local-auth-origin";
import { Login } from "@/components/login";
import { googleReady } from "@/server/auth";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  await redirectLocalAuth("/login" + (params.error ? "?error=google" : ""));
  return (
    <Login
      ready={googleReady()}
      local={process.env.AUTH_MODE === "local"}
      callbackError={!!params.error}
    />
  );
}
