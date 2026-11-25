async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

async function getAdmin(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\\s*)me_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;
  const admin = await env.DB.prepare(`
    SELECT users.id
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      AND users.role = 'admin' AND users.status = 'active'
      AND users.security_status = 'clear'
    LIMIT 1
  `).bind(await hashToken(match[1]), new Date().toISOString()).first();
  return admin || null;
}

export async function onRequestGet({ request, env }) {
  try {
    const admin = await getAdmin(request, env);
    if (!admin) return json({ success: false, message: "Tsy nahazo alalana." }, 403);

    const tableNames = ["wallets", "wallet_transactions", "withdrawals"];
    const schema = {};

    for (const table of tableNames) {
      const exists = await env.DB.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
      ).bind(table).first();

      if (!exists) {
        schema[table] = { exists: false, columns: [], indexes: [], foreign_keys: [] };
        continue;
      }

      const [columns, indexes, foreignKeys] = await Promise.all([
        env.DB.prepare(`PRAGMA table_info(${table})`).all(),
        env.DB.prepare(`PRAGMA index_list(${table})`).all(),
        env.DB.prepare(`PRAGMA foreign_key_list(${table})`).all()
      ]);

      schema[table] = {
        exists: true,
        create_sql: exists.sql || null,
        columns: columns.results || [],
        indexes: indexes.results || [],
        foreign_keys: foreignKeys.results || []
      };
    }

    return json({ success: true, schema });
  } catch (error) {
    console.error("ADMIN_DB_SCHEMA_ERROR:", error);
    return json({
      success: false,
      message: "Tsy afaka naka ny firafitry ny tabilao. Hamarino raha tohanan'ny D1 ny PRAGMA."
    }, 500);
  }
}
