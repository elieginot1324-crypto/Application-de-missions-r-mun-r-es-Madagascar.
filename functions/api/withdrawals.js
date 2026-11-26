function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getWorker(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;

  return env.DB.prepare(`
    SELECT users.id, users.role, users.status, users.security_status
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
    LIMIT 1
  `).bind(await hashToken(match[1]), new Date().toISOString()).first();
}

function validOperationKey(value) {
  return typeof value === "string" &&
    /^[a-zA-Z0-9_-]{16,100}$/.test(value);
}

function sameRequest(existing, amount, method, phone) {
  return Number(existing.amount_ariary) === amount &&
    existing.method === method &&
    existing.phone_number === phone;
}

// Ny Mpiasa ihany no mahazo mijery ny fangatahana fisintonam-bolany.
export async function onRequestGet({ request, env }) {
  try {
    const user = await getWorker(request, env);
    if (!user || user.status !== "active" || user.security_status !== "clear") {
      return json({ success: false, message: "Midira amin'ny kaonty mavitrika sy voamarina aloha." }, 401);
    }
    if (user.role !== "worker") {
      return json({ success: false, message: "Ny Mpiasa ihany no afaka mampiasa ity fizarana ity." }, 403);
    }

    const result = await env.DB.prepare(`
      SELECT id, amount_ariary, fee_ariary, method, phone_number,
             status, requested_at, processed_at
      FROM withdrawals
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 30
    `).bind(user.id).all();

    const withdrawals = (result.results || []).map(item => ({
      ...item,
      amount_ariary: Number(item.amount_ariary),
      fee_ariary: Number(item.fee_ariary || 0),
      payout_ariary: Number(item.amount_ariary) - Number(item.fee_ariary || 0)
    }));

    return json({ success: true, withdrawals });
  } catch (error) {
    console.error("WORKER_WITHDRAWALS_READ_ERROR:", error);
    return json({ success: false, message: "Tsy afaka naka ny tantaran'ny fisintonam-bola." }, 500);
  }
}

