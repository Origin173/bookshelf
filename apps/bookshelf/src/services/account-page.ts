import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { loginBook, loginPath } from "@/lib/login-book";
import { publicDemo, SESSION_COOKIE, sessionUser } from "@/services/auth";

export const requirePageAccount = cache(async (book?: string) => {
  if (publicDemo()) return null;
  const jar = await cookies();
  const username = sessionUser(jar.get(SESSION_COOKIE)?.value);
  if (!username) redirect(loginPath(loginBook(book)));
  return username;
});
