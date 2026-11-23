import { COVER_EDGE } from "@/lib/upload-limits";

export function canvasFor(width: number, height: number) {
  const scale = Math.min(1, COVER_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return canvas;
}

export function png(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
}

export async function imageThumbnail(file: Blob) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = canvasFor(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await png(canvas);
  } finally {
    bitmap.close();
  }
}
