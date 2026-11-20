
function jsonError(message, status) {
  return Response.json(
    { success: false, message },
    {
      status,
      headers: { "Cache-Control": "no-store" }
    }
  );
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  const isAdminPage = url.pathname === "/admin.html";
  const isAdminApi = url.pathname.startsWith("/api/admin/");

  if (!isAdminPage && !isAdminApi) {
    return next();
  }

  const deny = (message, status) => {
    if (isAdminApi) {
      return jsonError(message, status);
    }

    return Response.redirect(new URL("/", request.url), 302);
  };

  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(
    /(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/
  );

  if (!match) {
    return deny("Tsy nahazo alalana.", 401);
  }

  try {
    const tokenHash = await hashToken(match[1]);

    const user = await env.DB.prepare(
      `SELECT users.id, users.role, users.status
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?
         AND sessions.expires_at > ?
       LIMIT 1`
    )
      .bind(tokenHash, new Date().toISOString())
      .first();

    if (!user || user.role !== "admin" || user.status !== "active") {
      return deny("Tsy mahazo miditra amin'ity sehatra ity ianao.", 403);
    }

    const response = await next();

    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });

  } catch (error) {
    console.error("ADMIN_ACCESS_ERROR:", error);

    return jsonError(
      "Nisy olana teo am-panamarinana ny fidirana.",
      500
    );
  }
}
