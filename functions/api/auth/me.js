async function hashToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function onRequestGet({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);

  if (!match) {
    return json({ success: false, message: "Tsy tafiditra." }, 401);
  }

  try {
    const tokenHash = await hashToken(match[1]);
    const user = await env.DB.prepare(
      `SELECT users.id, users.full_name, users.email, users.phone, users.role, users.status, users.security_status
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?
         AND sessions.expires_at > ?
       LIMIT 1`
    ).bind(tokenHash, new Date().toISOString()).first();

    if (!user || user.status !== "active" || user.security_status !== "clear") {
      return json({ success: false, message: "Tsy mavitrika ny kaonty." }, 401);
    }

    return json({
      success: true,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    console.error("AUTH_ME_ERROR:", error);
    return json({ success: false, message: "Nisy olana tamin'ny fanamarinana kaonty." }, 500);
  }
}
