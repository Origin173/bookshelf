import { useEffect, useRef, useState } from "react";
import { BUTTON } from "@/app/ui";
import { downloadBlob } from "@/lib/download";

export function MarkdownDownload({
  filename,
  label,
  working,
  failed,
  prepare,
}: {
  filename: string;
  label: string;
  working: string;
  failed: string;
  prepare: (
    active: () => boolean,
  ) => Promise<{ parts: string[] } | { message: string } | undefined>;
}) {
  const mounted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function download() {
    setBusy(true);
    setMessage("");
    try {
      const result = await prepare(() => mounted.current);
      if (!mounted.current || !result) return;
      if ("message" in result) {
        setMessage(result.message);
        return;
      }
      downloadBlob(
        new Blob(result.parts, { type: "text/markdown;charset=utf-8" }),
        filename,
      );
    } catch {
      if (mounted.current) setMessage(failed);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      <button
        type="button"
        className={BUTTON}
        disabled={busy}
        onClick={download}
      >
        {busy ? working : label}
      </button>
      {message && (
        <p role="status" className="mt-2 text-sm text-secondary">
          {message}
        </p>
      )}
    </div>
  );
}
