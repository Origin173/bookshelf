import { ArrowDown, ArrowUp, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LanguageSwitch } from "@/app/language-switch";
import { editList } from "@/app/lists/actions";
import { ExportList } from "@/app/lists/export-button";
import { ReadingFormats } from "@/app/reading-formats";
import {
  BUTTON,
  BUTTON_PRIMARY,
  BUTTON_QUIET,
  BUTTON_ROUND,
  INPUT,
  SELECT,
} from "@/app/ui";
import { messages } from "@/lib/i18n";
import { requirePageAccount } from "@/services/account-page";
import { accountProfile } from "@/services/auth";
import { bookLists, listMembers } from "@/services/book-lists";
import { readableFormat, resumeFormat } from "@/services/catalog";
import { getServices } from "@/services/container";
import { ifAvailable } from "@/services/errors";

export default async function Lists(props: PageProps<"/lists">) {
  const account = await requirePageAccount();
  if (!account) notFound();
  const t = await messages();
  const { list, book, notice } = await props.searchParams;
  const { storage, catalog, progress } = await getServices();
  const profileId = accountProfile(account).id;
  const data = await ifAvailable(async () => {
    const [saved, shelf] = await Promise.all([
      bookLists(storage, profileId),
      catalog.browse(),
    ]);
    return { ...saved, books: shelf.books };
  });
  const selected = data?.lists.find((item) => item.id === list);
  const chosen = data?.books.find((b) => b.id === book);
  const action = editList.bind(
    null,
    account,
    data?.etag ?? null,
    selected?.id ?? "",
  );
  const writable = !!storage.writeIfMatch;
  const memberIds = new Set(selected?.books);
  const available = data?.books.filter((b) => !memberIds.has(b.id)) ?? [];
  const members = selected && data ? listMembers(selected, data.books) : [];
  const positions = members.length ? await progress.all(profileId) : undefined;
  const feedback =
    !data || notice === "unavailable"
      ? t.unavailable
      : notice === "changed"
        ? t.listsChanged
        : notice === "name"
          ? t.listNameError
          : notice === "missing"
            ? t.missing
            : notice === "saved"
              ? t.listSaved
              : "";
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className={BUTTON_QUIET}>
          <ChevronLeft aria-hidden="true" className="inline size-4" />
          {t.backToShelf}
        </Link>
        <LanguageSwitch />
      </div>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        {t.readingLists}
      </h1>
      {feedback && (
        <p role="status" className="mt-4 text-sm text-secondary">
          {feedback}{" "}
          {data && notice === "changed" && (
            <a
              href={
                selected
                  ? `/lists?list=${encodeURIComponent(selected.id)}`
                  : "/lists"
              }
              className="font-medium text-accent underline"
            >
              {t.reloadList}
            </a>
          )}
        </p>
      )}
      {data && (
        <>
          {writable && (
            <form
              action={editList.bind(null, account, data.etag, "")}
              className="mt-6 flex flex-wrap items-end gap-2"
            >
              <label className="grid min-w-0 gap-1 text-sm">
                {t.newList}
                <input name="name" required maxLength={80} className={INPUT} />
              </label>
              {chosen && <input type="hidden" name="book" value={chosen.id} />}
              <button
                name="intent"
                value="create"
                type="submit"
                className={BUTTON}
              >
                {chosen ? t.createWithBook : t.createList}
              </button>
            </form>
          )}
          {chosen && (
            <p className="mt-3 break-words text-sm text-secondary">
              {t.selectedBook} {chosen.title}
            </p>
          )}
          <nav
            aria-label={t.readingLists}
            className="mt-6 flex flex-wrap gap-2"
          >
            {data.lists.map((item) => {
              const query = new URLSearchParams({ list: item.id });
              if (chosen) query.set("book", chosen.id);
              return (
                <Link
                  key={item.id}
                  aria-current={item.id === selected?.id ? "page" : undefined}
                  className={`${item.id === selected?.id ? BUTTON_PRIMARY : BUTTON} max-w-full break-words`}
                  href={`/lists?${query}`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
          {!data.lists.length && (
            <p className="mt-6 text-secondary">{t.noLists}</p>
          )}
          {selected && (
            <section className="mt-8">
              <h2 className="break-words text-xl font-semibold">
                {selected.name}
              </h2>
              <ExportList
                key={`${account}/${selected.id}`}
                account={account}
                listId={selected.id}
                label={t.exportList}
                working={t.preparingDownload}
                failed={t.exportListFailed}
                changed={t.exportListAccountChanged}
              />
              {writable && available.length > 0 && (
                <form
                  action={action}
                  className="mt-4 flex flex-wrap items-end gap-2"
                >
                  <label className="grid min-w-0 max-w-full gap-1 text-sm">
                    {t.addBook}
                    <select
                      key={`${selected.id}-${chosen?.id ?? ""}-${data.etag}`}
                      name="book"
                      className={`${SELECT} min-w-0 max-w-full`}
                      required
                      defaultValue={
                        chosen && !memberIds.has(chosen.id) ? chosen.id : ""
                      }
                    >
                      <option value="">{t.chooseBook}</option>
                      {available.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                          {b.authors.length ? ` · ${b.authors.join(", ")}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    name="intent"
                    value="add"
                    className={BUTTON}
                  >
                    {t.addBook}
                  </button>
                </form>
              )}
              {!members.length && (
                <p className="mt-6 text-secondary">{t.emptyList}</p>
              )}
              <ul className="mt-4 divide-y divide-separator">
                {members.map((b, index) => {
                  const resume = resumeFormat(b, positions?.[b.id]);
                  const readable = resume ?? readableFormat(b);
                  return (
                    <li
                      key={b.id}
                      id={`list-book-${b.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium">{b.title}</p>
                        <p className="text-sm text-secondary">
                          {b.authors.join(", ")}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {readable && (
                          <ReadingFormats
                            book={b}
                            current={readable}
                            action={resume ? t.resume : t.read}
                            read={t.read}
                          />
                        )}
                        {writable && (
                          <form
                            action={action}
                            className="flex flex-wrap items-center gap-1"
                          >
                            <input type="hidden" name="book" value={b.id} />
                            {[
                              {
                                neighbor: members[index - 1],
                                Icon: ArrowUp,
                                label: t.moveUp,
                              },
                              {
                                neighbor: members[index + 1],
                                Icon: ArrowDown,
                                label: t.moveDown,
                              },
                            ].map(({ neighbor, Icon, label }) => (
                              <button
                                key={label}
                                name="swapWith"
                                value={neighbor?.id ?? ""}
                                type="submit"
                                disabled={!neighbor}
                                aria-label={`${label} · ${b.title}`}
                                title={label}
                                className={`${BUTTON_ROUND} inline-flex size-11 items-center justify-center`}
                              >
                                <Icon aria-hidden="true" className="size-4" />
                              </button>
                            ))}
                            <button
                              name="intent"
                              value="remove"
                              type="submit"
                              className={BUTTON_QUIET}
                            >
                              {t.removeFromList}
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {writable && (
                <details key={selected.id} className="mt-6">
                  <summary className="w-fit cursor-pointer text-sm font-medium text-accent">
                    {t.manageList}
                  </summary>
                  <form
                    action={action}
                    className="mt-3 flex flex-wrap items-end gap-2"
                  >
                    <label className="grid min-w-0 gap-1 text-sm">
                      {t.listName}
                      <input
                        name="name"
                        key={selected.name}
                        required
                        maxLength={80}
                        defaultValue={selected.name}
                        className={INPUT}
                      />
                    </label>
                    <button
                      type="submit"
                      name="intent"
                      value="rename"
                      className={BUTTON}
                    >
                      {t.renameList}
                    </button>
                  </form>
                  <details className="mt-4">
                    <summary className="w-fit cursor-pointer text-sm text-secondary">
                      {t.deleteList}
                    </summary>
                    <form action={action} className="mt-2">
                      <button
                        type="submit"
                        name="intent"
                        value="delete"
                        className={BUTTON}
                      >
                        {t.confirmDeleteList}
                      </button>
                    </form>
                  </details>
                </details>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
