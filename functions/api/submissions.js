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
    SELECT users.id, users.role, users.status FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? LIMIT 1
  `).bind(await hashToken(match[1]), new Date().toISOString()).first();
}
export async function onRequestGet({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user || user.status !== "active") return json({success:false,message:"Midira amin'ny kaonty voamarina aloha."},401);
    let result;
    if (user.role === "worker") {
      result = await env.DB.prepare(`
        SELECT s.id, s.mission_id, s.details, s.proof_url, s.status, s.submitted_at,
               m.title AS mission_title, m.budget_ariary, m.workers_needed
        FROM submissions s JOIN missions m ON m.id = s.mission_id
        WHERE s.worker_id = ? ORDER BY s.submitted_at DESC LIMIT 100
      `).bind(user.id).all();
    } else if (user.role === "client") {
      return json({success:false,message:"Ny Administrateur ihany no mijery ny asa nalefan'ny Mpiasa."},403);
    } else return json({success:false,message:"Tsy natao ho an'ity kaonty ity."},403);
    return json({success:true, submissions:result.results || []});
  } catch(error) {
    console.error("SUBMISSIONS_LIST_ERROR:",error);
    return json({success:false,message:"Nisy olana tamin'ny fakana ny asa nalefa."},500);
  }
}
export async function onRequestPost({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user || user.status !== "active") return json({success:false,message:"Midira amin'ny kaonty voamarina aloha."},401);
    const data = await request.json();
    const action = String(data.action || "submit");
    if (action === "submit") {
      if (user.role !== "worker") return json({success:false,message:"Ny Mpiasa ihany no afaka mandefa asa."},403);
      const missionId = Number(data.mission_id);
      const details = String(data.details || "").trim().slice(0,5000);
      const proofUrl = String(data.proof_url || "").trim();
      if (!Number.isSafeInteger(missionId) || missionId < 1) return json({success:false,message:"Tsy mety ny laharan'ny iraka."},400);
      if (details.length < 10 && !proofUrl) return json({success:false,message:"Ampidiro ny fanazavana na rohy porofo."},400);
      if (proofUrl && (!/^https:\/\//i.test(proofUrl) || proofUrl.length > 2000)) return json({success:false,message:"Rohy porofo tsy mety. HTTPS ihany no azo ampiasaina."},400);
      const existing = await env.DB.prepare("SELECT id, status FROM submissions WHERE mission_id = ? AND worker_id = ? LIMIT 1").bind(missionId,user.id).first();
      if (existing && existing.status !== "revision") return json({success:false,message:"Efa nandefa asa tamin'ity iraka ity ianao."},409);
      if (existing) {
        await env.DB.prepare(`
          UPDATE submissions SET details = ?, proof_url = ?, status = 'submitted', submitted_at = ?
          WHERE id = ? AND worker_id = ? AND status = 'revision'
        `).bind(details || null,proofUrl || null,new Date().toISOString(),existing.id,user.id).run();
        return json({success:true,message:"Nalefa indray ny asa nasiam-panitsiana."});
      }
      const result = await env.DB.prepare(`
        INSERT INTO submissions (mission_id, worker_id, details, proof_url, status, submitted_at)
        SELECT ?, ?, ?, ?, 'submitted', ?
        WHERE EXISTS (SELECT 1 FROM missions WHERE id = ? AND status = 'open')
          AND (SELECT COUNT(*) FROM submissions
               WHERE mission_id = ? AND status IN ('submitted','revision','approved'))
              < (SELECT workers_needed FROM missions WHERE id = ?)
          AND NOT EXISTS (SELECT 1 FROM submissions WHERE mission_id = ? AND worker_id = ?)
      `).bind(missionId,user.id,details || null,proofUrl || null,new Date().toISOString(),missionId,missionId,missionId,missionId,user.id).run();
      if (!result.meta?.changes) return json({success:false,message:"Tsy misy toerana intsony na tsy misokatra ilay iraka."},409);
      return json({success:true,message:"Voaray ny asa nalefanao. Miandry ny fanamarinana ataon'ny Administrateur."},201);
    }
    if (action === "review") {
      if (user.role !== "admin") return json({success:false,message:"Ny Administrateur ihany no afaka manamarina ny asa nalefan'ny Mpiasa."},403);
      const submissionId = Number(data.submission_id);
      const decision = String(data.decision || "");
      if (!Number.isSafeInteger(submissionId) || submissionId < 1 || !["revision","rejected","approved"].includes(decision)) {
        return json({success:false,message:"Safidy fanamarinana tsy mety."},400);
      }
      const submission = await env.DB.prepare(`
        SELECT s.id, s.worker_id, m.title AS mission_title FROM submissions s JOIN missions m ON m.id = s.mission_id
        WHERE s.id = ? AND m.client_id = ? AND s.status = 'submitted' LIMIT 1
      `).bind(submissionId,user.id).first();
      if (!submission) return json({success:false,message:"Tsy hita ilay asa na efa voakarakara."},404);
      const update = await env.DB.prepare("UPDATE submissions SET status = ? WHERE id = ? AND status = 'submitted'").bind(decision,submissionId).run();
      if (!update.meta?.changes) return json({success:false,message:"Efa nisy nikarakara ity asa ity."},409);
      const title = decision === "approved" ? "Neken'ny Mpanjifa ny asanao" : decision === "revision" ? "Mila fanitsiana ny asanao" : "Nolavin'ny Mpanjifa ny asanao";
      const message = decision === "approved" ? "Neken'ny Mpanjifa ny asa nataonao ho an'ny iraka: " + submission.mission_title + ". Mbola miandry fanamarinana famatsiam-bola ny valisoa." : decision === "revision" ? "Angatahin'ny Mpanjifa ny hanitsianao ny asa ho an'ny iraka: " + submission.mission_title : "Nolavin'ny Mpanjifa ny asa nalefanao ho an'ny iraka: " + submission.mission_title;
      await env.DB.batch([
        env.DB.prepare("INSERT INTO notifications (user_id, title, message, is_read) VALUES (?, ?, ?, 0)").bind(submission.worker_id,title,message),
        env.DB.prepare("INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details) VALUES (?, ?, 'submission', ?, ?)").bind(user.id,"submission_"+decision,submissionId,"Fanapahan-kevitry ny Mpanjifa: "+decision)
      ]);
      return json({success:true,message:decision === "approved" ? "Nekena ny asa. Hampandrenesina ny Mpiasa; mbola tsy nafindra ny valisoa raha tsy voamarina ny famatsiam-bola." : decision === "revision" ? "Naverina amin'ny Mpiasa ilay asa mba hanitsiany azy." : "Voarainao ny fandavana ilay asa."});
    }
    return json({success:false,message:"Asa angatahina tsy fantatra."},400);
  } catch(error) {
    console.error("SUBMISSION_ACTION_ERROR:",error);
    return json({success:false,message:"Nisy olana tamin'ny fikirakirana ny asa."},500);
  }
}
