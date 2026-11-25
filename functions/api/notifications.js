function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }});
}
async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function getUser(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;
  return env.DB.prepare(`SELECT users.id, users.role, users.status, users.security_status FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? LIMIT 1`)
    .bind(await hashToken(match[1]), new Date().toISOString()).first();
}
export async function onRequestGet({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user || user.status !== "active" || user.security_status !== "clear") return json({ success:false, message:"Midira amin'ny kaonty aloha." }, 401);
    const result = await env.DB.prepare(`SELECT id, title, message, is_read, created_at
      FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`).bind(user.id).all();
    return json({ success:true, notifications:result.results || [] });
  } catch (error) {
    console.error("NOTIFICATIONS_LIST_ERROR:", error);
    return json({ success:false, message:"Tsy afaka naka ny fampandrenesana." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user || user.status !== "active" || user.security_status !== "clear") {
      return json({ success: false, message: "Midira amin'ny kaonty mavitrika aloha." }, 401);
    }

    const body = await request.json();
    const id = Number(body.notification_id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return json({ success: false, message: "Tsy mety ny laharan'ny fampandrenesana." }, 400);
    }

    const notification = await env.DB.prepare(
      "SELECT id FROM notifications WHERE id = ? AND user_id = ? LIMIT 1"
    ).bind(id, user.id).first();

    if (!notification) {
      return json({ success: false, message: "Tsy hita ilay fampandrenesana." }, 404);
    }

    await env.DB.prepare(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?"
    ).bind(id, user.id).run();

    return json({ success: true, message: "Voamarika fa efa novakiana ilay fampandrenesana." });
  } catch (error) {
    console.error("NOTIFICATION_READ_ERROR:", error);
    return json({ success: false, message: "Tsy tontosa ny fanamarihana fa efa novakiana." }, 500);
  }
}
