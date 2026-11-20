async function hashToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);

  try {
    if (match) {
      const tokenHash = await hashToken(match[1]);
      await env.DB.prepare(
        "DELETE FROM sessions WHERE token_hash = ?"
      ).bind(tokenHash).run();
    }

    return Response.json(
      {
        success: true,
        message: "Nivoaka soa aman-tsara ny kaontinao."
      },
      {
        headers: {
          "Set-Cookie": "me_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  } catch (error) {
    console.error("LOGOUT_ERROR:", error);

    return Response.json(
      {
        success: false,
        message: "Tsy tontosa ny fivoahana. Andramo indray."
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}
