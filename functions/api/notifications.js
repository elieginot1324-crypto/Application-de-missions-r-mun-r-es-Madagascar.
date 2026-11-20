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
  return env.DB.prepare(`SELECT users.id, users.role, users.status FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? LIMIT 1`)
    .bind(await hashToken(match[1]), new Date().toISOString()).first();
}
export async function onRequestGet({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user || user.status !== "active") return json({ success:false, message:"Midira amin'ny kaonty aloha." }, 401);
    const result = await env.DB.prepare(`SELECT id, title, message, is_read, created_at
      FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`).bind(user.id).all();
    return json({ success:true, notifications:result.results || [] });
  } catch (error) {
    console.error("NOTIFICATIONS_LIST_ERROR:", error);
    return json({ success:false, message:"Tsy afaka naka ny fampandrenesana." }, 500);
  }
}
