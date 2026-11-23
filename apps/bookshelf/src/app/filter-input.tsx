"use client";

import { X } from "lucide-react";
import { useRef } from "react";
import { INPUT } from "@/app/ui";

export function FilterInput({
  value,
  onChange,
  label,
  clear,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  clear: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <search className="relative mt-5 block max-w-lg">
      <input
        ref={input}
        type="search"
        value={value}
        aria-label={label}
        placeholder={label}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing)
            event.preventDefault();
        }}
        className={`${INPUT} w-full pr-10 [&::-webkit-search-cancel-button]:hidden`}
      />
      {value && (
        <button
          type="button"
          aria-label={clear}
          title={clear}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-secondary hover:text-foreground"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </search>
  );
}
