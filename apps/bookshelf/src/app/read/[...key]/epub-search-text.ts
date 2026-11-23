import type Section from "epubjs/types/section";

export type Passage = {
  cfi: string;
  section: number;
  before: string;
  match: string;
  after: string;
};

const blocks = new Set(
  "address article aside blockquote caption dd div dl dt figcaption figure footer h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table td th tr ul".split(
    " ",
  ),
);

export function searchableText(text: string) {
  let value = "";
  let offset = 0;
  const offsets: number[] = [];
  for (const character of text) {
    const folded = /\s/u.test(character) ? " " : character.toLowerCase();
    if (folded !== " " || (value && !value.endsWith(" "))) {
      value += folded;
      for (let part = 0; part < folded.length; part++) offsets.push(offset);
    }
    offset += character.length;
  }
  return { value, offsets };
}

function chapterBody(source: string): HTMLElement | null {
  const xml = new DOMParser().parseFromString(source, "application/xhtml+xml");
  const original = xml.getElementsByTagNameNS("*", "body")[0];
  if (!original) return null;

  // The rendition displays HTML in srcdoc. Use the same HTML tree shapes (for
  // example implicit tbody) in a detached document with no browsing context.
  const chapter = document.implementation.createHTMLDocument();
  const template = chapter.createElement("template");
  template.innerHTML = original.innerHTML;
  chapter.body.id = original.id;
  chapter.body.append(template.content);
  return chapter.body;
}

export function findPassages(
  source: string,
  section: Section,
  needle: string,
  limit: number,
): Passage[] | null {
  const body = chapterBody(source);
  if (!body) return null;

  let text = "";
  const runs: { node: Text; start: number; end: number }[] = [];
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      const start = text.length;
      text += node.nodeValue;
      runs.push({ node: node as Text, start, end: text.length });
    }
    if (!(node instanceof Element)) return;
    if (
      node.matches(
        "script, style, template, noscript, [hidden], [aria-hidden=true]",
      )
    )
      return;
    const block = blocks.has(node.localName);
    if (block || node.localName === "br") text += " ";
    for (const child of node.childNodes) walk(child);
    if (block) text += " ";
  }
  walk(body);

  const { value, offsets } = searchableText(text);
  const range = body.ownerDocument.createRange();
  const hits: Passage[] = [];
  let runIndex = 0;
  let at = value.indexOf(needle);
  while (at !== -1 && hits.length < limit) {
    const start = offsets[at];
    const last = offsets[at + needle.length - 1];
    const end = last + String.fromCodePoint(text.codePointAt(last) ?? 0).length;
    while (runIndex < runs.length && runs[runIndex].end <= start) runIndex++;
    const run = runs[runIndex];
    if (!run) break;
    range.setStart(run.node, start - run.start);
    range.collapse(true);
    const from = Math.max(0, start - 42);
    const to = Math.min(text.length, end + 58);
    hits.push({
      cfi: section.cfiFromRange(range),
      section: section.index,
      before: (from ? "…" : "") + text.slice(from, start).replace(/\s+/g, " "),
      match: text.slice(start, end).replace(/\s+/g, " "),
      after:
        text.slice(end, to).replace(/\s+/g, " ") +
        (to < text.length ? "…" : ""),
    });
    at = value.indexOf(needle, at + needle.length);
  }
  return hits;
}
