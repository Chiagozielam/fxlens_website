// Link previews for app-shared links: fxlens.app/t/<post> and /@<handle>.
// Crawlers (WhatsApp, X, Telegram, Facebook, LinkedIn, Slack, Discord,
// iMessage, Google) read the first HTML response, so we fetch the public post
// or profile and put its title, description and image into the page head.
// People get the normal page (which opens the app). Canonical points at the
// web Townhall, which renders the content, so search engines index one copy.
const FN = "https://fra.cloud.appwrite.io/v1/functions/687828c4003e4b0a8427/executions";
const PROJECT = "6854257a000c3a519205";
const FALLBACK_IMG = "https://townhall.fxlens.app/og-townhall.jpg";

async function call(route: string, payload: Record<string, unknown>) {
  const r = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Appwrite-Project": PROJECT },
    body: JSON.stringify({ body: JSON.stringify({ route, payload }), async: false, path: `/${route}`, method: "POST" }),
  });
  const j = await r.json();
  return JSON.parse(j.responseBody || "{}");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const res = await context.next();
  try {
    const url = new URL(request.url);
    const post = url.pathname.match(/^\/t\/([A-Za-z0-9_.-]{1,36})\/?$/);
    const prof = url.pathname.match(/^\/@([A-Za-z0-9_.-]{2,40})\/?$/);
    let title = "", desc = "", image = "", canonical = "", type = "article";
    if (post) {
      const d = (await call("getPublicTownhallPost", { postId: post[1] }))?.data;
      if (!d?.post) return res;
      const p = d.post;
      title = `${p.authorName || "Trader"}${p.authorHandle ? ` (@${p.authorHandle})` : ""} on FxLens Townhall`;
      desc = clip(String(p.text || "A post on FxLens Townhall.").replace(/\s+/g, " "), 200);
      image = (p.imageUrls && p.imageUrls[0]) || p.imageUrl || "";
      canonical = `https://townhall.fxlens.app/t/${post[1]}`;
    } else if (prof) {
      const d = (await call("getPublicTownhallProfile", { handle: prof[1] }))?.data;
      if (!d?.profile) return res;
      const p = d.profile;
      title = `${p.name || "Trader"} (@${p.handle || prof[1]}) · FxLens Townhall`;
      const followers = d.counts?.followers ?? 0;
      const rec = d.callStats?.calls ? ` · ${d.callStats.calls} graded calls, ${d.callStats.winRate ?? 0}% win rate` : "";
      const fc = d.counts?.followers ?? 0;
      const bits = [p.bio, fc ? `${fc} follower${fc === 1 ? "" : "s"}` : "", rec.replace(/^ · /, "")].filter(Boolean);
      desc = clip(bits.length ? bits.join(" · ") : `Trader on FxLens Townhall: setups, trade calls graded on live prices, and results.`, 200);
      image = p.profileImage || "";
      canonical = `https://townhall.fxlens.app/@${p.handle || prof[1]}`;
      type = "profile";
    } else {
      return res;
    }
    // Post screenshots → big card. Profiles/text posts → the branded card
    // (a tiny avatar stretched to a big card looks broken).
    const big = !!image && !!post;
    const img = big ? image : FALLBACK_IMG;
    const tags = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(desc)}" />`,
      `<link rel="canonical" href="${esc(canonical)}" />`,
      `<meta property="og:type" content="${type}" />`,
      `<meta property="og:site_name" content="FxLens Townhall" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(desc)}" />`,
      `<meta property="og:url" content="${esc(url.origin + url.pathname)}" />`,
      `<meta property="og:image" content="${esc(img)}" />`,
      ...(big ? [] : [`<meta property="og:image:width" content="1200" />`, `<meta property="og:image:height" content="630" />`]),
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(desc)}" />`,
      `<meta name="twitter:image" content="${esc(img)}" />`,
    ].join("\n    ");
    const html = (await res.text())
      .replace(/<title>[^<]*<\/title>/, "")
      .replace(/<meta name="description"[^>]*>\s*/g, "")
      .replace(/<meta (?:property="og:|name="twitter:)[^>]*>\s*/g, "")
      .replace(/<link rel="canonical"[^>]*>\s*/g, "")
      .replace("</head>", `    ${tags}\n  </head>`);
    const h = new Headers(res.headers);
    h.delete("content-length");
    return new Response(html, { status: res.status, headers: h });
  } catch {
    return res;
  }
};

export const config = { path: ["/t/*", "/@*"] };
