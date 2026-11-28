function json(data,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
async function hashToken(token){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function getAdmin(request,env){
 const cookie=request.headers.get("Cookie")||"",match=cookie.match(/(?:^|;\\s*)me_session=([a-f0-9]{64})(?:;|$)/);
 if(!match)return null;
 const user=await env.DB.prepare(`SELECT users.id,users.role,users.status,users.security_status FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>? LIMIT 1`).bind(await hashToken(match[1]),new Date().toISOString()).first();
 return user&&user.role==="admin"&&user.status==="active"&&user.security_status==="clear"?user:null;
}
export async function onRequestGet({request,env}){
 try{
  const admin=await getAdmin(request,env);if(!admin)return json({success:false,message:"Administrateur ihany no mahazo miditra."},403);
  const result=await env.DB.prepare(`SELECT r.id,r.client_id,r.title,r.category,r.description,r.proposed_budget_ariary,r.deadline_date,r.status,r.admin_note,r.agreed_budget_ariary,r.created_at,r.updated_at,u.full_name AS client_name,u.email AS client_email,u.phone AS client_phone FROM job_requests r JOIN users u ON u.id=r.client_id ORDER BY CASE r.status WHEN 'received' THEN 0 WHEN 'in_discussion' THEN 1 WHEN 'proposal_sent' THEN 2 ELSE 3 END,r.created_at ASC LIMIT 200`).all();
  return json({success:true,requests:result.results||[]});
 }catch(error){console.error("ADMIN_JOB_REQUESTS_LIST_ERROR:",error);return json({success:false,message:"Tsy afaka naka ny fangatahana asa."},500);}
}
export async function onRequestPost({request,env}){
 try{
  const admin=await getAdmin(request,env);if(!admin)return json({success:false,message:"Administrateur ihany no mahazo manao izany."},403);
  const data=await request.json(),id=Number(data.request_id),status=String(data.status||""),note=String(data.admin_note||"").trim().slice(0,3000);
  const allowed=["in_discussion","proposal_sent","accepted","declined"];
  if(!Number.isSafeInteger(id)||id<1||!allowed.includes(status))return json({success:false,message:"Tsy mety ny fangatahana."},400);
  const budget=data.agreed_budget_ariary==null||data.agreed_budget_ariary===""?null:Number(data.agreed_budget_ariary);
  if(budget!==null&&(!Number.isSafeInteger(budget)||budget<1000||budget>1000000000))return json({success:false,message:"Tsy mety ny tetibola nifanarahana."},400);
  const row=await env.DB.prepare("SELECT id,client_id,title FROM job_requests WHERE id=? LIMIT 1").bind(id).first();
  if(!row)return json({success:false,message:"Tsy hita ilay fangatahana."},404);
  const update=await env.DB.prepare("UPDATE job_requests SET status=?,admin_note=?,agreed_budget_ariary=?,updated_at=? WHERE id=?").bind(status,note||null,budget,new Date().toISOString(),id).run();
  if(!update.meta?.changes)return json({success:false,message:"Tsy voatahiry ny fanovana."},409);
  await env.DB.batch([
   env.DB.prepare("INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,details) VALUES(?,?,'job_request',?,?)").bind(admin.id,"job_request_"+status,id,note||"Sata novain'ny Administrateur"),
   env.DB.prepare("INSERT INTO notifications(user_id,title,message,is_read) VALUES(?,?,?,0)").bind(row.client_id,"Nohavaozina ny fangatahanao","Nohavaozin'ny Administrateur ny fangatahana asa: "+row.title+". Midira hijery ny antsipiriany.")
  ]);
  return json({success:true,message:"Voatahiry ny fanovana ary nampandrenesina ny Mpanjifa."});
 }catch(error){console.error("ADMIN_JOB_REQUEST_UPDATE_ERROR:",error);return json({success:false,message:"Nisy olana tamin'ny fanavaozana."},500);}
}
