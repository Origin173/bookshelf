# The library format

What the sync tool writes, so you know what you're backing up and what you can
safely change.

## The layout

One folder per book, plus a generated catalog:

```
library/
  the-time-machine/
    metadata.json          what the book says about itself
    cover.webp
    the-time-machine.epub
    the-time-machine.pdf   any number of formats
  catalog.json             generated from every metadata.json
  .bookshelf/              written by the app, not the sync tool
    subjects.json          optional web edits
    profiles.json
    progress/<profile>.json
```

Folder names are slugified titles, so a listing of your storage names your
shelf.

## metadata.json

Holds what the book records about itself: title, authors, publisher, date,
language, identifier, ISBN, description, subjects, series, and a page count for
formats that have one.

Only the title is required. A book that doesn't record a publisher or a date is
normal, not broken. For how each format stores this and how far it's trusted,
see [publishing](publishing.md#what-ends-up-on-your-shelf).

When an older sync would have skipped a PDF's embedded title, `legacyTitle`
records the title it would have used. Republish normally to show the embedded
title while keeping the same folder, reader links and existing web edits.

## catalog.json

Generated from every `metadata.json` in the library. Delete it and the next
`npm run sync` writes it again.

## .bookshelf/

Your profiles, reading positions and subject edits. This is the only thing in the library the
sync tool didn't put there, and it never removes it — not on a normal run, not
with `--force`.

## What to back up

Back up your books, and back up `.bookshelf/`.

Everything else regenerates. If you lose the library but still have your
original files, `npm run sync` rebuilds all of it. If you lose `.bookshelf/`,
reading positions and web edits are gone.

## Editing titles and subjects on the web

Set `BOOKSHELF_ADMINS` to a comma-separated list of existing account names
(for example, `librarian`). On a private, writable shelf, sign in and open
**Manage books**. Choose a book to correct its display title or enter one subject per line.
**Use original title** restores the title from the CLI publication or web upload.
Renaming a book keeps its ID, file links and reading positions. Saving an
empty list clears the subjects. **Use published subjects** follows the
metadata from sync again.

The shelf, reading page and both OPDS feeds use the display title. The shelf filter
and both feeds use the edited subjects. The app reads both fields from
one small object. A warm reader checks its ETag before downloading it again.
Concurrent changes ask the editor to review the latest version before retrying.

Back up `.bookshelf/subjects.json` with the rest of the app state. Sync leaves
this file in place, including on a forced publish. An edit follows the book's
ID, title, authors and identifier across publishes. If any of those change,
the new publication uses its own metadata. For filesystem libraries, keep the published
directory separate from the disposable build output. If a stopped Node
process leaves `.bookshelf/subjects.json.lock`, stop all writers, remove
that empty directory, then restart.