// Ny fangatahana dia mitahiry ny vola manontolo ho debit voamarina.
// Ny sarany 500 Ar dia esorina amin'ny vola angatahana; tsy misy fandoavana
// Airtel Money na MVola mandeha ho azy eto.
export async function onRequestPost({ request, env }) {
  try {
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) {
      return json({ success: false, message: "Tsy ekena ity fangatahana ity." }, 403);
    }

    const user = await getWorker(request, env);
    if (!user || user.status !== "active" || user.security_status !== "clear") {
      return json({ success: false, message: "Midira amin'ny kaonty mavitrika sy voamarina aloha." }, 401);
    }
    if (user.role !== "worker") {
      return json({ success: false, message: "Ny Mpiasa ihany no afaka mangataka fisintonam-bola." }, 403);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: "Tsy mety ny angona nalefa." }, 400);
    }

    const amount = Number(body.amount_ariary);
    const method = String(body.method || "");
    const phone = String(body.phone_number || "").replace(/[\s-]/g, "");
    const operationKey = body.operation_key;

    if (!Number.isSafeInteger(amount) || amount < 8000 || amount > 100000000) {
      return json({ success: false, message: "Ny vola azo alaina dia manomboka amin'ny 8 000 Ar." }, 400);
    }
    if (!["Airtel Money", "MVola"].includes(method)) {
      return json({ success: false, message: "Safidio ny Airtel Money na MVola." }, 400);
    }
    if (!/^(?:\+261|0)3[2348]\d{7}$/.test(phone)) {
      return json({ success: false, message: "Ampidiro ny laharana finday Malagasy manan-kery." }, 400);
    }
    if (!validOperationKey(operationKey)) {
      return json({ success: false, message: "Tsy mety ny mari-pamantarana ny fangatahana. Avereno alefa." }, 400);
    }

    // Averina ilay fangatahana teo aloha raha mitovy ny key sy ny antsipiriany.
    const existing = await env.DB.prepare(`
      SELECT id, amount_ariary, fee_ariary, method, phone_number, status, requested_at
      FROM withdrawals
      WHERE user_id = ? AND operation_key = ?
      LIMIT 1
    `).bind(user.id, operationKey).first();

    if (existing) {
      if (!sameRequest(existing, amount, method, phone)) {
        return json({ success: false, message: "Efa nampiasaina tamin'ny fangatahana hafa ity mari-pamantarana ity." }, 409);
      }
      return json({
        success: true,
        duplicate: true,
        withdrawal: {
          ...existing,
          amount_ariary: Number(existing.amount_ariary),
          fee_ariary: Number(existing.fee_ariary || 0),
          payout_ariary: Number(existing.amount_ariary) - Number(existing.fee_ariary || 0)
        },
        message: "Efa voaray teo aloha ity fangatahana ity."
      });
    }

    const ledgerKey = "withdrawal:" + operationKey;
    const batch = await env.DB.batch([
      env.DB.prepare(`
        UPDATE wallets
        SET balance_ariary = balance_ariary - ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND balance_ariary >= ?
      `).bind(amount, user.id, amount),

      env.DB.prepare(`
        INSERT INTO withdrawals
          (user_id, amount_ariary, fee_ariary, method, phone_number, status, operation_key)
        SELECT ?, ?, 500, ?, ?, 'pending', ?
        WHERE changes() = 1
      `).bind(user.id, amount, method, phone, operationKey),

      env.DB.prepare(`
        INSERT INTO wallet_transactions
          (user_id, amount_ariary, direction, type, description, status, operation_key)
        SELECT ?, ?, 'debit', 'withdrawal', ?, 'confirmed', ?
        WHERE changes() = 1
      `).bind(
        user.id,
        amount,
        "Fangatahana fisintonam-bola " + method + " (sarany 500 Ar)",
        ledgerKey
      )
    ]);

    const walletChanged = Number(batch?.[0]?.meta?.changes || 0);
    const withdrawalCreated = Number(batch?.[1]?.meta?.changes || 0);
    const ledgerCreated = Number(batch?.[2]?.meta?.changes || 0);

    if (walletChanged !== 1 || withdrawalCreated !== 1 || ledgerCreated !== 1) {
      if (walletChanged === 0) {
        return json({ success: false, message: "Tsy ampy ny ambim-bolanao na tsy mbola misy kitapom-bola." }, 409);
      }
      console.error("WITHDRAWAL_BATCH_INCOMPLETE:", { walletChanged, withdrawalCreated, ledgerCreated });
      return json({ success: false, message: "Tsy voamarina tanteraka ny fangatahana. Aza averina mamorona key vaovao; jereo aloha ny tantaran'ny fisintonam-bola." }, 500);
    }

    const created = await env.DB.prepare(`
      SELECT id, amount_ariary, fee_ariary, method, phone_number, status, requested_at
      FROM withdrawals
      WHERE user_id = ? AND operation_key = ?
      LIMIT 1
    `).bind(user.id, operationKey).first();

    return json({
      success: true,
      withdrawal: {
        ...created,
        amount_ariary: Number(created.amount_ariary),
        fee_ariary: Number(created.fee_ariary || 0),
        payout_ariary: Number(created.amount_ariary) - Number(created.fee_ariary || 0)
      },
      message: "Voaray ny fangatahana. Miandry fanamarinana sy fandoavana ataon'ny Administrateur izy."
    }, 201);
  } catch (error) {
    console.error("WORKER_WITHDRAWAL_CREATE_ERROR:", error);

    // Raha sendra fangatahana roa mitovy key no tonga miaraka, tadiavina ilay
    // fangatahana efa voatahiry fa tsy averina alaina fanindroany ny vola.
    try {
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);
      if (match) {
        const user = await env.DB.prepare(`
          SELECT users.id FROM sessions
          JOIN users ON users.id = sessions.user_id
          WHERE sessions.token_hash = ? AND sessions.expires_at > ?
          LIMIT 1
        `).bind(await hashToken(match[1]), new Date().toISOString()).first();
        const body = await request.clone().json();
        if (user && validOperationKey(body.operation_key)) {
          const existing = await env.DB.prepare(`
            SELECT id, amount_ariary, fee_ariary, method, phone_number, status, requested_at
            FROM withdrawals WHERE user_id = ? AND operation_key = ? LIMIT 1
          `).bind(user.id, body.operation_key).first();
          if (existing && sameRequest(existing, Number(body.amount_ariary), String(body.method || ""), String(body.phone_number || "").replace(/[\s-]/g, ""))) {
            return json({
              success: true,
              duplicate: true,
              withdrawal: {
                ...existing,
                amount_ariary: Number(existing.amount_ariary),
                fee_ariary: Number(existing.fee_ariary || 0),
                payout_ariary: Number(existing.amount_ariary) - Number(existing.fee_ariary || 0)
              },
              message: "Efa voaray ity fangatahana ity."
            });
          }
        }
      }
    } catch (recoveryError) {
      console.error("WITHDRAWAL_IDEMPOTENCY_RECOVERY_ERROR:", recoveryError);
    }

    return json({ success: false, message: "Nisy olana teo am-pikarakarana ny fangatahana. Hamarino aloha ny tantaran'ny fisintonam-bola alohan'ny hanandramana indray." }, 500);
  }
}
