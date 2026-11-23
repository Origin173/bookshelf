# Reading in the browser

![The reader: a two-page spread of a chapter, with a contents dropdown and a layout selector](reader.webp)

Every book on your shelf has a **Read** link. EPUBs and PDFs each get a reader
built for them; anything else opens in your browser's own viewer.

Books open where you left off, and the **Continue** button on the shelf takes
you straight back to the one you're part-way through.

## Open from your Home Screen

Visit your shelf over HTTPS. In Safari on iPhone, choose **Share → Add to Home
Screen**, enable **Open as Web App** if offered, then tap **Add**. Browsers
that support installation also offer it in their menus.

Open the Bookshelf icon and sign in with your usual shelf account if prompted.
Choose **Continue** beside a book to return to your saved place. Both readers
have a **Shelf** link at the top. Opening books and syncing progress require a
connection. A disconnected launch shows a link to reopen the shelf after you
reconnect. The service worker stores no pages, book files or account data.

If a page already on screen can turn while disconnected, leave the reader
open. When the connection returns it sends the last position, even without
another turn. If another session has since changed that book, its newer
server position is kept. A private window or cleared browser storage can lose
a position before it syncs.

On iOS and iPadOS 17.2 or later, adding the shelf to the Home Screen can
carry over the login cookie. Safari’s local reading positions are not copied.
Sync your place before installing if you want to resume it in the app.
[WebKit’s installation notes](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/#login-cookies).

## Controls

Both readers share the same controls.

| | |
| --- | --- |
| **Layout** | two pages, one page, or continuous scroll |
| **Contents** | jump to a chapter |
| **Bookmarks** | save, revisit or remove a location |
| **Page tint** | publisher colors (EPUB) or paper (PDF), plus sepia and night |
| **Download** | the file itself |

**Keyboard**, in the page-at-a-time layouts:

| | |
| --- | --- |
| arrows, page up / page down | turn the page |
| space, shift-space | turn the page |
| Home, End | the start or end of the book |

In continuous scroll the arrows scroll instead of turning. On a touchscreen,
swipe to turn when the pages fit the screen horizontally. When zoomed in, drag
to pan across the page and use the arrow buttons to turn.

## Your place in an EPUB

Above the toolbar, the reader shows the current chapter title or the section
number in the EPUB spine when no matching title is available. In paginated
text it also shows the first visible page and the page count for that section.
These numbers follow the current screen and type size. The saved location is
the passage itself. Continuous scroll and fixed layouts show the section alone.

## EPUB appearance

In a reflowable EPUB, open **Reading appearance** to change text size from
85% to 200% or choose sepia or night colors. Choose **100%** and **Publisher
colors** for the original typography and palette. The reader reopens the
current passage as the text reflows. Illustrations retain their colors.
This browser remembers the choices for the signed-in account across its books.
Fixed-layout EPUBs keep their original presentation.

## Personal bookmarks

Open **Bookmarks** in either reader and choose **Bookmark this location**.
Select an entry to jump back, or **Remove** to forget it. The PDF reader saves
the page number. The EPUB reader saves the exact text location (CFI) and shows
the chapter and page as they appeared when you marked it. Opening the list,
adding, and removing leave your current reading position in place.

Use the pencil beside a bookmark to give it a private name. Its original page
or chapter stays visible underneath. Clear the name and save to return to the
automatic label. Renaming keeps both the bookmark target and your reading
position.

Each signed-in account has its own bookmarks for each book file. They are
included in the library's `.bookshelf/` backup. A read-only library can show
existing bookmarks.

## PDFs

**Zoom** is automatic by default: fitted to the width of your window, but never
past 125%, because a Letter page blown up to fill a wide monitor sets the body
text at about twenty-four points. Fit-width, fit-page and fixed percentages are
all available.

**Search** works over the whole document and runs entirely in your browser.
Results stream in as pages are scanned, and the first search costs one pass over
the document — after that it's instant. Matching ignores case and accents, so
`Bronte` finds `Brontë`, and it matches across line breaks.

**Contents** comes from the document's own outline, in a drawer rather than a
dropdown, because technical books run to hundreds of bookmarks.

**Page tint on a PDF is a filter over the page**, not a restyling. A PDF page is
a picture, background and all, so tinting can't work the way it does for an
EPUB. It looks right for text and diagrams and wrong for photographs, which is
why paper is the default.

**You can select and copy text**, and screen readers can read the page, because
the text sits over the page as a transparent layer.

Not there yet: page thumbnails, tap zones for turning on a touchscreen, and
rotating a page that was scanned sideways.

## Opening a big book is cheap

You don't download the whole file to start reading. A 40 MB PDF opens on a few
128 KB reads and the rest arrives as you read. An EPUB fetches one chapter at a
time — a cold open costs about 73 KB rather than the whole archive.

Continuous scroll on an EPUB is the exception, at around 1.3 MB, because it
starts at the top of the book and renders the cover.

If you're watching a network log, you'll see the PDF reader make one request for
the whole file and immediately cancel it. That's how it discovers that ranged
requests are available. It transfers almost nothing.

## Downloads resume

An interrupted download continues from where it stopped rather than starting
again. If the book was republished in the meantime, you get the whole of the new
file instead of two halves spliced together.

Your browser may not show a percentage while downloading. The server streams
book files without stating a total length up front, so there's nothing for the
progress bar to count against.

## Where your place is kept

Your position is written to your browser first, so you never lose it to a bad
connection, and saved to the library a few seconds later. Closing the tab
flushes whatever is outstanding.

Which file it's saved to depends on [which profile](profiles.md) is reading. On
a library the app can't write to, positions stay in your browser only.

Layout, zoom and tint are remembered per device rather than per profile.
