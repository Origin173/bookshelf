// Only top-level app pages get an offline explanation. All book and API
// requests go directly to the server. Nothing is put into Cache Storage.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const { origin, pathname } = new URL(request.url);
  if (
    origin !== self.location.origin ||
    !(
      pathname === "/" ||
      pathname === "/login" ||
      pathname.startsWith("/read/")
    )
  )
    return;

  event.respondWith(
    fetch(request).catch(() => {
      const zh = self.navigator.language.toLowerCase().startsWith("zh");
      const title = zh ? "暂时无法连接书架" : "Bookshelf is out of reach";
      const help = zh
        ? "请连接网络后重新打开书架。"
        : "Reconnect to open your shelf and continue reading.";
      const retry = zh ? "重新打开书架" : "Open shelf again";
      const html = `<!doctype html><html lang="${zh ? "zh-CN" : "en"}"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>:root{color-scheme:light dark;font-family:system-ui,sans-serif}main{max-width:32rem;margin:18vh auto;padding:0 1.5rem}a{color:LinkText}</style>
<main><h1>${title}</h1><p>${help}</p><a href="/">${retry}</a></main></html>`;
      return new Response(html, {
        status: 503,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
        },
      });
    }),
  );
});
