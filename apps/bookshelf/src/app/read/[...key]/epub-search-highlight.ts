const HIGHLIGHT = "bookshelf-epub-search";

/** Check each fragment: a range can cross lines, columns and page breaks. */
export function rangeInView(range: Range, viewport: HTMLElement): boolean {
  const frame = range.startContainer.ownerDocument?.defaultView?.frameElement;
  if (!frame) return false;
  const origin = frame.getBoundingClientRect();
  const bounds = viewport.getBoundingClientRect();
  return Array.from(range.getClientRects()).some(
    (rect) =>
      rect.height > 0 &&
      origin.top + rect.bottom > bounds.top &&
      origin.top + rect.top < bounds.bottom &&
      origin.left + rect.right > bounds.left &&
      origin.left + rect.left < bounds.right,
  );
}

export function paintSearchHighlight(range: Range): (() => void) | undefined {
  const doc = range.startContainer.ownerDocument;
  const win = doc?.defaultView;
  if (!doc || !win?.CSS.highlights || !win.Highlight) return;

  // A chapter is its own document, with its own stylesheet and registry.
  // Keeping the range out of the DOM also keeps the book's CFIs stable.
  const style = doc.createElement("style");
  style.textContent = `::highlight(${HIGHLIGHT}) { background-color: #ffdf5d; color: #201900; }`;
  doc.head.appendChild(style);
  const registry = win.CSS.highlights;
  registry.set(HIGHLIGHT, new win.Highlight(range));
  return () => {
    registry.delete(HIGHLIGHT);
    style.remove();
  };
}
