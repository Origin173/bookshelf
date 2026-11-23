import {
  type BookFormat,
  bookKey,
  bytesSource,
  findIsbn,
  readZipDirectory,
  readZipEntry,
} from "@bookshelf/core";
import { canvasFor, imageThumbnail, png } from "@/app/admin/thumbnail";
import { openPdf } from "@/app/read/[...key]/pdf-document";
import { encodeKey } from "@/lib/http";

export type Candidate = {
  title: string;
  authors: string[];
  isbn: string;
  cover: Blob | null;
};

type ReadEntry = (
  path: string,
) => Promise<Uint8Array<ArrayBuffer> | null | undefined>;

async function epub(read: ReadEntry, withCover: boolean): Promise<Candidate> {
  const { default: Packaging } = await import("epubjs/lib/packaging.js");
  const xml = async (path: string) => {
    const bytes = await read(path);
    if (!bytes) throw new Error("Missing package document");
    return new DOMParser().parseFromString(
      new TextDecoder().decode(bytes),
      "application/xml",
    );
  };
  const container = await xml("META-INF/container.xml");
  const path = container
    .getElementsByTagNameNS("*", "rootfile")[0]
    ?.getAttribute("full-path");
  if (!path) throw new Error("Missing package path");
  const opf = await xml(path);
  const packaging = new Packaging(opf);
  const dc = (name: string) =>
    Array.from(
      opf.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", name),
      (n) => n.textContent?.trim() ?? "",
    ).filter(Boolean);
  const candidate: Candidate = {
    title: packaging.metadata.title || "",
    authors: dc("creator"),
    isbn: findIsbn(dc("identifier")) ?? "",
    cover: null,
  };
  if (!withCover) return candidate;
  const coverPath =
    packaging.coverPath ||
    Array.from(opf.getElementsByTagNameNS("*", "item"))
      .find((item) =>
        item.getAttribute("properties")?.split(/\s+/).includes("cover-image"),
      )
      ?.getAttribute("href");
  if (!coverPath) return candidate;
  try {
    // Resolve only into this archive. No URL from the package is fetched.
    const base = new URL(path, "https://epub.invalid/");
    const relative = new URL(coverPath, base);
    if (relative.origin !== base.origin) return candidate;
    const bytes = await read(decodeURIComponent(relative.pathname.slice(1)));
    if (bytes) {
      candidate.cover = await imageThumbnail(new Blob([bytes]));
    }
  } catch {
    /* The metadata still applies if the image cannot be decoded. */
  }
  return candidate;
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  return Array.isArray(value)
    ? value.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      )
    : [];
}

async function pdf(url: string, withCover: boolean): Promise<Candidate> {
  const opened = await openPdf(url);
  try {
    const candidate: Candidate = {
      title: "",
      authors: [],
      isbn: "",
      cover: null,
    };
    const meta = await opened.doc.getMetadata().catch(() => null);
    if (meta) {
      const info = meta.info as Record<string, unknown>;
      candidate.title =
        strings(meta.metadata?.get("dc:title"))[0] ||
        strings(info.Title)[0] ||
        "";
      const creators = strings(meta.metadata?.get("dc:creator"));
      candidate.authors = creators.length ? creators : strings(info.Author);
      candidate.isbn =
        findIsbn([
          ...strings(meta.metadata?.get("dc:identifier")),
          ...strings(
            info.Custom && (info.Custom as Record<string, unknown>).ISBN,
          ),
        ]) ?? "";
    }
    if (!withCover) return candidate;
    try {
      const page = await opened.doc.getPage(1);
      const size = page.getViewport({ scale: 1 });
      const canvas = canvasFor(size.width, size.height);
      const viewport = page.getViewport({ scale: canvas.width / size.width });
      await page.render({ canvas, viewport }).promise;
      candidate.cover = await png(canvas);
    } catch {
      /* A PDF without a drawable first page can still carry metadata. */
    }
    return candidate;
  } finally {
    opened.close();
  }
}

export async function inspectBook(file: File) {
  if (file.name.toLowerCase().endsWith(".epub")) {
    const source = bytesSource(new Uint8Array(await file.arrayBuffer()));
    const directory = await readZipDirectory(source);
    return epub(async (path) => {
      const entry = directory?.get(path);
      return entry && readZipEntry(source, entry);
    }, true);
  }
  const url = URL.createObjectURL(file);
  try {
    return await pdf(url, true);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function inspectStoredBook(
  id: string,
  format: BookFormat,
  withCover: boolean,
) {
  const key = encodeKey(bookKey(id, format.file));
  if (format.format === "pdf") return pdf(`/download/${key}`, withCover);
  return epub(async (path) => {
    if (path.split("/").some((part) => !part || part === "." || part === ".."))
      return null;
    const response = await fetch(`/book/${key}/${encodeKey(path)}`, {
      mode: "same-origin",
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Book entry unavailable");
    return new Uint8Array(await response.arrayBuffer());
  }, withCover);
}
