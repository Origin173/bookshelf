import { createHash } from "node:crypto";
import {
  type Book,
  bookKey,
  bytesSource,
  contentTypeFor,
  isUploadId,
  readZipDirectory,
  readZipEntry,
  STATE_PREFIX,
  type Storage,
  storageBookKey,
} from "@bookshelf/core";
import {
  COVER_EDGE,
  MAX_COVER_BYTES,
  MAX_UPLOAD_BYTES,
} from "@/lib/upload-limits";
import type { Shelf } from "@/services/catalog";
import { reading, writing } from "@/services/errors";

const INDEX = `${STATE_PREFIX}uploads/catalog.json`;

type Index = { books: Book[]; updatedAt?: string; etag: string | null };
type Format = "epub" | "pdf";

export async function uploadIndex(
  storage: Storage,
  previous?: Index,
): Promise<Index> {
  return reading("the web uploads", async () => {
    const found = await storage.read(
      INDEX,
      previous?.etag ? { ifNoneMatch: previous.etag } : undefined,
    );
    if (!found) return { books: [], etag: null };
    if (!found.body && previous?.etag === found.object.etag) return previous;
    const data = (await new Response(found.body).json()) as {
      version: number;
      books: Book[];
    };
    if (
      data?.version !== 1 ||
      !Array.isArray(data.books) ||
      !data.books.every(
        (b) =>
          b &&
          typeof b.title === "string" &&
          isUploadId(b.id) &&
          Array.isArray(b.authors) &&
          b.formats?.length === 1 &&
          ["pdf", "epub"].includes(b.formats[0].format) &&
          b.formats[0].file === `book.${b.formats[0].format}`,
      )
    )
      throw new Error("Invalid upload catalog");
    return {
      books: data.books,
      updatedAt: found.object.uploadedAt.toISOString(),
      etag: found.object.etag,
    };
  });
}

export function addUploads(base: Shelf, uploads: Index): Shelf {
  if (!uploads.books.length) return base;
  return {
    ...base,
    generatedAt:
      uploads.updatedAt &&
      (!base.generatedAt || uploads.updatedAt > base.generatedAt)
        ? uploads.updatedAt
        : base.generatedAt,
    books: [...base.books, ...uploads.books].sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
    uploadRevision: uploads.etag ?? undefined,
  };
}

async function matchesFormat(bytes: Uint8Array<ArrayBuffer>, format: Format) {
  const text = new TextDecoder();
  if (format === "pdf")
    return (
      /^%PDF-\d\.\d/.test(text.decode(bytes.subarray(0, 8))) &&
      text.decode(bytes.subarray(-1024)).includes("%%EOF")
    );
  const source = bytesSource(bytes);
  const directory = await readZipDirectory(source);
  const marker = directory?.get("mimetype");
  if (
    marker?.method !== 0 ||
    marker.compressedSize !== 20 ||
    !directory?.has("META-INF/container.xml") ||
    !Array.from(directory.keys()).some((name) =>
      name.toLowerCase().endsWith(".opf"),
    )
  )
    return false;
  const mime = await readZipEntry(source, marker);
  return mime !== null && text.decode(mime) === "application/epub+zip";
}

export async function importBook(
  storage: Storage,
  file: File,
  title: string,
  author: string,
  details: {
    isbn?: string;
    cover?: Uint8Array<ArrayBuffer>;
    subjects?: string[];
  } = {},
) {
  const write = storage.writeIfMatch?.bind(storage);
  if (!write) return { result: "forbidden" } as const;
  if (file.size > MAX_UPLOAD_BYTES) return { result: "tooLarge" } as const;
  const format = file.name.split(".").at(-1)?.toLowerCase();
  if (format !== "epub" && format !== "pdf")
    return { result: "invalidFile" } as const;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(await matchesFormat(bytes, format)))
    return { result: "invalidFile" } as const;
  const id = `u_${createHash("sha256").update(bytes).digest("hex")}`;
  const filename = `book.${format}`;
  const book: Book = {
    id,
    title,
    authors: author
      .split(/[;；]/)
      .map((part) => part.trim())
      .filter(Boolean),
    ...(details.isbn && { isbn: details.isbn }),
    ...(details.subjects?.length && { subjects: details.subjects }),
    formats: [{ format, file: filename, size: bytes.length }],
  };
  if (details.cover && !validThumbnail(details.cover))
    return { result: "invalidCover" } as const;
  const index = await uploadIndex(storage);
  if (index.books.some((b) => b.id === id))
    return { result: "duplicate", id } as const;
  const key = storageBookKey(bookKey(id, filename));
  // Bytes first, then the index. A retry can publish an interrupted import using the same object.
  const stored = await writing("the uploaded book", () =>
    write(key, bytes, contentTypeFor(filename), null),
  );
  if (!stored && !(await reading("the uploaded book", () => storage.head(key))))
    return { result: "conflict" } as const;
  if (details.cover) {
    const png = details.cover;
    const digest = createHash("sha256").update(png).digest("hex");
    book.cover = `cover-${digest}.png`;
    const coverKey = storageBookKey(bookKey(id, book.cover));
    const saved = await writing("the thumbnail", () =>
      write(coverKey, png, "image/png", null),
    );
    if (
      !saved &&
      !(await reading("the thumbnail", () => storage.head(coverKey)))
    )
      return { result: "conflict" } as const;
  }
  const record = new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      books: [...index.books, book],
    }),
  );
  const saved = await writing("the upload catalog", () =>
    write(INDEX, record, "application/json", index.etag),
  );
  return saved
    ? ({ result: "uploaded", id } as const)
    : ({ result: "conflict" } as const);
}

function validThumbnail(png: Uint8Array): boolean {
  if (png.length < 45 || png.length > MAX_COVER_BYTES) return false;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  return (
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452 &&
    width > 0 &&
    height > 0 &&
    width <= COVER_EDGE &&
    height <= COVER_EDGE &&
    view.getUint32(png.length - 8) === 0x49454e44
  );
}
