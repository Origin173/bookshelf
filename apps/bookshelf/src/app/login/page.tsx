import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BUTTON_PRIMARY, INPUT } from "@/app/ui";
import { publicDemo, SESSION_COOKIE, sessionUser } from "@/services/auth";

export const metadata = {
  title: "登录",
  robots: { index: false, follow: false },
};

export default async function LoginPage(props: PageProps<"/login">) {
  const jar = await cookies();
  if (publicDemo() || sessionUser(jar.get(SESSION_COOKIE)?.value))
    redirect("/");
  const { error } = await props.searchParams;
  return (
    <main
      lang="zh-CN"
      className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16"
    >
      <div>
        <p className="mb-2 text-sm text-secondary">Bookshelf</p>
        <h1 className="text-3xl font-semibold tracking-tight">登录书架</h1>
      </div>
      <form action="/login/session" method="post" className="grid gap-4">
        <label className="grid gap-2 text-sm">
          用户名
          <input
            className={INPUT}
            name="username"
            required
            maxLength={32}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <label className="grid gap-2 text-sm">
          密码
          <input
            className={INPUT}
            name="password"
            type="password"
            required
            maxLength={256}
            autoComplete="current-password"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm">
            {error === "limited"
              ? "登录尝试过多，请稍后重试。"
              : "用户名或密码不正确。"}
          </p>
        )}
        <button className={`${BUTTON_PRIMARY} mt-2`} type="submit">
          登录
        </button>
      </form>
      <p className="text-sm text-secondary">
        在手机阅读器中添加 OPDS 书库时，使用此处的用户名和密码。
      </p>
    </main>
  );
}
