function json(data,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
async function hashToken(token){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function getAdmin(request,env){
 const cookie=request.headers.get("Cookie")||"",match=cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);
 if(!match)return null;
 const user=await env.DB.prepare("SELECT users.id,users.role,users.status,users.security_status FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>? LIMIT 1").bind(await hashToken(match[1]),new Date().toISOString()).first();
 return user&&user.role==="admin"&&user.status==="active"&&user.security_status==="clear"?user:null;
}
export async function onRequestGet({request,env}){
 try{
  const admin=await getAdmin(request,env);if(!admin)return json({success:false,message:"Administrateur ihany no mahazo miditra."},403);
  const result=await env.DB.prepare("SELECT s.id,s.mission_id,s.worker_id,s.details,s.proof_url,s.status,s.submitted_at,m.title AS mission_title,u.full_name AS worker_name FROM submissions s JOIN missions m ON m.id=s.mission_id JOIN users u ON u.id=s.worker_id WHERE s.status IN ('submitted','revision') ORDER BY s.submitted_at ASC LIMIT 200").all();
  return json({success:true,submissions:result.results||[]});
 }catch(error){console.error("ADMIN_SUBMISSIONS_LIST_ERROR:",error);return json({success:false,message:"Tsy afaka naka ny asa nalefan'ny Mpiasa."},500);}
}
export async function onRequestPost({request,env}){
 try{
  const admin=await getAdmin(request,env);if(!admin)return json({success:false,message:"Administrateur ihany no mahazo manao izany."},403);
  const data=await request.json(),id=Number(data.submission_id),decision=String(data.decision||""),note=String(data.note||"").trim().slice(0,1000);
  if(!Number.isSafeInteger(id)||id<1||!["approved","revision","rejected"].includes(decision))return json({success:false,message:"Tsy mety ny fanapahan-kevitra."},400);
  if((decision==="revision"||decision==="rejected")&&note.length<5)return json({success:false,message:"Lazao mazava ny antony na ny fanitsiana ilaina."},400);
  const submission=await env.DB.prepare("SELECT s.id,s.worker_id,m.title AS mission_title FROM submissions s JOIN missions m ON m.id=s.mission_id WHERE s.id=? AND s.status='submitted' LIMIT 1").bind(id).first();
  if(!submission)return json({success:false,message:"Tsy hita ilay asa na efa voakarakara."},404);
  const update=await env.DB.prepare("UPDATE submissions SET status=? WHERE id=? AND status='submitted'").bind(decision,id).run();
  if(!update.meta?.changes)return json({success:false,message:"Efa nisy nikarakara ity asa ity."},409);
  const title=decision==="approved"?"Neken'ny Administrateur ny asanao":decision==="revision"?"Mila fanitsiana ny asanao":"Nolavin'ny Administrateur ny asanao";
  const message=decision==="approved"?"Neken'ny Administrateur ny asa ho an'ny iraka: "+submission.mission_title+". Mbola miankina amin'ny fanamarinana ny fepetra fandoavana ny valisoa.":decision==="revision"?"Angatahin'ny Administrateur ny fanitsiana: "+note:"Nolavin'ny Administrateur ny asa. Antony: "+note;
  await env.DB.batch([
   env.DB.prepare("INSERT INTO notifications(user_id,title,message,is_read) VALUES(?,?,?,0)").bind(submission.worker_id,title,message),
   env.DB.prepare("INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,details) VALUES(?,?,'submission',?,?)").bind(admin.id,"admin_submission_"+decision,id,note||"Fanamarinana nataon'ny Administrateur")
  ]);
  return json({success:true,message:decision==="approved"?"Nekena ny asa. Tsy midika ho famindrana vola izany.":decision==="revision"?"Naverina amin'ny Mpiasa hanitsiany ny asa.":"Nolavina ny asa ary nampandrenesina ny Mpiasa."});
 }catch(error){console.error("ADMIN_SUBMISSION_REVIEW_ERROR:",error);return json({success:false,message:"Nisy olana tamin'ny fanamarinana ny asa."},500);}
}
