
function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestGet({ request, env }) {
  try {
    // 1. Maka ny session
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(
      /(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/
    );

    if (!match) {
      return jsonResponse({
        success: false,
        message: "Tsy nahazo alalana."
      }, 401);
    }

    // 2. Manamarina ny administrateur
    const tokenHash = await hashToken(match[1]);

    const admin = await env.DB.prepare(`
      SELECT users.id, users.role, users.status
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
        AND sessions.expires_at > ?
      LIMIT 1
    `).bind(tokenHash, new Date().toISOString()).first();

    if (
      !admin ||
      admin.role !== "admin" ||
      admin.status !== "active"
    ) {
      return jsonResponse({
        success: false,
        message: "Tsy mahazo miditra amin'ity fizarana ity ianao."
      }, 403);
    }

    // 3. Maka ny antontan'isa
    const [
      users,
      missions,
      withdrawals,
      wallets,
      submissions,
      referrals
    ] = await Promise.all([

      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN role = 'worker' THEN 1 ELSE 0 END) AS workers,
          SUM(CASE WHEN role = 'client' THEN 1 ELSE 0 END) AS clients,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
        FROM users
      `).first(),

      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
        FROM missions
      `).first(),

      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
          COALESCE(SUM(
            CASE WHEN status = 'pending'
            THEN amount_ariary ELSE 0 END
          ), 0) AS pending_amount
        FROM withdrawals
      `).first(),

      env.DB.prepare(`
        SELECT
          COUNT(*) AS wallets_count,
          COALESCE(SUM(balance_ariary), 0) AS total_balance
        FROM wallets
      `).first(),

      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
          SUM(CASE WHEN status = 'revision' THEN 1 ELSE 0 END) AS revision,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
        FROM submissions
      `).first(),

      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid
        FROM referrals
      `).first()
    ]);

    // 4. Mamerina ny antontan'isa
    return jsonResponse({
      success: true,
      statistics: {
        users,
        missions,
        withdrawals,
        wallets,
        submissions,
        referrals
      }
    });

  } catch (error) {
    console.error("ADMIN_STATS_ERROR:", error);

    return jsonResponse({
      success: false,
      message: "Nisy olana teo am-pakana ny antontan'isa."
    }, 500);
  }
}
