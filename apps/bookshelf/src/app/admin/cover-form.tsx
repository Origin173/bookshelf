"use client";

import { type ReactNode, useEffect, useState } from "react";
import { imageThumbnail } from "@/app/admin/thumbnail";
import { BUTTON_PRIMARY, INPUT } from "@/app/ui";
import { MAX_COVER_BYTES, MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

export function CoverForm({
  children,
  t,
}: {
  children: ReactNode;
  t: {
    addCover: string;
    coverImage: string;
    coverHelp: string;
    invalidLocalCover: string;
    coverPreview: string;
  };
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!file) return;
    let active = true;
    let url: string | undefined;
    async function prepare(source: File) {
      if (source.size > MAX_UPLOAD_BYTES) throw new Error();
      const header = new Uint8Array(await source.slice(0, 4).arrayBuffer());
      const png =
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47;
      const jpeg =
        header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
      if (!png && !jpeg) throw new Error();
      const blob = await imageThumbnail(source);
      if (!blob || blob.size > MAX_COVER_BYTES) throw new Error();
      if (active) {
        url = URL.createObjectURL(blob);
        setPreview({ blob, url });
      }
    }
    void prepare(file).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  return (
    <form
      action="/admin/cover"
      method="post"
      encType="multipart/form-data"
      className="mt-6 grid max-w-lg gap-3"
      onSubmit={(event) => {
        if (!preview) {
          event.preventDefault();
          return;
        }
        event.currentTarget.addEventListener(
          "formdata",
          (e) =>
            (e as FormDataEvent).formData.set(
              "cover",
              preview.blob,
              "cover.png",
            ),
          { once: true },
        );
      }}
    >
      {children}
      <label htmlFor="cover-image" className="font-medium">
        {t.coverImage}
      </label>
      <input
        id="cover-image"
        type="file"
        accept="image/png,image/jpeg"
        required
        aria-describedby="cover-help"
        className={`${INPUT} min-w-0 max-w-full`}
        onChange={(e) => {
          setFailed(false);
          setPreview(null);
          setFile(e.target.files?.[0] ?? null);
        }}
      />
      <p id="cover-help" className="text-sm text-secondary">
        {t.coverHelp}
      </p>
      {failed && (
        <p role="alert" className="text-sm text-secondary">
          {t.invalidLocalCover}
        </p>
      )}
      {preview && (
        // biome-ignore lint/performance/noImgElement: local thumbnail preview
        <img
          src={preview.url}
          alt={t.coverPreview}
          className="max-h-32 max-w-full rounded object-contain"
        />
      )}
      <button
        type="submit"
        disabled={!preview}
        className={`${BUTTON_PRIMARY} w-fit disabled:opacity-50`}
      >
        {t.addCover}
      </button>
    </form>
  );
}
