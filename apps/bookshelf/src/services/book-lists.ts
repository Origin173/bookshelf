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

// Only swap the two visible neighbors. An unpublished member keeps its slot
// in the saved order and returns there if it is published again.
export function swapListNeighbors(
  books: string[],
  book: string,
  neighbor: string,
  available: ReadonlySet<string>,
) {
  const visible = books.filter((id) => available.has(id));
  const index = visible.indexOf(book);
  if (
    index < 0 ||
    (visible[index - 1] !== neighbor && visible[index + 1] !== neighbor)
  )
    return false;
  const from = books.indexOf(book);
  const to = books.indexOf(neighbor);
  books[from] = neighbor;
  books[to] = book;
  return true;
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
