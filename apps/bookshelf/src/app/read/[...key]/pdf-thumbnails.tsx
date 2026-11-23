import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PdfDrawer } from "@/app/read/[...key]/pdf-sidebar";
import type { ReaderText } from "@/lib/reader-text";

const WIDTH = 64;
const HEIGHT = 76;

export function PdfThumbnails({
  doc,
  labels,
  page,
  rotation,
  t,
  onGo,
  onClose,
}: {
  doc: PDFDocumentProxy;
  labels: string[] | null;
  page: number;
  rotation: number;
  t: ReaderText;
  onGo: (page: number) => void;
  onClose: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<ReadonlySet<number>>(() => new Set());

  useLayoutEffect(() => {
    list.current
      ?.querySelector(`[data-thumbnail-page="${page}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [page]);

  useEffect(() => {
    const region = list.current;
    if (!region) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const number = Number(
              (entry.target as HTMLElement).dataset.thumbnailPage,
            );
            if (entry.isIntersecting) next.add(number);
            else next.delete(number);
          }
          return next;
        });
      },
      { root: region, rootMargin: "96px 0px" },
    );
    for (const tile of region.querySelectorAll("[data-thumbnail-page]")) {
      observer.observe(tile);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <PdfDrawer label={t.thumbnails} hide={t.hide} onClose={onClose}>
      <div
        ref={list}
        data-thumbnail-list=""
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
      >
        <ul className="grid grid-cols-3 gap-1">
          {Array.from({ length: doc.numPages }, (_, index) => {
            const number = index + 1;
            const label = labels?.[index];
            const current = number === page;
            return (
              <li key={number} className="min-w-0">
                <button
                  type="button"
                  data-thumbnail-page={number}
                  aria-current={current ? "page" : undefined}
                  onClick={() => onGo(number)}
                  className={`flex h-32 w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs tabular-nums transition-colors hover:bg-fill ${current ? "bg-accent/10 text-accent" : "text-secondary"}`}
                >
                  <span
                    aria-hidden="true"
                    className="block rounded bg-fill"
                    style={{ width: WIDTH, height: HEIGHT }}
                  >
                    {visible.has(number) && (
                      <Thumbnail
                        doc={doc}
                        number={number}
                        rotation={rotation}
                      />
                    )}
                  </span>
                  <span>{t.pageNumber(number)}</span>
                  {label && label !== String(number) && (
                    <span className="w-full truncate" title={label}>
                      {label}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </PdfDrawer>
  );
}

function Thumbnail({
  doc,
  number,
  rotation,
}: {
  doc: PDFDocumentProxy;
  number: number;
  rotation: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | undefined;
    void (async () => {
      const page = await doc.getPage(number);
      const target = canvas.current;
      if (cancelled || !target) return;
      const angle = (page.rotate + rotation) % 360;
      const { width, height } = page.getViewport({ scale: 1, rotation: angle });
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const scale = Math.min(WIDTH / width, HEIGHT / height) * density;
      const viewport = page.getViewport({ scale, rotation: angle });
      target.width = Math.max(1, Math.round(viewport.width));
      target.height = Math.max(1, Math.round(viewport.height));
      task = page.render({ canvas: target, viewport });
      await task.promise;
    })().catch(() => {
      // The page number remains usable even when a preview cannot be drawn.
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, rotation]);

  return (
    <canvas
      ref={canvas}
      width={0}
      height={0}
      className="block size-full object-contain"
    />
  );
}
