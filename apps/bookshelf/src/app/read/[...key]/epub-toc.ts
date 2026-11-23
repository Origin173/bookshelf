import type { Book, Contents, NavItem } from "epubjs";

export type TocEntry = {
  href: string;
  label: string;
  id: number;
  parents: string[];
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
  function visit(items: NavItem[], parents: string[]) {
    for (const item of items) {
      const label = item.label.trim();
      if (item.href) {
        try {
          const url = new URL(item.href, nav);
          const fragment = decodeURIComponent(url.hash.slice(1));
          url.hash = "";
          const section = sections.get(url.href);
          if (section)
            entries.push({
              href: section.href + (fragment ? `#${fragment}` : ""),
              id: entries.length,
              label,
              parents,
              section: section.index,
              fragment,
            });
        } catch {
          // Skip an unreadable link, but keep its nested entries.
        }
      }
      if (item.subitems?.length)
        visit(item.subitems, label ? [...parents, label] : parents);
    }
  }
  visit(items, []);
  return entries;
}

/** Only the section already on screen supplies anchor positions. */
export function sectionTargets(contents: Contents, entries: TocEntry[]) {
  const targets: { entry: TocEntry; heading: TocEntry; cfi: string }[] = [];
  const headings = new Map<string, TocEntry>();
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
    // Multiple outline entries can lead to the same character.
    const heading = headings.get(cfi) ?? entry;
    headings.set(cfi, heading);
    targets.push({ entry, heading, cfi });
  }
  return targets.sort((a, b) => contents.epubcfi.compare(a.cfi, b.cfi));
}
