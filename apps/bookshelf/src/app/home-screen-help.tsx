import { messages } from "@/lib/i18n";

export async function HomeScreenHelp() {
  const t = await messages();
  return (
    <details className="text-sm text-secondary [@media(display-mode:standalone)]:hidden">
      <summary className="w-fit cursor-pointer">{t.homeScreen}</summary>
      <p className="mt-2 max-w-prose">{t.installHelp}</p>
    </details>
  );
}
