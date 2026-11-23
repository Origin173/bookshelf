import { createHash } from "node:crypto";
import {
  type Book,
  type BookFormat,
  bookKey,
  bytesSource,
  contentTypeFor,
  isUploadId,
  parseBookKey,
  readZipDirectory,
  readZipEntry,
  STATE_PREFIX,
  type Storage,
  storageBookKey,
} from "@bookshelf/core";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import type { Shelf } from "@/services/catalog";
import { reading, writing } from "@/services/errors";
import { storeThumbnail, validThumbnail } from "@/services/thumbnails";

const INDEX = `${STATE_PREFIX}uploads/catalog.json`;

type Index = { books: Book[]; updatedAt?: string; etag: string | null };
type Format = "epub" | "pdf";
// Older versions require one original format and preserve other record fields.
type UploadRecord = Book & { addedFormat?: BookFormat };

function validRecord(book: UploadRecord) {
  if (
    !book ||
    !isUploadId(book.id) ||
    typeof book.title !== "string" ||
    !Array.isArray(book.authors) ||
    !Array.isArray(book.formats) ||
    book.formats.length !== 1
  )
    return false;
  const [original] = book.formats;
  if (
    !original ||
    !["epub", "pdf"].includes(original.format) ||
    original.file !== `book.${original.format}`
  )
    return false;
  const added = book.addedFormat;
  if (added === undefined) return true;
  const format = original.format === "pdf" ? "epub" : "pdf";
  return (
    added &&
    added.format === format &&
    typeof added.file === "string" &&
    added.file.startsWith("format-") &&
    added.file.endsWith(`.${format}`) &&
    parseBookKey(bookKey(book.id, added.file)) !== null
  );
}

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
      books: UploadRecord[];
    };
    if (
      data?.version !== 1 ||
      !Array.isArray(data.books) ||
      !data.books.every(validRecord)
    )
      throw new Error("Invalid upload catalog");
    return {
      books: data.books.map(({ addedFormat, ...book }) =>
        addedFormat
          ? { ...book, formats: [...book.formats, addedFormat] }
          : book,
      ),
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

type Details = {
  isbn?: string;
  cover?: Uint8Array<ArrayBuffer>;
  subjects?: string[];
};

export function importBook(
  storage: Storage,
  file: File,
  title: string,
  author: string,
  details: Details = {},
) {
  return saveUpload(storage, file, { title, author, ...details });
}

export function appendFormat(storage: Storage, file: File, bookId: string) {
  return saveUpload(storage, file, { bookId });
}

async function saveUpload(
  storage: Storage,
  file: File,
  details: ({ title: string; author: string } & Details) | { bookId: string },
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
  const digest = createHash("sha256").update(bytes).digest("hex");
  const firstId = `u_${digest}`;
  const index = await uploadIndex(storage);
  const appendedFile = `format-${digest}.${format}`;
  const duplicate = index.books.find(
    (b) => b.id === firstId || b.formats.some((f) => f.file === appendedFile),
  );
  let book: Book;
  let cover: Uint8Array<ArrayBuffer> | undefined;
  const filename = "bookId" in details ? appendedFile : `book.${format}`;
  const entry = { format, file: filename, size: bytes.length };
  if ("bookId" in details) {
    const existing = index.books.find((b) => b.id === details.bookId);
    if (!existing) return { result: "missing" } as const;
    if (existing.formats.some((f) => f.file === appendedFile))
      return { result: "formatAdded", id: existing.id } as const;
    if (existing.formats.some((f) => f.format === format))
      return { result: "formatExists", id: existing.id } as const;
    book = { ...existing, formats: [...existing.formats, entry] };
  } else {
    cover = details.cover;
    if (cover && !validThumbnail(cover))
      return { result: "invalidCover" } as const;
    book = {
      id: firstId,
      title: details.title,
      authors: details.author
        .split(/[;；]/)
        .map((part) => part.trim())
        .filter(Boolean),
      ...(details.isbn && { isbn: details.isbn }),
      ...(details.subjects?.length && { subjects: details.subjects }),
      formats: [entry],
    };
  }
  if (duplicate) return { result: "duplicate", id: duplicate.id } as const;
  const id = book.id;
  const key = storageBookKey(bookKey(id, filename));
  // Bytes first, then the index. A retry can publish an interrupted import using the same object.
  const stored = await writing("the uploaded book", () =>
    write(key, bytes, contentTypeFor(filename), null),
  );
  if (!stored && !(await reading("the uploaded book", () => storage.head(key))))
    return { result: "conflict" } as const;
  if (cover) {
    const filename = await storeThumbnail(storage, id, cover, "import");
    if (!filename) return { result: "conflict" } as const;
    book.cover = filename;
  }
  const books =
    "bookId" in details
      ? index.books.map((b) => (b.id === id ? book : b))
      : [...index.books, book];
  const record = new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      books: books.map((b) => {
        const [original, addedFormat] = b.formats;
        return addedFormat ? { ...b, formats: [original], addedFormat } : b;
      }),
    }),
  );
  const saved = await writing("the upload catalog", () =>
    write(INDEX, record, "application/json", index.etag),
  );
  return saved
    ? ({
        result: "bookId" in details ? "formatAdded" : "uploaded",
        id,
      } as const)
    : ({ result: "conflict" } as const);
}
