# Publishing a library

The sync tool reads a folder of books, builds a library from them, and uploads
it to wherever you keep it.

## Publish your books

Put your EPUBs and PDFs in `books/`, then run:

```bash
npm run sync
```

If you ran `npm run demo` first, empty `books/` before adding your own — the
generated titles would otherwise publish alongside them and be tedious to tell
apart. (`npm run demo` refuses a folder that already has books in it, so the
other order is safe.)

That builds `library/` and uploads it. Two variations you'll want:

```bash
npm run sync -- --dry-run   # build it, upload nothing — check the result first
npm run sync -- --force     # clear the destination, then upload
```

Run `--dry-run` the first time. It writes `library/` and prints what each book
turned into, so you can see whether your titles and covers came out right before
anything leaves your machine.

## Configure where things go

Create `bookshelf.config.json` in the project root:

```json
{
  "input": "books",
  "output": "library",
  "coverHeight": 240,
  "storage": {
    "provider": "r2",
    "bucket": "books",
    "jurisdiction": "eu",
    "worker": "apps/bookshelf"
  }
}
```

| key | what it does |
| --- | --- |
| `input` | the folder your books are in. Default `books` |
| `output` | where the built library is written. Default `library` |
| `coverHeight` | cover thumbnail height in pixels. Default 240 |
| `storage.provider` | `r2` or `fs`, or the name of a provider package you installed |

You can skip the file entirely if you use the default layout — `books/` in,
`library/` out.

Everything under `storage` other than `provider` is passed straight to the
provider. For what your provider accepts, see [R2](providers/r2.md) or
[filesystem](providers/fs.md).

The tool looks for the config by walking up from wherever you run it, so you can
run it from a subdirectory.

## Flags

| flag | what it does |
| --- | --- |
| `--force` | clear the destination before uploading |
| `--dry-run` | build the tree, publish nothing |
| `--local` | publish to the local miniflare bucket, for testing |
| `--create` | create the destination first, if your provider can |
| `--provider NAME` | publish through a different provider than the config names |
| `--size N` | cover thumbnail height in pixels |
| `--full` | keep full-size covers instead of thumbnailing them |

## Adding and removing books

Add a book to `books/` and run `npm run sync` again. Delete one and run it
again, and it disappears from your shelf too — a normal run removes anything the
previous catalog listed that the new one doesn't. The shelf notices within a
couple of minutes, and stops serving the book's files then too. A browser that
already fetched them may keep a chapter for up to an hour and a cover for a
day.

Use `--force` when your destination has drifted out of step with what you expect
— for instance after an upload failed halfway. It clears first instead of
comparing.

Neither one touches your profiles or reading positions. Those live in
`.bookshelf/`, and nothing the sync tool does will remove them.

## Give one book several formats

Name the files the same thing:

```
books/
  the-time-machine.epub
  the-time-machine.pdf
```

Those become one book on your shelf, with both formats offered for download.

## What ends up on your shelf

Titles, authors, publishers and dates come out of the books themselves. Nothing
is looked up online and nothing is guessed from a file name, so what you see is
what your files say about themselves.

**EPUB** metadata is usually right: title, authors, publisher, date, language,
identifier, description, subjects, and a series if Calibre or an EPUB 3
collection recorded one.

**PDF** metadata is less reliable, because PDF writers fill the title field in
with whatever is to hand. Titles that are obviously not titles get rejected:

| recorded title | what happens |
| --- | --- |
| `Acme DPA v6.4.docx` | rejected — a file name with its extension |
| `Microsoft Word - acme-terms.doc` | rejected — the program's doing |
| `untitled`, `Slide 1`, blank | rejected — says nothing |
| `quarterlynotes`, for `quarterlynotes.pdf` | rejected — the file's own name |
| `Skia/PDF m149`, where that is also the producer | rejected — the tool's name |
| `acme-brochure-v1.3-web` | kept — ugly, but it's what the document calls itself |

When a title is rejected, the next place it might be recorded is tried, and
failing that the file name is used.

Two things to expect from PDFs:

- **The date is the file's, not the book's.** A PDF records when the file was
  written, which for a scan or a re-export isn't when the book came out. It's
  published as a date without a time.
- **An ISBN only appears if its check digit is valid.** Publishers put all kinds
  of things in the identifier field, so unverified numbers are left off rather
  than shown as an ISBN.

### If a book imports wrongly

Check what the book itself says first. For an EPUB, unzip it, find the `.opf`
named in `META-INF/container.xml`, and look at its `<metadata>` block — that's
exactly what the sync tool reads. If the title is wrong there, it'll be wrong on
your shelf.

If a book is marked `[encrypted, no metadata]`, it's a PDF with the
permissions-only encryption some publishers apply. The book still publishes and
still gets a cover; only its metadata is unavailable.

