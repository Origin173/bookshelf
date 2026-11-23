"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePageAccount } from "@/services/account-page";
import { accountProfile } from "@/services/auth";
import { getServices } from "@/services/container";
import { ifAvailable } from "@/services/errors";
import { isReadingStatus, saveShelfEntry } from "@/services/personal-shelf";

export async function updateShelfEntry(
  renderedFor: string,
  bookId: string,
  revision: string | null,
  filters: string,
  form: FormData,
) {
  const account = await requirePageAccount();
  const params = new URLSearchParams(filters);
  const back = (notice: string): never => {
    params.set("shelfNotice", notice);
    redirect(`/?${params}`);
  };
  if (!account || account !== renderedFor) return back("changed");
  const status = form.get("status");
  if (status !== "" && !isReadingStatus(status)) return back("changed");
  const { catalog, storage } = await getServices();
  const saved = await ifAvailable(async () => {
    if (!storage.writeIfMatch || !(await catalog.find(bookId))) return false;
    return saveShelfEntry(
      storage,
      accountProfile(account).id,
      bookId,
      { status, favorite: form.get("favorite") === "1" },
      revision,
    );
  });
  if (!saved) return back(saved === false ? "changed" : "unavailable");
  revalidatePath("/");
  back("saved");
}
