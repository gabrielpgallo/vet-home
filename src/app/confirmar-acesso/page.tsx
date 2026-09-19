import { Reauthenticate } from "@/components/reauthenticate";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; done?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <Reauthenticate
      userId={(params.user || "").slice(0, 200)}
      done={params.done === "1"}
      failed={!!params.error}
    />
  );
}
