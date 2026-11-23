"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePageAccount } from "@/services/account-page";
import { accountProfile } from "@/services/auth";
import { bookLists, saveLists } from "@/services/book-lists";
import { getServices } from "@/services/container";
import { ifAvailable } from "@/services/errors";

export async function editList(
  renderedFor: string,
  revision: string | null,
  listId: string,
  form: FormData,
) {
  const account = await requirePageAccount();
  const back = (id: string, notice?: string): never => {
    const params = new URLSearchParams();
    if (id) params.set("list", id);
    if (notice) params.set("notice", notice);
    redirect(params.size ? `/lists?${params}` : "/lists");
  };
  if (!account || renderedFor !== account) return back("", "changed");
  const { storage, catalog } = await getServices();
  const profileId = accountProfile(account).id;
  const result = await ifAvailable(async () => {
    const { lists, etag } = await bookLists(storage, profileId);
    if (!storage.writeIfMatch || etag !== revision)
      return { id: listId, notice: "changed" };
    const intent = form.get("intent");
    const list = lists.find((l) => l.id === listId);
    const name = form.get("name");
    const book = form.get("book") ?? "";
    if (typeof book !== "string") return { id: listId, notice: "missing" };
    let selected = listId;
    if (intent === "create" || intent === "rename") {
      const label = typeof name === "string" ? name.trim() : "";
      if (
        !label ||
        label.length > 80 ||
        lists.some(
          (l) => l.name === label && (intent === "create" || l.id !== listId),
        )
      )
        return { id: listId, notice: "name" };
      if (intent === "create") {
        if (book && !(await catalog.find(book)))
          return { id: "", notice: "missing" };
        selected = crypto.randomUUID();
        lists.push({
          id: selected,
          name: label,
          books: book ? [book] : [],
        });
      } else if (list) list.name = label;
      else return { id: "", notice: "changed" };
    } else if (!list) return { id: "", notice: "changed" };
    else if (intent === "delete") {
      lists.splice(lists.indexOf(list), 1);
      selected = "";
    } else if (intent === "add" && (await catalog.find(book))) {
      if (!list.books.includes(book)) list.books.push(book);
    } else if (intent === "remove" && book) {
      list.books = list.books.filter((id) => id !== book);
    } else return { id: listId, notice: "missing" };
    return (await saveLists(storage, profileId, lists, etag))
      ? { id: selected, notice: "saved" }
      : { id: listId, notice: "changed" };
  });
  if (!result) return back(listId, "unavailable");
  if (result.notice === "saved") revalidatePath("/lists");
  back(result.id, result.notice);
}
