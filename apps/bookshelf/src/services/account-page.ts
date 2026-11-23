import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { publicDemo, SESSION_COOKIE, sessionUser } from "@/services/auth";

export const requirePageAccount = cache(async () => {
  if (publicDemo()) return null;
  const jar = await cookies();
  const username = sessionUser(jar.get(SESSION_COOKIE)?.value);
  if (!username) redirect("/login");
  return username;
});
