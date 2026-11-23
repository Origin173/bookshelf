import { STATE_PREFIX, type Storage } from "@bookshelf/core";
import { reading, writing } from "@/services/errors";

export type BookList = { id: string; name: string; books: string[] };

function key(profileId: string) {
  return `${STATE_PREFIX}lists/${profileId}.json`;
}

export async function bookLists(storage: Storage, profileId: string) {
  return reading("the reading lists", async () => {
    const object = await storage.read(key(profileId));
    if (!object) return { lists: [] as BookList[], etag: null };
    const data = (await new Response(object.body).json()) as {
      version?: number;
      lists?: BookList[];
    } | null;
    if (
      data?.version !== 1 ||
      !Array.isArray(data.lists) ||
      !data.lists.every(
        (list) =>
          list &&
          typeof list.id === "string" &&
          typeof list.name === "string" &&
          Array.isArray(list.books) &&
          list.books.every((id) => typeof id === "string"),
      )
    )
      throw new Error("Invalid reading lists");
    return { lists: data.lists, etag: object.object.etag };
  });
}

export async function saveLists(
  storage: Storage,
  profileId: string,
  lists: BookList[],
  etag: string | null,
) {
  const write = storage.writeIfMatch?.bind(storage);
  if (!write) return false;
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, lists }));
  return writing("the reading lists", () =>
    write(key(profileId), bytes, "application/json", etag),
  );
}
