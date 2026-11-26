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

  const tokenHash = await hashToken(match[1]);
  return env.DB.prepare(`
    SELECT users.id
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
      AND users.role = 'admin'
      AND users.status = 'active'
      AND users.security_status = 'clear'
    LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first();
}

/*
 * Read-only financial consistency check.
 * It never changes wallet balances or transaction records.
 * Only confirmed ledger entries are compared with the current balance.
 */
export async function onRequestGet({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);
    if (!admin) {
      return json({ success: false, message: "Tsy nahazo alalana." }, 403);
    }

    const [totals, rows, pendingWithdrawals] = await Promise.all([
      env.DB.prepare(`
        SELECT
          COUNT(*) AS wallet_count,
          COALESCE(SUM(balance_ariary), 0) AS total_wallet_balance
        FROM wallets
      `).first(),

      env.DB.prepare(`
        SELECT
          w.user_id,
          w.balance_ariary,
          COALESCE(SUM(
            CASE
              WHEN t.status = 'confirmed' AND t.direction = 'credit'
                THEN t.amount_ariary
              WHEN t.status = 'confirmed' AND t.direction = 'debit'
                THEN -t.amount_ariary
              ELSE 0
            END
          ), 0) AS confirmed_ledger_balance,
          SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending_transactions,
          COUNT(t.id) AS transaction_count
        FROM wallets w
        LEFT JOIN wallet_transactions t ON t.user_id = w.user_id
        GROUP BY w.user_id, w.balance_ariary
        ORDER BY w.user_id ASC
        LIMIT 500
      `).all(),

      env.DB.prepare(`
        SELECT
          COUNT(*) AS pending_count,
          COALESCE(SUM(amount_ariary), 0) AS pending_amount
        FROM withdrawals
        WHERE status = 'pending'
      `).first()
    ]);

    const wallets = rows.results || [];
    const discrepancies = wallets
      .filter(row => Number(row.balance_ariary) !== Number(row.confirmed_ledger_balance))
      .map(row => ({
        user_id: Number(row.user_id),
        wallet_balance_ariary: Number(row.balance_ariary),
        confirmed_ledger_balance_ariary: Number(row.confirmed_ledger_balance),
        difference_ariary: Number(row.balance_ariary) - Number(row.confirmed_ledger_balance),
        pending_transactions: Number(row.pending_transactions || 0),
        transaction_count: Number(row.transaction_count || 0)
      }));

    return json({
      success: true,
      read_only: true,
      summary: {
        wallet_count: Number(totals?.wallet_count || 0),
        total_wallet_balance_ariary: Number(totals?.total_wallet_balance || 0),
        pending_withdrawal_count: Number(pendingWithdrawals?.pending_count || 0),
        pending_withdrawal_amount_ariary: Number(pendingWithdrawals?.pending_amount || 0),
        checked_wallet_count: wallets.length,
        discrepancy_count: discrepancies.length,
        truncated: wallets.length === 500
      },
      discrepancies
    });
  } catch (error) {
    console.error("ADMIN_WALLET_AUDIT_ERROR:", error);
    return json({
      success: false,
      message: "Tsy tontosa ny fanamarinana ny Wallet. Jereo ny firafitry ny D1."
    }, 500);
  }
}
