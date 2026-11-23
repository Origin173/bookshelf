"use client";

import { BUTTON_QUIET } from "@/app/ui";
import { SIGN_OUT_CHANNEL } from "@/lib/session-events";

export function SignOutForm({
  account,
  label,
}: {
  account: string;
  label: string;
}) {
  return (
    <form
      action="/login/session"
      method="post"
      className="flex items-center gap-2"
      onSubmit={() => {
        if (typeof BroadcastChannel === "function") {
          const channel = new BroadcastChannel(SIGN_OUT_CHANNEL);
          channel.postMessage("sign-out");
          channel.close();
        }
      }}
    >
      <input type="hidden" name="intent" value="logout" />
      <span className="text-sm text-secondary">{account}</span>
      <button className={BUTTON_QUIET} type="submit">
        {label}
      </button>
    </form>
  );
}
