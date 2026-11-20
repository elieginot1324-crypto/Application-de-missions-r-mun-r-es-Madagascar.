function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function hashToken(token) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestGet({ request, env }) {
  try {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;[ \t]*)me_session=([a-f0-9]{64})(?:;|$)/);

    if (!match) {
      return jsonResponse({ success: false, message: "Tsy nahazo alalana." }, 401);
    }

    const tokenHash = await hashToken(match[1]);
    const admin = await env.DB.prepare(`
      SELECT users.id, users.role, users.status
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
        AND sessions.expires_at > ?
      LIMIT 1
    `).bind(tokenHash, new Date().toISOString()).first();

    if (!admin || admin.role !== "admin" || admin.status !== "active") {
      return jsonResponse({ success: false, message: "Tsy mahazo miditra amin'ity fizarana ity ianao." }, 403);
    }

    // Tabilao voafaritra mialoha ihany no jerena; tsy mamerina angona manokan'ny mpikambana.
    const tableNames = [
      "missions",
      "submissions",
      "wallet_transactions",
      "withdrawals",
      "referrals",
      "notifications",
      "audit_logs"
    ];

    const schema = {};
    for (const table of tableNames) {
      const result = await env.DB.prepare(`PRAGMA table_info("${table}")`).all();
      schema[table] = (result.results || []).map(column => ({
        name: column.name,
        type: column.type,
        notnull: column.notnull,
        primaryKey: column.pk
      }));
    }

    return jsonResponse({ success: true, schema });
  } catch (error) {
    console.error("ADMIN_SCHEMA_ERROR:", error);
    return jsonResponse({
      success: false,
      message: "Nisy olana teo am-pamakiana ny firafitry ny tahiry."
    }, 500);
  }
}
