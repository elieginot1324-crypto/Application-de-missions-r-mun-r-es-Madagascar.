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
  try {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);

    if (!match) {
      return json({ success: false, message: "Mila miditra amin'ny kaontinao aloha." }, 401);
    }

    const tokenHash = await hashToken(match[1]);
    const user = await env.DB.prepare(`
      SELECT users.id, users.status, users.security_status, wallets.balance_ariary
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

    const url = new URL(request.url);
    const rawBefore = url.searchParams.get("before");
    const before = rawBefore === null ? null : Number(rawBefore);
    if (before !== null && (!Number.isSafeInteger(before) || before < 1)) {
      return json({ success: false, message: "Tsy mety ny mari-pamantarana pejy." }, 400);
    }

    const limit = 50;
    const result = before === null
      ? await env.DB.prepare(`
          SELECT id, transaction_type, direction, amount_ariary,
                 balance_before_ariary, balance_after_ariary,
                 reference_type, reference_id, description, created_at
          FROM wallet_transactions
          WHERE user_id = ?
          ORDER BY id DESC
          LIMIT ?
        `).bind(user.id, limit).all()
      : await env.DB.prepare(`
          SELECT id, transaction_type, direction, amount_ariary,
                 balance_before_ariary, balance_after_ariary,
                 reference_type, reference_id, description, created_at
          FROM wallet_transactions
          WHERE user_id = ? AND id < ?
          ORDER BY id DESC
          LIMIT ?
        `).bind(user.id, before, limit).all();

    const transactions = result.results || [];
    return json({
      success: true,
      wallet: { balance_ariary: Number(user.balance_ariary || 0) },
      transactions,
      next_before: transactions.length === limit ? transactions[transactions.length - 1].id : null
    });
  } catch (error) {
    console.error("WALLET_TRANSACTIONS_ERROR:", error);
    return json({
      success: false,
      message: "Tsy azo nalaina ny tantaran'ny kitapom-bola. Hamarino fa efa napetraka ny migration wallet."
    }, 500);
  }
}
