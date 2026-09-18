import { Login } from "@/components/login";
import { googleReady } from "@/server/auth";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Login
      ready={googleReady()}
      local={process.env.AUTH_MODE === "local"}
      callbackError={!!(await searchParams).error}
    />
  );
}
