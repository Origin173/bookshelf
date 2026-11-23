"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import {
  highlightInLayer,
  markPage,
  renderTextLayer,
} from "@/app/read/[...key]/pdf-document";

/** A page's size in PDF units, which is to say at scale 1. */
export type PageSize = { width: number; height: number };

/**
 * The highest pixel density worth drawing at.
 *
 * A three-times-density phone screen would otherwise cost nine times the pixels
 * of a page, for a sharpness nobody can see at reading distance, and a canvas
 * that large is slow to draw and heavy to hold on to.
 */
const MAX_DENSITY = 2;

/**
 * One page of a PDF.
 *
 * A page is always a box of the right shape, whether or not it has been drawn —
 * which is what lets a five-hundred-page document have a scrollbar that means
 * something from the moment it opens, while only the pages near the reader cost
 * anything. The box is the one authority on size: the canvas is stretched to
 * fill it, so a page part-way through being redrawn at a new zoom goes soft
 * rather than blank.
 */
export function PdfPage({
  doc,
  number,
  scale,
  rotation,
  size,
  draw,
  query,
  onMeasured,
}: {
  doc: PDFDocumentProxy;
  /** Counting from one, as a page is numbered. */
  number: number;
  scale: number;
  rotation: number;
  /** The size to reserve: this page's own if it is known, an estimate if not. */
  size: PageSize;
  /** False for a page that is only holding its place. */
  draw: boolean;
  /** The current search, already folded, or empty for none. */
  query: string;
  /** Stable, or every page redraws whenever the reader renders. */
  onMeasured: (page: number, size: PageSize) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  /** Bumped once the text layer for the current scale is in the DOM. */
  const [laid, setLaid] = useState(0);

  useEffect(() => {
    if (!draw) return;

    const controller = new AbortController();
    const { signal } = controller;
    let task: RenderTask | null = null;

    (async () => {
      const page = await doc.getPage(number);
      if (signal.aborted) return;

      const viewport = page.getViewport({
        scale,
        rotation: (page.rotate + rotation) % 360,
      });

      // The page's real proportions, which may not be the ones its box was
      // reserved with. Reported before drawing, so a document whose pages are
      // not all one size settles as it is read rather than only once it is done.
      // Keep measurements in the file's original orientation so every reserved
      // box can rotate immediately, including pages outside the render window.
      const { width, height } = page.getViewport({ scale: 1 });
      onMeasured(number, { width, height });

      const target = canvas.current;
      if (!target) return;

      const density = Math.min(window.devicePixelRatio || 1, MAX_DENSITY);
      const pixels = {
        width: Math.round(viewport.width * density),
        height: Math.round(viewport.height * density),
      };

      // Drawn off to the side and copied in when it is finished. Assigning a
      // canvas's width clears it, so rendering straight onto the visible one
      // would blank the page for as long as the draw takes.
      const buffer = document.createElement("canvas");
      buffer.width = pixels.width;
      buffer.height = pixels.height;

      task = page.render({
        canvas: buffer,
        viewport,
        transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0],
      });

      try {
        await task.promise;
      } catch {
        // Cancelled, or a page pdf.js could not draw. Either way the box stays
        // and the reader keeps going.
        return;
      }
      if (signal.aborted) return;

      // Resized and blitted without yielding in between, so the clear and the
      // redraw land in the same frame and nothing flashes.
      target.width = pixels.width;
      target.height = pixels.height;
      target.getContext("2d")?.drawImage(buffer, 0, 0);
      setDrawn(true);

      const over = text.current;
      if (!over) return;

      try {
        await renderTextLayer({ page, viewport, container: over, signal });
      } catch {
        // A page whose text will not lay out is still a page to look at.
        return;
      }
      if (signal.aborted) return;
      setLaid((n) => n + 1);
    })().catch(() => {
      // Nothing in here is worth taking the reader down for.
    });

    return () => {
      controller.abort();
      task?.cancel();
    };
  }, [doc, number, scale, rotation, draw, onMeasured]);

  // Marking is separate from drawing so that typing in the search box does not
  // redraw every page on screen — the text is already laid out, and only the
  // ranges over it change.
  useEffect(() => {
    const over = text.current;
    if (!draw || !over || laid === 0) return;

    markPage(number, query ? highlightInLayer(over, query) : []);
    return () => markPage(number, []);
  }, [number, query, draw, laid]);

  // A page that scrolls out of the window gives its pixels back, and with them
  // the several megabytes a page-sized canvas takes up.
  useEffect(() => {
    if (draw) return;
    setDrawn(false);
    setLaid(0);
    const target = canvas.current;
    if (target) {
      target.width = 0;
      target.height = 0;
    }
    text.current?.replaceChildren();
  }, [draw]);

  const sideways = rotation % 180 !== 0;
  return (
    <div
      data-page={number}
      className="pdf-page relative shrink-0 overflow-hidden rounded-[3px] shadow-page"
      style={{
        width: Math.round((sideways ? size.height : size.width) * scale),
        height: Math.round((sideways ? size.width : size.height) * scale),
      }}
    >
      {/* The drawing. Left unlabelled on purpose: what a screen reader should
          read is the text layer over it, and an empty canvas says nothing. */}
      <canvas ref={canvas} className="block size-full" />
      {/* Absolutely positioned runs of transparent text, so a page can be
          selected, copied and read aloud. The rules are in globals.css, where
          pdf.js expects to find them for a layer it did not create itself. */}
      <div ref={text} className="textLayer" />
      {!drawn && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-xs tabular-nums text-tertiary">{number}</span>
        </div>
      )}
    </div>
  );
}
