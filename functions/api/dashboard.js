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
    return json({ success: false, message: "Mila miditra amin'ny kaontinao aloha." }, 401);
  }

  try {
    const tokenHash = await hashToken(match[1]);
    const user = await env.DB.prepare(`
      SELECT users.id, users.full_name, users.email, users.phone,
             users.role, users.status, users.security_status, wallets.balance_ariary
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      LEFT JOIN wallets ON wallets.user_id = users.id
      WHERE sessions.token_hash = ?
        AND sessions.expires_at > ?
      LIMIT 1
    `).bind(tokenHash, new Date().toISOString()).first();

    if (!user || user.status !== "active" || user.security_status !== "clear") {
      return json({ success: false, message: "Tsy mavitrika na tsy voamarina ny kaontinao." }, 403);
    }

    return json({
      success: true,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status
      },
      wallet: {
        balance_ariary: Number(user.balance_ariary || 0)
      }
    });
  } catch (error) {
    console.error("DASHBOARD_ERROR:", error);
    return json({ success: false, message: "Nisy olana teo am-pakana ny mombamomba ny kaonty." }, 500);
  }
}
