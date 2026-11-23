"use client";

import type { BookProgress } from "@bookshelf/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { readStored, removeStored, writeStored } from "@/lib/local";

/**
 * Keeping a place in a book, from either reader.
 *
 * The awkward parts of this are the same whether a position is a CFI or a page
 * number, so they live here once rather than twice: the browser's copy is
 * written first and the library's is caught up afterwards, the two are
 * reconciled newest-wins on the way in, and the last position of a session is
 * flushed with a beacon because a normal request does not survive the page
 * being closed.
 *
 * What a position *is* stays with the reader that understands it. This only
 * moves it around.
 */

/** A position as a reader reports it; the library sets the timestamp. */
export type ReadingPosition = Omit<BookProgress, "updatedAt">;

/**
 * How long to wait before telling the server where you are.
 *
 * Every page turn moves the position, and a request per turn would cost a read
 * and a write of the progress file each time. Waiting for a pause collapses a
 * chapter's worth of turns into one write, and the browser copy means nothing
 * is at risk while it waits.
 */
const SYNC_DEBOUNCE_MS = 4000;

/** Where this browser remembers a profile's place in a book. */
function progressKey(profileId: string, bookId: string): string {
  return `bookshelf:progress:${profileId}:${bookId}`;
}

// An absent basedOn means the position has no outstanding write. Null means
// this browser saw a book with no server position yet.
type LocalPosition = BookProgress & { basedOn?: string | null };
type Pending = LocalPosition & { basedOn: string | null };

function readLocal(key: string): LocalPosition | null {
  const raw = readStored(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as LocalPosition;
    return typeof parsed?.updatedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, progress: LocalPosition): void {
  // An undated server position can still be read and sorts behind any dated turn.
  writeStored(
    key,
    JSON.stringify({ ...progress, updatedAt: progress.updatedAt ?? "" }),
  );
}

export type Position = {
  /**
   * False until the browser's copy and the library's have been reconciled. A
   * reader waits for it, so that a book is built once, for the place it is
   * actually going to open at.
   */
  ready: boolean;
  /**
   * The browser's copy as it stands — not as it stood on mount. A reader that
   * rebuilds itself (a change of layout, a change of zoom) asks again and comes
   * back where the reader was, rather than where it started.
   */
  current: () => BookProgress | null;
  /** Records a position: locally at once, and in the library after a pause. */
  record: (position: ReadingPosition) => void;
};

export function useReadingPosition({
  bookId,
  profileId,
  saved,
  canSync,
  legacy,
}: {
  bookId: string;
  profileId: string;
  /** This profile's position as the library has it, from any device. */
  saved: BookProgress | null;
  /** False against a library the app cannot write to. */
  canSync: boolean;
  /**
   * A position this browser stored under an older key, for a reader that has
   * one to migrate. Called only when there is nothing under the current key.
   */
  legacy?: () => BookProgress | null;
}): Position {
  const storageKey = progressKey(profileId, bookId);

  const revision = useRef(saved?.updatedAt ?? null);
  const pending = useRef<Pending | null>(null);
  const sending = useRef(false);
  const retry = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sync = useCallback(
    async function flush(beacon = false): Promise<void> {
      if (timer.current) clearTimeout(timer.current);
      const sent = pending.current;
      if (!sent || !canSync) return;
      if (sending.current) {
        retry.current = true;
        return;
      }
      const { cfi, href, page, basedOn } = sent;
      const body = JSON.stringify({
        bookId,
        profileId,
        cfi,
        href,
        page,
        basedOn,
      });
      if (beacon && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(
          "/api/progress",
          new Blob([body], { type: "application/json" }),
        );
        return;
      }
      sending.current = true;
      try {
        const response = await fetch("/api/progress", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        });
        if (response.status !== 200 && response.status !== 409) return;
        const result = (await response.json()) as {
          saved: boolean;
          current?: BookProgress | null;
        };
        // A 409 for a switched account has no position for this reader.
        if (result.current === undefined) return;
        revision.current = result.current?.updatedAt ?? null;
        const next = pending.current;
        if (!next) return;
        const local = readLocal(storageKey);
        const ownsLocal = !local || local.updatedAt === next.updatedAt;
        if (result.saved && next !== sent) {
          // This tab moved again while its earlier turn was being confirmed.
          pending.current = { ...next, basedOn: revision.current };
          if (ownsLocal) writeLocal(storageKey, pending.current);
          retry.current = true;
        } else {
          // The server acknowledged the turn, or returned a newer position.
          pending.current = null;
          if (ownsLocal) {
            if (result.current) writeLocal(storageKey, result.current);
            else removeStored(storageKey);
          }
        }
      } catch {
        // Keep the pending revision until an acknowledgement or conflict.
      } finally {
        sending.current = false;
        if (retry.current) {
          retry.current = false;
          void flush();
        }
      }
    },
    [bookId, profileId, canSync, storageKey],
  );

  // Held in a ref so that a reader whose own effects depend on `record` is not
  // torn down and rebuilt every time the migration function is redeclared. Kept
  // up to date in an effect rather than during the render, because a render may
  // be thrown away and a ref written in one would not be.
  const migrate = useRef(legacy);
  useEffect(() => {
    migrate.current = legacy;
  }, [legacy]);

  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Retry a pending turn only against the server revision it was read from.
    // Older browsers stored timestamps without a pending-write marker.
    const local = readLocal(storageKey);
    revision.current = saved?.updatedAt ?? null;
    if (
      local &&
      local.basedOn !== undefined &&
      local.basedOn === revision.current
    ) {
      pending.current = { ...local, basedOn: local.basedOn };
      void sync();
    } else if (
      local?.basedOn !== undefined ||
      (saved && (!local || saved.updatedAt > local.updatedAt))
    ) {
      if (saved) writeLocal(storageKey, saved);
      else removeStored(storageKey);
    } else if (!local) {
      const older = profileId === "default" ? migrate.current?.() : null;
      if (older) writeLocal(storageKey, older);
    }

    setReady(true);
  }, [storageKey, saved, profileId, sync]);

  // Leaving the page is the one moment a debounce cannot be allowed to lose.
  useEffect(() => {
    const flush = () => void sync(true);
    const reconnect = () => void sync();
    window.addEventListener("online", reconnect);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", reconnect);
      flush();
    };
  }, [sync]);

  const current = useCallback(() => readLocal(storageKey), [storageKey]);

  const record = useCallback(
    (position: ReadingPosition) => {
      // The browser first and without waiting, so the position is never at the
      // mercy of the network; the library catches up once the reader pauses.
      const next = { ...position, updatedAt: new Date().toISOString() };
      if (!canSync) {
        writeLocal(storageKey, next);
        return;
      }
      pending.current = { ...next, basedOn: revision.current };
      writeLocal(storageKey, pending.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => sync(false), SYNC_DEBOUNCE_MS);
    },
    [storageKey, sync, canSync],
  );

  return { ready, current, record };
}
