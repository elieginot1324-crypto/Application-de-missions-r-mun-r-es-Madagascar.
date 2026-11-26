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

async function requireAdmin(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\\s*)me_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;

  const admin = await env.DB.prepare(`
    SELECT users.id
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
      AND users.role = 'admin'
      AND users.status = 'active'
      AND users.security_status = 'clear'
    LIMIT 1
  `).bind(await hashToken(match[1]), new Date().toISOString()).first();

  return admin || null;
}

// Fijerena fotsiny: tsy manova sata na solde ity API ity.
export async function onRequestGet({ request, env }) {
  try {
    if (!await requireAdmin(request, env)) {
      return json({ success: false, message: "Tsy nahazo alalana." }, 403);
    }

    const result = await env.DB.prepare(`
      SELECT
        withdrawals.id,
        withdrawals.user_id,
        users.full_name,
        users.phone AS account_phone,
        withdrawals.amount_ariary,
        withdrawals.fee_ariary,
        withdrawals.method,
        withdrawals.phone_number,
        withdrawals.status,
        withdrawals.requested_at,
        withdrawals.processed_at
      FROM withdrawals
      JOIN users ON users.id = withdrawals.user_id
      ORDER BY
        CASE withdrawals.status
          WHEN 'pending' THEN 0
          WHEN 'approved' THEN 1
          ELSE 2
        END,
        withdrawals.id DESC
      LIMIT 100
    `).all();

    const withdrawals = (result.results || []).map(item => ({
      ...item,
      amount_ariary: Number(item.amount_ariary),
      fee_ariary: Number(item.fee_ariary || 0),
      payout_ariary: Number(item.amount_ariary) - Number(item.fee_ariary || 0)
    }));

    return json({ success: true, withdrawals });
  } catch (error) {
    console.error("ADMIN_WITHDRAWALS_READ_ERROR:", error);
    return json({
      success: false,
      message: "Tsy afaka naka ny fangatahana fisintonam-bola."
    }, 500);
  }
}
