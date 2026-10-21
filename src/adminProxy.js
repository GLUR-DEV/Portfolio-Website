// Forwards /admin to the ASP.NET app on Azure.
// The app only answers when the request carries the secret header below, so the plain
// azurewebsites.net address on its own shows nothing.
//
// Needs: env.API_ORIGIN (already in wrangler.toml) and the secret ADMIN_ORIGIN_SECRET:
//   npx wrangler secret put ADMIN_ORIGIN_SECRET      (same value as Azure's Admin__OriginSecret)

export async function handleAdmin(request, env) {
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!env.ADMIN_ORIGIN_SECRET || !env.API_ORIGIN) return notFound();

  const url = new URL(request.url);

  // Cloudflare Access is set up for the lower-case path. The app writes some links as /Admin,
  // so send any other capitalisation to the lower-case address first. Only /admin is ever forwarded.
  const lower = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  if (!lower) {
    const fixed = new URL(request.url);
    fixed.pathname = "/admin" + url.pathname.slice("/admin".length);
    return Response.redirect(fixed.toString(), 308);
  }

  const origin = new URL(env.API_ORIGIN);
  const target = new URL(url.pathname + url.search, origin);

  const headers = new Headers(request.headers);
  headers.set("X-Origin-Secret", env.ADMIN_ORIGIN_SECRET);          // always ours, never the visitor's
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) headers.set("X-Client-Ip", ip); else headers.delete("X-Client-Ip");
  headers.set("X-Forwarded-Proto", "https");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers,
    body: hasBody ? request.body : null,
    redirect: "manual",                                              // pass redirects to the browser untouched
    cf: { cacheTtl: 0, cacheEverything: false },
  });

  const response = new Response(upstream.body, upstream);            // copies status and headers (including Set-Cookie)
  response.headers.set("Cache-Control", "no-store");
  response.headers.delete("Server");
  response.headers.delete("X-Powered-By");

  // The app sees the azurewebsites.net host, so redirects it builds point there. Point them at the public site.
  const location = response.headers.get("Location");
  if (location && location.startsWith(origin.origin)) {
    response.headers.set("Location", url.origin + location.slice(origin.origin.length));
  }
  return response;
}
