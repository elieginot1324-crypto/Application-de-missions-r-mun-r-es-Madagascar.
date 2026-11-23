function json(data,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store"}});}
async function hashToken(token){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");}
export async function onRequestGet({request,env}){
 try{
  const m=(request.headers.get("Cookie")||"").match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);if(!m)return json({success:false,message:"Tsy nahazo alalana."},401);
  const admin=await env.DB.prepare(`SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.role='admin' AND u.status='active' LIMIT 1`).bind(await hashToken(m[1]),new Date().toISOString()).first();
  if(!admin)return json({success:false,message:"Administrateur ihany no mahazo mijery."},403);
  if(!env.QUALIFICATION_FILES)return json({success:false,message:"Tsy voaomana ny fitahirizana."},503);
  const id=Number(new URL(request.url).searchParams.get("id"));if(!Number.isSafeInteger(id)||id<1)return json({success:false,message:"Laharana tsy mety."},400);
  const doc=await env.DB.prepare("SELECT file_key,file_name,mime_type FROM worker_qualifications WHERE id=?").bind(id).first();if(!doc)return json({success:false,message:"Tsy hita."},404);
  const object=await env.QUALIFICATION_FILES.get(doc.file_key);if(!object)return json({success:false,message:"Tsy hita ao amin'ny fitahirizana ilay rakitra."},404);
  const safeName=String(doc.file_name||"antontan-taratasy").replace(/["\r\n]/g,"_");
  return new Response(object.body,{headers:{"Content-Type":doc.mime_type,"Content-Disposition":'inline; filename="'+safeName+'"',"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
 }catch(e){console.error("ADMIN_QUALIFICATION_FILE",e);return json({success:false,message:"Tsy afaka nanokatra ilay rakitra."},500);}
}
