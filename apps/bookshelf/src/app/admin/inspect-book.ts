import {
  bytesSource,
  findIsbn,
  readZipDirectory,
  readZipEntry,
} from "@bookshelf/core";
import { openPdf } from "@/app/read/[...key]/pdf-document";
import { COVER_EDGE } from "@/lib/upload-limits";

export type Candidate = {
  title: string;
  author: string;
  isbn: string;
  cover: Blob | null;
};

function canvasFor(width: number, height: number) {
  const scale = Math.min(1, COVER_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return canvas;
}

function png(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
}

async function epub(file: File): Promise<Candidate> {
  const { default: Packaging } = await import("epubjs/lib/packaging.js");
  const source = bytesSource(new Uint8Array(await file.arrayBuffer()));
  const directory = await readZipDirectory(source);
  const read = async (path: string) => {
    const entry = directory?.get(path);
    return entry && readZipEntry(source, entry);
  };
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
    author: dc("creator").join("; "),
    isbn: findIsbn(dc("identifier")) ?? "",
    cover: null,
  };
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
      const bitmap = await createImageBitmap(new Blob([bytes]));
      try {
        const canvas = canvasFor(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (context) {
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          candidate.cover = await png(canvas);
        }
      } finally {
        bitmap.close();
      }
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

async function pdf(file: File): Promise<Candidate> {
  const url = URL.createObjectURL(file);
  try {
    const opened = await openPdf(url);
    try {
      const candidate: Candidate = {
        title: "",
        author: "",
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
        candidate.author =
          strings(meta.metadata?.get("dc:creator")).join("; ") ||
          strings(info.Author).join("; ");
        candidate.isbn =
          findIsbn([
            ...strings(meta.metadata?.get("dc:identifier")),
            ...strings(
              info.Custom && (info.Custom as Record<string, unknown>).ISBN,
            ),
          ]) ?? "";
      }
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
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function inspectBook(file: File) {
  return file.name.toLowerCase().endsWith(".epub") ? epub(file) : pdf(file);
}
