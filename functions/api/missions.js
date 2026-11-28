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
async function getUser(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;
  return env.DB.prepare(`
    SELECT users.id, users.full_name, users.role, users.status
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? LIMIT 1
  `).bind(await hashToken(match[1]), new Date().toISOString()).first();
}
export async function onRequestGet({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user || user.status !== "active") return json({ success:false, message:"Midira amin'ny kaonty voamarina aloha." }, 401);
    let rows;
    if (user.role === "worker") {
      rows = await env.DB.prepare(`
        SELECT m.id, m.title, m.description, m.category, m.budget_ariary,
               m.workers_needed, m.status, m.created_at, u.full_name AS client_name,
               CAST(m.budget_ariary / m.workers_needed AS INTEGER) AS reward_per_worker
        FROM missions m JOIN users u ON u.id = m.client_id
        WHERE m.status = 'open'
          AND (SELECT COUNT(*) FROM submissions s
               WHERE s.mission_id = m.id AND s.status IN ('submitted','revision','approved')) < m.workers_needed
        ORDER BY m.created_at DESC LIMIT 100
      `).all();
    } else if (user.role === "client") {
      rows = await env.DB.prepare(`
        SELECT id, title, description, category, budget_ariary, workers_needed, status, created_at
        FROM missions WHERE client_id = ? ORDER BY created_at DESC LIMIT 100
      `).bind(user.id).all();
    } else {
      return json({ success:false, message:"Tsy natao ho an'ity karazana kaonty ity." }, 403);
    }
    return json({ success:true, missions: rows.results || [] });
  } catch (error) {
    console.error("MISSIONS_LIST_ERROR:", error);
    return json({ success:false, message:"Nisy olana tamin'ny fakana ny iraka." }, 500);
  }
}
export async function onRequestPost({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user || user.status !== "active") return json({ success:false, message:"Midira amin'ny kaonty voamarina aloha." }, 401);
    if (user.role !== "admin") return json({ success:false, message:"Ny Administrateur ihany no mamadika fangatahana ekena ho iraka." }, 403);
    const data = await request.json();
    const title = String(data.title || "").trim();
    const description = String(data.description || "").trim();
    const category = String(data.category || "").trim().slice(0, 60) || null;
    const budget = Number(data.budget_ariary);
    const workers = Number(data.workers_needed);
    if (title.length < 5 || title.length > 120) return json({ success:false, message:"Ny lohateny dia tokony ho 5 ka hatramin'ny 120 tarehintsoratra." }, 400);
    if (description.length < 20 || description.length > 5000) return json({ success:false, message:"Ny fanazavana dia tokony ho 20 ka hatramin'ny 5 000 tarehintsoratra." }, 400);
    if (!Number.isSafeInteger(budget) || budget < 1000 || budget > 100000000) return json({ success:false, message:"Tsy mety ny tetibola Ariary." }, 400);
    if (!Number.isInteger(workers) || workers < 1 || workers > 1000 || budget < workers) return json({ success:false, message:"Tsy mety ny isan'ny Mpiasa na ny tetibola." }, 400);
    // Atao pending aloha: mbola tsy misy rafitra famatsiam-bola/escrow voamarina.
    const result = await env.DB.prepare(`
      INSERT INTO missions (client_id, title, description, category, budget_ariary, workers_needed, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).bind(user.id, title, description, category, budget, workers).run();
    return json({ success:true, mission_id: result.meta?.last_row_id ?? null,
      message:"Voaray ny iraka. Miandry fanamarinana sy fandaminana ny famatsiam-bola izy vao haseho amin'ny Mpiasa." }, 201);
  } catch (error) {
    console.error("MISSION_CREATE_ERROR:", error);
    return json({ success:false, message:"Tsy tontosa ny famoronana iraka." }, 500);
  }
}
