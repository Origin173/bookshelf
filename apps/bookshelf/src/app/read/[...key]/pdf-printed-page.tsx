import { useState } from "react";
import { BUTTON, INPUT } from "@/app/ui";
import type { ReaderText } from "@/lib/reader-text";

export function PrintedPageBox({
  t,
  labels,
  page,
  onGo,
}: {
  t: ReaderText;
  labels: string[];
  page: number;
  onGo: (page: number) => void;
}) {
  const [label, setLabel] = useState(labels[page - 1]);
  const [error, setError] = useState("");

  return (
    <form
      className="flex max-w-full flex-wrap items-center gap-1 text-sm text-secondary"
      onSubmit={(event) => {
        event.preventDefault();
        const index = label ? labels.indexOf(label) : -1;
        if (index < 0) setError(t.unknownPageLabel);
        else if (labels.lastIndexOf(label) !== index)
          setError(t.duplicatePageLabel);
        else {
          setError("");
          onGo(index + 1);
        }
      }}
    >
      <label className="flex items-center gap-1">
        {t.printedPage}
        <input
          className={`${INPUT} w-20`}
          value={label}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={!!error}
          aria-describedby={error ? "page-label-error" : undefined}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setLabel(event.target.value);
            setError("");
          }}
        />
      </label>
      <button type="submit" className={BUTTON}>
        {t.goToPage}
      </button>
      {error && (
        <span id="page-label-error" role="status" className="basis-full">
          {error}
        </span>
      )}
    </form>
  );
}
