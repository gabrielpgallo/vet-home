import { redirectLocalAuth } from "@/server/local-auth-origin";
import { Reauthenticate } from "@/components/reauthenticate";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; done?: string; error?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["user", "done", "error"] as const)
    if (params[key]) query.set(key, params[key]!.slice(0, 200));
  await redirectLocalAuth("/confirmar-acesso?" + query);
  return (
    <Reauthenticate
      userId={(params.user || "").slice(0, 200)}
      done={params.done === "1"}
      failed={!!params.error}
    />
  );
}
