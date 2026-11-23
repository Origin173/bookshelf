import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeScreenHelp } from "@/app/home-screen-help";
import { LanguageSwitch } from "@/app/language-switch";
import { BUTTON_PRIMARY, INPUT } from "@/app/ui";
import { messages } from "@/lib/i18n";
import { loginBook } from "@/lib/login-book";
import { publicDemo, SESSION_COOKIE, sessionUser } from "@/services/auth";

export async function generateMetadata() {
  return {
    title: (await messages()).signIn,
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage(props: PageProps<"/login">) {
  const { error, book } = await props.searchParams;
  const resume = loginBook(book);
  const jar = await cookies();
  if (publicDemo() || sessionUser(jar.get(SESSION_COOKIE)?.value))
    redirect(resume ? `/read/${resume}` : "/");
  const t = await messages();
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm text-secondary">Bookshelf</p>
          <LanguageSwitch />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t.loginTitle}
        </h1>
      </div>
      <form action="/login/session" method="post" className="grid gap-4">
        {resume && <input type="hidden" name="book" value={resume} />}
        <label className="grid gap-2 text-sm">
          {t.username}
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
          {t.password}
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
            {error === "limited" ? t.loginLimited : t.loginInvalid}
          </p>
        )}
        <button className={`${BUTTON_PRIMARY} mt-2`} type="submit">
          {t.signIn}
        </button>
      </form>
      <p className="text-sm text-secondary">{t.loginHelp}</p>
      <HomeScreenHelp />
    </main>
  );
}
