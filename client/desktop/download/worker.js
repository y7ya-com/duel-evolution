// download.ygoevolution.com: the Windows download's public address, apart from the game server's Worker.
//   /             302 to the newest release's installer (the url in its latest.json)
//   /latest.json  that latest.json, which installed copies check at launch (tauri.conf.json's first endpoint)
// The files stay on GitHub Releases: the newest non-draft, non-prerelease release, cached here 5 minutes.
const LATEST = "https://github.com/y7ya-com/duel-evolution/releases/latest/download/latest.json";

async function latest() {
  const r = await fetch(LATEST, { cf: { cacheTtl: 300, cacheEverything: true } });
  return r.ok ? r.json() : null;
}

const page = (status, text) => new Response(`<!doctype html><meta charset="utf-8"><title>Duel Evolution</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#000;color:#c9d2e3;font:16px system-ui,sans-serif">
<p>${text} <a style="color:#7aa7f0" href="https://ygoevolution.com/">Play in your browser</a>.</p>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

export default {
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/latest.json") {
      const j = await latest();
      return j ? Response.json(j, { headers: { "Cache-Control": "public, max-age=300" } }) : new Response("no release", { status: 404 });
    }
    if (pathname === "/" || pathname === "/windows") {
      const url = (await latest())?.platforms?.["windows-x86_64"]?.url;
      return url ? Response.redirect(url, 302) : page(503, "The Windows download isn't available yet.");
    }
    return page(404, "Nothing here.");
  },
};
