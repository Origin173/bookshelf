"use client";

import { INPUT } from "@/app/ui";
import { isbnToAdd } from "@/lib/isbn";

export function IsbnInput({ invalid }: { invalid: string }) {
  return (
    <input
      id="book-isbn"
      name="isbn"
      required
      aria-describedby="isbn-help"
      className={INPUT}
      onInput={({ currentTarget: input }) =>
        input.setCustomValidity(
          input.value && !isbnToAdd(input.value) ? invalid : "",
        )
      }
    />
  );
}
