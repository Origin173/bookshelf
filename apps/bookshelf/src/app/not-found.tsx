import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { State, StatePage } from "@/app/state";
import { BUTTON_PRIMARY } from "@/app/ui";
import { messages } from "@/lib/i18n";

/**
 * Nothing at this address.
 *
 * Reached two ways: a URL that matches no route, and `notFound()` from the read
 * page, which calls it for a book the catalog does not have or a format that
 * book does not come in. The wording covers both without guessing which — a
 * shared link that has since been unpublished is the likeliest cause of either.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await messages()).notFound,
    robots: { index: false, follow: false },
  };
}

export default async function NotFound() {
  const t = await messages();
  return (
    <StatePage>
      <State
        icon={SearchX}
        title={t.notOnShelf}
        actions={
          <Link href="/" className={BUTTON_PRIMARY}>
            {t.backToShelf}
          </Link>
        }
      >
        <p>{t.missingLinkHelp}</p>
      </State>
    </StatePage>
  );
}
