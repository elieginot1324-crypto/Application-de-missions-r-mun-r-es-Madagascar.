function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff" } });
}
async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,"0")).join("");
}
async function getUser(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;
  return env.DB.prepare(`
    SELECT users.id, users.role, users.status
    FROM sessions JOIN users ON users.id=sessions.user_id
    WHERE sessions.token_hash=? AND sessions.expires_at>? LIMIT 1
  `).bind(await hashToken(match[1]), new Date().toISOString()).first();
}
export async function onRequestGet({request,env}) {
  try {
    const user=await getUser(request,env);
    if (!user || user.status!=="active")
      return json({success:false,message:"Midira amin'ny kaonty voamarina aloha."},401);
    if (user.role!=="client") return json({success:false,message:"Ny Mpanjifa ihany no mahazo mijery ireo fangatahana."},403);
    const result=await env.DB.prepare(`
      SELECT id,title,category,description,proposed_budget_ariary,deadline_date,status,admin_note,agreed_budget_ariary,created_at,updated_at
      FROM job_requests WHERE client_id=? ORDER BY created_at DESC LIMIT 100
    `).bind(user.id).all();
    return json({success:true,requests:result.results||[]});
  } catch(error) {
    console.error("CLIENT_REQUEST_LIST_ERROR:", error?.name, error?.message, error?.stack);
    const host = new URL(request.url).hostname;
    const isFeaturePreview = host.endsWith(".application-de-missions-r-mun-r-es-madagascar.pages.dev") && host !== "application-de-missions-r-mun-r-es-madagascar.pages.dev";
    return json({
      success: false,
      message: "Tsy afaka naka ny fangatahana asa.",
      ...(isFeaturePreview ? { debug: String(error?.message || error || "Unknown error").slice(0, 300) } : {})
    }, 500);
  }
}
export async function onRequestPost({request,env}) {
  try {
    const user=await getUser(request,env);
    if (!user || user.status!=="active")
      return json({success:false,message:"Midira amin'ny kaonty voamarina aloha."},401);
    if (user.role!=="client") return json({success:false,message:"Ny Mpanjifa ihany no afaka mandefa fangatahana asa."},403);
    const data=await request.json();
    const title=String(data.title||"").trim();
    const category=String(data.category||"").trim().slice(0,60)||null;
    const description=String(data.description||"").trim();
    const budgetRaw=data.proposed_budget_ariary;
    const budget=budgetRaw==null||budgetRaw===""?null:Number(budgetRaw);
    const deadline=String(data.deadline_date||"").trim()||null;
    if(title.length<5||title.length>120) return json({success:false,message:"Ny lohateny dia tokony ho 5 ka hatramin'ny 120 tarehintsoratra."},400);
    if(description.length<20||description.length>5000) return json({success:false,message:"Ny fanazavana dia tokony ho 20 ka hatramin'ny 5 000 tarehintsoratra."},400);
    if(budget!==null&&(!Number.isSafeInteger(budget)||budget<1000||budget>1000000000))
      return json({success:false,message:"Tsy mety ny tetibola natolotra."},400);
    if(deadline&&!/^\d{4}-\d{2}-\d{2}$/.test(deadline))
      return json({success:false,message:"Tsy mety ny daty farany."},400);
    const result=await env.DB.prepare(`
      INSERT INTO job_requests (client_id,title,category,description,proposed_budget_ariary,deadline_date)
      VALUES (?,?,?,?,?,?)
    `).bind(user.id,title,category,description,budget,deadline).run();
    await env.DB.prepare(`
      INSERT INTO notifications (user_id,title,message,is_read)
      SELECT id,'Fangatahana asa vaovao','Nisy fangatahana asa vaovao nalefan’ny Mpanjifa. Jereo ny fitantanana.',0
      FROM users WHERE role='admin' AND status='active'
    `).run();
    return json({success:true,request_id:result.meta?.last_row_id??null,message:"Voaray ny fangatahanao. Hifandray aminao eto amin'ny sehatra ny Administrateur handinika ny antsipiriany sy ny tolotra."},201);
  } catch(error) {
    console.error("CLIENT_REQUEST_CREATE_ERROR:",error);
    return json({success:false,message:"Tsy tontosa ny fandefasana fangatahana."},500);
  }
}
