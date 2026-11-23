import { createHash } from "node:crypto";
import { bookKey, type Storage, storageBookKey } from "@bookshelf/core";
import { COVER_EDGE, MAX_COVER_BYTES } from "@/lib/upload-limits";
import { reading, writing } from "@/services/errors";

export async function storeThumbnail(
  storage: Storage,
  id: string,
  bytes: Uint8Array<ArrayBuffer>,
  kind: "import" | "edit",
) {
  const write = storage.writeIfMatch?.bind(storage);
  if (!write) return null;
  const hash = createHash("sha256").update(bytes).digest("hex");
  const file = `${kind === "edit" ? "_cover" : "cover"}-${hash}.png`;
  const key = storageBookKey(bookKey(id, file));
  const saved = await writing("the thumbnail", () =>
    write(key, bytes, "image/png", null),
  );
  if (saved || (await reading("the thumbnail", () => storage.head(key))))
    return file;
  return null;
}

export function validThumbnail(png: Uint8Array): boolean {
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