Still stuck? [Open an issue](https://github.com/murerkinn/bookshelf/issues/new/choose)
with that metadata block. Please don't attach the book.

## Covers

Covers are thumbnailed to 240px WebP. Install two tools and they'll come out
right:

```bash
brew install webp poppler        # macOS
apt install webp poppler-utils   # Debian, Ubuntu
```

| tool | needed for | without it |
| --- | --- | --- |
| `cwebp` | cover thumbnails | `sips` on macOS, otherwise covers are published full size |
| `pdftoppm` | covers from PDFs | `sips` or `qlmanage` on macOS, otherwise PDFs get no cover |

Neither is required — the sync tool carries on without them — but a shelf of
untouched publisher covers costs around 65 MB against 0.5 MB thumbnailed, so
it's worth the two installs.

Use `--full` if you want the original covers kept at their own size.

The Docker image ships both tools, so there's nothing to install on that route.

## Disk space

Book files are hard-linked into `library/` rather than copied, so publishing
763 MB of books costs about a megabyte of disk.

## Upload from a browser

On a private shelf, a signed-in administrator can open **Manage books → Upload a
book** and select an EPUB or PDF. The browser reads the file locally. For EPUB
it suggests the package title, creators, a valid ISBN when present, and a
declared cover if the browser can decode the image. For PDF it reads the
document properties and renders the first page as a cover candidate. You can
edit or clear any suggestion and uncheck **Use this cover**. Enter a title
if none was found. You can enter one subject per line to make the uploaded
book available under those subjects on the shelf and in OPDS. Books without
a cover use the usual placeholder.

In **Manage books → Add a subject to books**, choose an existing subject and
check the books that should receive it. **Preview changes** shows which books
will gain the subject and which already have it. **Confirm and add** saves the
selection together and keeps each book’s other subjects. If a book is at the
20-subject limit, change the selection before confirming.

In **Manage books → Edit book → Details from the book**, choose an available
EPUB or PDF and select **Read file details**. The browser reads the stored
file on demand. EPUB uses its package metadata and declared cover. PDF uses
its document properties and, when possible, a thumbnail of the first page.
Compare the suggested title and authors with the current credits. A valid
ISBN or cover can fill an empty field. Check the fields to adopt and select
**Apply selected details** to save them together. Unchecked fields keep their
current values. This uses only your shelf and works without a book lookup
service.

To correct the credits on an existing book, open **Manage books → Edit book**
and enter one author per line, in the order shown on the book. Save an empty
field for an uncredited work, or select **Use original authors** to restore
the published or imported credits. The shelf and both OPDS feeds use the saved
names. Normal and forced CLI publishing preserve these edits for the same book.

In **Manage books**, choose **Missing covers** to find published and
web-imported books whose catalog entry has no cover. Choose **All books** to
return to the full list.

Open a book in **Missing covers**, choose a local PNG or JPEG (up to 8 MiB),
review the thumbnail and select **Add cover**. The browser sends a PNG of at
most 240 pixels per side and 256 KiB. The edit uses the same book ID and
survives a normal or forced CLI publish. If a later publication includes
its own cover, the shelf uses that cover.

The form accepts one file up to **8 MiB**, an optional PNG thumbnail up to
**240 × 240 pixels and 256 KiB**, and 16 KiB for the remaining multipart data.
The Worker checks the request size as it arrives. Use the CLI for larger
files. Thumbnail generation stays on the device. Only submitting the form
sends the file and reviewed details to your shelf. Keep the form open after an
error to correct the details or retry the same file. A retry sends the file
again. If the first upload was saved, the form links to the existing book.

Cloudflare also applies a request body limit for the domain (100 MB on Free
and Pro). Workers Free allows 10 ms of CPU per HTTP request, and each isolate
has 128 MB of memory. Local preview does not measure those production quotas.
See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

A PDF needs its version header and end marker. An EPUB needs a ZIP with the
stored EPUB mimetype, a container and a package document. The existing
readers determine which contents they can display. Uploading does not convert
books or remove DRM.

Web books live under `.bookshelf/uploads/`, including their separate catalog.
Back up this directory with the other app state. The book bytes are written
with the optional thumbnail before the catalog entry. The SHA-256 of the
original book identifies it. Retrying the same
file completes an interrupted import or finds the existing book with its saved metadata and cover. A conflicting
catalog update asks you to retry. Both normal and forced CLI publishing leave
this directory in place.

To add the other format to a web upload, open **Manage books**, select the
book and choose **Add format**. Select the missing EPUB or PDF (up to 8 MiB).
The original book ID, cover, catalog edits and personal reading data are
preserved. Repeating the same submission is safe. A different file cannot
replace a format already on the book.

Each added file has an immutable name derived from its SHA-256. The web
catalog publishes the link after the bytes are stored, using a conditional
write. An interrupted or competing request can leave an unlisted file in
the upload directory. Retrying the same file reuses those bytes.
The version 1 upload index keeps the original format in place. Older readers
can still open it and preserve the additional format when importing another book.
