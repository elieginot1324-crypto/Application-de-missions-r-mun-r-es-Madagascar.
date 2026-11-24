function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function requireAdmin(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return false;

  const tokenHash = await hashToken(match[1]);
  const admin = await env.DB.prepare(`
    SELECT users.id
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
      AND users.role = 'admin'
      AND users.status = 'active'
    LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first();

  return Boolean(admin);
}

export async function onRequestGet({ request, env }) {
  try {
    if (!await requireAdmin(request, env)) {
      return json({ success: false, message: "Tsy nahazo alalana." }, 403);
    }

    const result = await env.DB.prepare(`
      SELECT id, full_name, email, phone, role, status, security_status
      FROM users
      WHERE status = 'pending'
        AND role IN ('worker', 'client')
      ORDER BY id DESC
      LIMIT 100
    `).all();

    return json({
      success: true,
      members: result.results || [],
      total: (result.results || []).length
    });
  } catch (error) {
    console.error("ADMIN_MEMBERS_ERROR:", error);
    return json({
      success: false,
      message: "Nisy olana teo am-pakana ny lisitry ny mpikambana."
    }, 500);
  }
}
