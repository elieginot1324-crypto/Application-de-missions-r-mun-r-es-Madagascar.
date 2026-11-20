function json(data, status = 200) {
  return Response.json(data, { status, headers: {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  }});
}
async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function getAdmin(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;
  const admin = await env.DB.prepare(`
    SELECT users.id, users.role, users.status
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? LIMIT 1
  `).bind(await hashToken(match[1]), new Date().toISOString()).first();
  return admin && admin.role === "admin" && admin.status === "active" ? admin : null;
}
export async function onRequestGet({ request, env }) {
  try {
    const admin = await getAdmin(request, env);
    if (!admin) return json({ success:false, message:"Tsy nahazo alalana. Administrateur ihany." }, 403);
    const result = await env.DB.prepare(`
      SELECT m.id, m.client_id, m.title, m.description, m.category,
             m.budget_ariary, m.workers_needed, m.status, m.created_at,
             u.full_name AS client_name
      FROM missions m JOIN users u ON u.id = m.client_id
      WHERE m.status = 'pending'
      ORDER BY m.created_at ASC LIMIT 100
    `).all();
    return json({ success:true, missions:result.results || [] });
  } catch (error) {
    console.error("ADMIN_PENDING_MISSIONS_ERROR:", error);
    return json({ success:false, message:"Nisy olana tamin'ny fakana ireo iraka miandry." }, 500);
  }
}
export async function onRequestPost({ request, env }) {
  try {
    const admin = await getAdmin(request, env);
    if (!admin) return json({ success:false, message:"Tsy nahazo alalana. Administrateur ihany." }, 403);
    const data = await request.json();
    const id = Number(data.mission_id);
    const action = String(data.action || "");
    const note = String(data.note || "").trim().slice(0, 1000);
    if (!Number.isSafeInteger(id) || id < 1 || !["publish","reject"].includes(action)) {
      return json({ success:false, message:"Tsy mety ny fangatahana." }, 400);
    }
    if (action === "publish" && (data.funding_confirmed !== true || note.length < 8)) {
      return json({ success:false, message:"Tsy maintsy hamafisina fa voaray sy voamarina ny famatsiam-bola, ary asiana fanamarihana." }, 400);
    }
    const mission = await env.DB.prepare(`
      SELECT id, client_id, title FROM missions WHERE id = ? AND status = 'pending' LIMIT 1
    `).bind(id).first();
    if (!mission) return json({ success:false, message:"Tsy hita ilay iraka miandry na efa voakarakara." }, 404);
    const nextStatus = action === "publish" ? "open" : "cancelled";
    const update = await env.DB.prepare(`
      UPDATE missions SET status = ? WHERE id = ? AND status = 'pending'
    `).bind(nextStatus, id).run();
    if (!update.meta?.changes) return json({ success:false, message:"Efa nisy nikarakara io iraka io." }, 409);
    const description = action === "publish"
      ? "Navoaka ny iraka rehefa nohamafisin'ny Administrateur ny famatsiam-bola. Fanamarihana: " + note
      : "Nolavin'ny Administrateur ny iraka. Antony: " + (note || "Tsy nomena.");
    await env.DB.prepare(`
      INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
      VALUES (?, ?, 'mission', ?, ?)
    `).bind(admin.id, action === "publish" ? "mission_published_after_funding_check" : "mission_rejected", id, description).run();
    await env.DB.prepare(`
      INSERT INTO notifications (user_id, title, message, is_read)
      VALUES (?, ?, ?, 0)
    `).bind(mission.client_id,
      action === "publish" ? "Navoaka ny irakao" : "Nolavina ny irakao",
      action === "publish"
        ? "Navoaka ho hitan'ny Mpiasa ny iraka: " + mission.title
        : "Nolavin'ny Administrateur ny iraka: " + mission.title + (note ? ". Antony: " + note : "")
    ).run();
    return json({ success:true, message: action === "publish"
      ? "Navoaka ny iraka. Hitan'ny Mpiasa izao izy."
      : "Nolavina ilay iraka ary nampandrenesina ny Mpanjifa." });
  } catch (error) {
    console.error("ADMIN_MISSION_REVIEW_ERROR:", error);
    return json({ success:false, message:"Nisy olana tamin'ny fanamarinana ny iraka." }, 500);
  }
}
