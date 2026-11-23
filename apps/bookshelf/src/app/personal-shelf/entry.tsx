import { ChevronDown, Star } from "lucide-react";
import { updateShelfEntry } from "@/app/personal-shelf/actions";
import { BUTTON, BUTTON_QUIET, SELECT } from "@/app/ui";
import type { messages } from "@/lib/i18n";
import { readingStatuses, type ShelfEntry } from "@/services/personal-shelf";

export function PersonalEntry({
  account,
  bookId,
  entry,
  revision,
  filters,
  writable,
  t,
}: {
  account: string;
  bookId: string;
  entry?: ShelfEntry;
  revision: string | null;
  filters: string;
  writable: boolean;
  t: Awaited<ReturnType<typeof messages>>;
}) {
  const label = (
    <>
      {entry?.favorite && (
        <>
          <Star className="size-4 fill-current" aria-hidden="true" />
          <span className="sr-only">{t.favorite}</span>
        </>
      )}
      {entry?.status ? t[entry.status] : t.myShelf}
    </>
  );
  if (!writable)
    return entry ? (
      <span className="inline-flex items-center gap-1 text-sm text-secondary">
        {label}
      </span>
    ) : null;
  return (
    <details className="max-w-full">
      <summary
        className={`${BUTTON_QUIET} inline-flex cursor-pointer items-center gap-1`}
      >
        {label}
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </summary>
      <form
        action={updateShelfEntry.bind(null, account, bookId, revision, filters)}
        className="mt-2 grid gap-3 rounded-xl bg-fill p-3 text-sm"
      >
        <label className="grid gap-1">
          {t.readingStatus}
          <select
            name="status"
            defaultValue={entry?.status ?? ""}
            className={SELECT}
          >
            <option value="">{t.unmarked}</option>
            {readingStatuses.map((s) => (
              <option key={s} value={s}>
                {t[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="favorite"
            value="1"
            defaultChecked={entry?.favorite}
          />
          {t.favorite}
        </label>
        <button type="submit" className={BUTTON}>
          {t.save}
        </button>
      </form>
    </details>
  );
}
