"use client";

import { useEffect, useState } from "react";

export function ConnectionStatus({ message }: { message: string }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // Browsers can disable service workers. The online shelf still works.
      });
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return offline ? (
    <p
      role="status"
      className="fixed inset-x-0 top-12 z-50 mx-auto w-fit max-w-[90%] rounded-lg border border-separator bg-surface px-3 py-2 text-sm shadow-sm"
    >
      {message}
    </p>
  ) : null;
}
