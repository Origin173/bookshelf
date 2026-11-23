import type { Book, Contents, NavItem } from "epubjs";

export type TocEntry = {
  href: string;
  label: string;
  depth: number;
  section: number;
  fragment: string;
};

export function bookContents(
  book: Book,
  items: NavItem[],
  opfUrl: string,
): TocEntry[] {
  const opf = new URL(opfUrl, window.location.href);
  const nav = new URL(
    book.packaging.navPath || book.packaging.ncxPath || "",
    opf,
  );
  const sections = new Map<string, { href: string; index: number }>();
  book.spine.each((section: { href: string; index: number }) => {
    sections.set(new URL(section.href, opf).href, section);
  });
  const entries: TocEntry[] = [];
  function visit(items: NavItem[], depth: number) {
    for (const item of items) {
      if (item.href) {
        try {
          const url = new URL(item.href, nav);
          const fragment = decodeURIComponent(url.hash.slice(1));
          url.hash = "";
          const section = sections.get(url.href);
          if (section)
            entries.push({
              href: section.href + (fragment ? `#${fragment}` : ""),
              label: item.label.trim(),
              depth,
              section: section.index,
              fragment,
            });
        } catch {
          // Skip an unreadable link, but keep its nested entries.
        }
      }
      if (item.subitems?.length) visit(item.subitems, depth + 1);
    }
  }
  visit(items, 0);
  return entries;
}

/** Only the section already on screen supplies anchor positions. */
export function sectionTargets(contents: Contents, entries: TocEntry[]) {
  const targets: { entry: TocEntry; cfi: string }[] = [];
  for (const entry of entries) {
    if (entry.section !== contents.sectionIndex || !entry.fragment) continue;
    const element = contents.document.getElementById(entry.fragment);
    if (!element) continue;
    const text = contents.document
      .createTreeWalker(element, NodeFilter.SHOW_TEXT)
      .nextNode();
    const range = contents.document.createRange();
    range.selectNodeContents(text ?? element);
    range.collapse(true);
    const cfi = contents.cfiFromRange(range);
    targets.push({ entry, cfi });
  }
  return targets.sort((a, b) => contents.epubcfi.compare(a.cfi, b.cfi));
}
