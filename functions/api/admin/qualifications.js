function json(data,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
async function hashToken(token){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function getAdmin(request,env){
 const m=(request.headers.get("Cookie")||"").match(/(?:^|;\\s*)me_session=([a-f0-9]{64})(?:;|$)/);if(!m)return null;
 const u=await env.DB.prepare(`SELECT u.id,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? LIMIT 1`).bind(await hashToken(m[1]),new Date().toISOString()).first();
 return u&&u.role==="admin"&&u.status==="active"?u:null;
}
export async function onRequestGet({request,env}){
 try{
  const admin=await getAdmin(request,env);if(!admin)return json({success:false,message:"Administrateur ihany no mahazo mijery."},403);
  const rows=await env.DB.prepare(`SELECT q.id,q.worker_id,q.document_type,q.file_name,q.file_size,q.status,q.created_at,u.full_name,u.email,u.phone
   FROM worker_qualifications q JOIN users u ON u.id=q.worker_id
   WHERE q.status='pending' ORDER BY q.created_at ASC LIMIT 100`).all();
  return json({success:true,documents:rows.results||[]});
 }catch(e){console.error("ADMIN_QUALIFICATIONS_GET",e);return json({success:false,message:"Tsy afaka naka ireo antontan-taratasy miandry."},500);}
}
export async function onRequestPost({request,env}){
 try{
  const admin=await getAdmin(request,env);if(!admin)return json({success:false,message:"Administrateur ihany no mahazo manao izany."},403);
  const d=await request.json();const id=Number(d.document_id);const decision=String(d.decision||"");const note=String(d.note||"").trim().slice(0,1000);
  if(!Number.isSafeInteger(id)||id<1||!["approved","rejected"].includes(decision))return json({success:false,message:"Tsy mety ny fangatahana."},400);
  if(decision==="rejected"&&note.length<5)return json({success:false,message:"Lazao ny antony nandavana."},400);
  const doc=await env.DB.prepare("SELECT id,worker_id,document_type FROM worker_qualifications WHERE id=? AND status='pending'").bind(id).first();
  if(!doc)return json({success:false,message:"Tsy hita ilay antontan-taratasy na efa voakarakara."},404);
  const result=await env.DB.prepare(`UPDATE worker_qualifications SET status=?,admin_note=?,reviewed_by=?,reviewed_at=?
    WHERE id=? AND status='pending'`).bind(decision,note||null,admin.id,new Date().toISOString(),id).run();
  if(!result.meta?.changes)return json({success:false,message:"Efa nisy nikarakara ity antontan-taratasy ity."},409);
  const title=decision==="approved"?"Nekena ny antontan-taratasinao":"Mila fanitsiana ny antontan-taratasinao";
  const message=decision==="approved"?"Nankatoavin'ny Administrateur ny antontan-taratasy "+doc.document_type+".":"Nolavin'ny Administrateur ny antontan-taratasy "+doc.document_type+". Antony: "+note;
  await env.DB.batch([
   env.DB.prepare("INSERT INTO notifications(user_id,title,message,is_read) VALUES(?,?,?,0)").bind(doc.worker_id,title,message),
   env.DB.prepare("INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,details) VALUES(?,?,?,?,?)").bind(admin.id,"qualification_"+decision,"qualification",id,note||"Nekena")
  ]);
  return json({success:true,message:decision==="approved"?"Nekena ny antontan-taratasy.":"Nolavina ary nampandrenesina ny Mpiasa."});
 }catch(e){console.error("ADMIN_QUALIFICATIONS_REVIEW",e);return json({success:false,message:"Nisy olana tamin'ny fanamarinana."},500);}
}
