import { redirectLocalAuth } from "@/server/local-auth-origin";
import Workspace from "@/components/workspace";
import { identity } from "@/server/access";
import { AppError } from "@/server/db";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Home() {
  await redirectLocalAuth("/");
  try {
    await identity();
  } catch (e) {
    if (e instanceof AppError)
      redirect(e.status === 401 ? "/login" : "/access");
    throw e;
  }
  return <Workspace />;
}
