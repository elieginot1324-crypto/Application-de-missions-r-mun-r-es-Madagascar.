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
  if (!match) return null;

  const tokenHash = await hashToken(match[1]);
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
  `).bind(tokenHash, new Date().toISOString()).first();

  return admin || null;
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


export async function onRequestPost({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);
    if (!admin) {
      return json({ success: false, message: "Tsy nahazo alalana." }, 403);
    }

    const body = await request.json();
    const memberId = Number(body.member_id);
    const action = String(body.action || "");

    if (!Number.isSafeInteger(memberId) || memberId < 1 || !["approve", "reject"].includes(action)) {
      return json({ success: false, message: "Tsy mety ny fangatahana." }, 400);
    }

    const member = await env.DB.prepare(`
      SELECT id, full_name, role
      FROM users
      WHERE id = ? AND status = 'pending' AND security_status = 'review'
        AND role IN ('worker', 'client')
      LIMIT 1
    `).bind(memberId).first();

    if (!member) {
      return json({ success: false, message: "Tsy hita ilay kaonty miandry fanamarinana na efa voakarakara." }, 404);
    }

    const approved = action === "approve";
    const nextStatus = approved ? "active" : "suspended";
    const nextSecurity = approved ? "clear" : "rejected";

    const update = await env.DB.prepare(`
      UPDATE users
      SET status = ?, security_status = ?
      WHERE id = ? AND status = 'pending' AND security_status = 'review'
    `).bind(nextStatus, nextSecurity, memberId).run();

    if (!update.meta?.changes) {
      return json({ success: false, message: "Efa nisy nikarakara ity kaonty ity." }, 409);
    }

    const message = approved
      ? "Neken'ny Administrateur ny kaontinao. Afaka miditra amin'ny MADAGASCAR EARN ianao. Ny asa mitaky mari-pahaizana dia mbola mety mila fanamarinana antontan-taratasy manokana."
      : "Tsy neken'ny Administrateur ny kaontinao taorian'ny fanadihadiana.";

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
        VALUES (?, ?, 'user', ?, ?)
      `).bind(admin.id, approved ? "member_security_approved" : "member_security_rejected", memberId,
        approved ? "Neken'ny Administrateur ny fanamarinana fiarovana." : "Nolavin'ny Administrateur ny kaonty taorian'ny fanadihadiana."),
      env.DB.prepare(`
        INSERT INTO notifications (user_id, title, message, is_read)
        VALUES (?, ?, ?, 0)
      `).bind(memberId, approved ? "Neken'ny Administrateur ny kaontinao" : "Nolavina ny kaontinao", message)
    ]);

    return json({
      success: true,
      message: approved
        ? "Nekena ny kaonty. Afaka miditra ny mpikambana."
        : "Nolavina sy naato ny kaonty."
    });
  } catch (error) {
    console.error("ADMIN_MEMBER_REVIEW_ERROR:", error);
    return json({ success: false, message: "Nisy olana teo am-panamarinana ny kaonty." }, 500);
  }
}
