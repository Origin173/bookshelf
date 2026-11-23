import { cookies } from "next/headers";
import { BUTTON_QUIET } from "@/app/ui";
import { LOCALE_COOKIE, language } from "@/lib/i18n";

async function changeLanguage(form: FormData) {
  "use server";
  const value = form.get("language");
  if (value === "en" || value === "zh-CN")
    (await cookies()).set(LOCALE_COOKIE, value, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 31536000,
    });
}

export async function LanguageSwitch() {
  const next = (await language()) === "en" ? "zh-CN" : "en";
  return (
    <form action={changeLanguage}>
      <button
        type="submit"
        name="language"
        value={next}
        lang={next}
        className={BUTTON_QUIET}
      >
        {next === "en" ? "English" : "简体中文"}
      </button>
    </form>
  );
}
