# What's missing

What Bookshelf can't do yet, so you know what you're getting before you commit a
library to it. Roughly in the order it's worth doing.

If you want to work on one of these, say so on
[the issue tracker](https://github.com/murerkinn/bookshelf/issues) first — most
of these are larger than they look.

## Know this before you deploy

**Accounts share the library.** Each account can read and download every book
and keeps its own positions. Device-specific OPDS tokens remain a possible
extension of [password authentication](opds.md#signing-in).

**Nothing is encrypted.** Your library is published in the clear, and object
keys are slugified titles — so a listing of your storage names your shelf.
Whoever holds the storage can read every book. With the filesystem provider you
can put the directory on an encrypted volume today; see
[encrypting your library](providers/fs.md#encrypting-your-library-at-rest).

**Two devices reading one profile at the same time is last-write-wins.** Read
the same book on two screens at once and one of them loses its place.

## Planned next

Where reading and browsing are thin rather than absent.

- **More EPUB typography controls.** Text size and page tint are available.
  Font family, line height and margins are still open.
- **Where you are in an EPUB.** A PDF shows a page of a total and a progress
  line. An EPUB shows a chapter name — no percentage, no page count, no "N pages
  left in this chapter".
- **A page per book.** Your books' descriptions are read, published, and never
  shown, because there's no page where a book's own details live. The shelf row
  crowds the actions together and there's nowhere to see a large cover.
- **Sorting, filtering, and a shelf that scales.** Search is a substring test
  across title, authors and publisher. There's no sorting but alphabetical, no
  filters, no ranking, and no pagination — every book renders every time.
  `Bronte` won't find `Brontë` on the shelf, though it will inside a PDF.
- **Reading on a phone.** The PDF reader takes a swipe. The EPUB reader turns
  pages with two small buttons, and there's no way to reach the chrome without
  hitting a 32-pixel target. Tap zones and an immersive mode are missing from
  both.
- **Highlights.** Personal bookmarks are available in the PDF and EPUB readers.
- **Search inside an EPUB.** PDFs are searchable; EPUBs aren't.

## Later

Bigger, and each one arguably a project of its own.

- **More formats.** CBZ, MOBI/AZW3, FB2, DjVu, plain text and Markdown. MOBI and
  AZW3 matter most, since that's what a decade of Kindle libraries are stored
  as. Unencrypted files only — Bookshelf does not circumvent DRM and won't take
  contributions that do.
- **Publishing that knows what changed.** Every `npm run sync` rebuilds the
  whole tree: every book re-read, every PDF cover re-rendered. A library of a
  thousand books costs a full rebuild to add one.
- **Adding books from the browser.** Right now publishing means shell access to
  a machine with the repository on it.
- **Offline reading.**
- **A library the server cannot read.** End-to-end encryption, so your storage
  provider and a leaked bucket both see ciphertext. This is the largest item
  here, it can't coexist with the OPDS catalog, and it's no defence against a
  compromised app host.

## Someday

Nothing here is load-bearing.

- **Reading statistics** — time read, books finished, pace.
- **Collections** — hand-made shelves alongside the automatic ones.
- **Send to device** — email an EPUB to a Kindle address, or a QR code to open
  a book on your phone.
- **Merging positions properly** across two devices.
- **A conversion pipeline** — EPUB from PDF, EPUB from MOBI.
- **Interface localization**, and grouping the shelf by the language its books
  are in.
- **Accessibility beyond the basics** — focus management in the reader's iframe,
  announcements on page turns, a keyboard shortcut sheet.

## Not planned

Stated so each is a decision rather than an oversight.

- **A metadata editor.** Your library is regenerable by design — the thing to
  edit is the source book, not the published catalog.
- **Fetching metadata from the internet.** Google Books and OpenLibrary would
  fill in what a file lacks, and would also make publishing depend on someone
  else's uptime. If it ever happens it'll be opt-in and cached.
- **Social features.** Not what this is.
- **DRM circumvention.** Bookshelf reads files you can already open.
