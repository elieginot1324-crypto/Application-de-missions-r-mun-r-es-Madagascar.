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
  const match = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;
  return env.DB.prepare(`SELECT u.id,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? LIMIT 1`).bind(await hashToken(match[1]),new Date().toISOString()).first();
}
function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}
export async function onRequestGet({request,env}) {
  try {
    const user=await getUser(request,env);
    if(!user || user.role!=="worker" || !["active","pending"].includes(user.status))
      return json({success:false,message:"Midira amin'ny kaonty Mpiasa aloha."},401);
    const result=await env.DB.prepare(`SELECT id,document_type,file_name,file_size,status,admin_note,created_at,reviewed_at
      FROM worker_qualifications WHERE worker_id=? ORDER BY created_at DESC LIMIT 30`).bind(user.id).all();
    return json({success:true,documents:result.results||[]});
  } catch(error) {
    console.error("QUALIFICATIONS_LIST_ERROR",error);
    return json({success:false,message:"Tsy afaka naka ny antontan-taratasy."},500);
  }
}
export async function onRequestPost({request,env}) {
  let key=null;
  try {
    if(!sameOrigin(request)) return json({success:false,message:"Tsy ekena ny fangatahana avy amin'ity loharano ity."},403);
    const user=await getUser(request,env);
    if(!user || user.role!=="worker" || !["active","pending"].includes(user.status))
      return json({success:false,message:"Midira amin'ny kaonty Mpiasa aloha."},401);
    if(!env.QUALIFICATION_FILES || typeof env.QUALIFICATION_FILES.put!=="function")
      return json({success:false,message:"Mbola tsy voaomana ny toerana fitahirizana antontan-taratasy. Tsy voaray ny rakitra."},503);
    const form=await request.formData();
    const file=form.get("file");
    const type=String(form.get("document_type")||"");
    if(!["cv","diploma","certificate","portfolio"].includes(type))
      return json({success:false,message:"Safidio ny karazana antontan-taratasy."},400);
    if(!file || typeof file.arrayBuffer!=="function" || !file.size)
      return json({success:false,message:"Misafidiana rakitra halefa."},400);
    if(file.size>5*1024*1024) return json({success:false,message:"5 Mo fara-fahabetsany ny rakitra."},413);
    const allowed={"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png"};
    const ext=allowed[file.type];
    if(!ext) return json({success:false,message:"PDF, JPG na PNG ihany no azo alefa."},400);
    const bytes=await file.arrayBuffer();
    const signature=new Uint8Array(bytes.slice(0,8));
    const valid=file.type==="application/pdf"
      ? signature[0]===0x25&&signature[1]===0x50&&signature[2]===0x44&&signature[3]===0x46
      : file.type==="image/jpeg"
        ? signature[0]===0xff&&signature[1]===0xd8&&signature[2]===0xff
        : signature[0]===0x89&&signature[1]===0x50&&signature[2]===0x4e&&signature[3]===0x47;
    if(!valid) return json({success:false,message:"Tsy mifanaraka amin'ny tena votoatin'ilay rakitra ny endriny."},400);
    key="qualifications/"+user.id+"/"+crypto.randomUUID()+"."+ext;
    await env.QUALIFICATION_FILES.put(key,bytes,{httpMetadata:{contentType:file.type,cacheControl:"private, no-store"}});
    const name=String(file.name||("antontan-taratasy."+ext)).replace(/[\/\r\n\0]/g,"_").slice(0,180);
    await env.DB.prepare(`INSERT INTO worker_qualifications
      (worker_id,document_type,file_key,file_name,mime_type,file_size,status)
      VALUES(?,?,?,?,?,?,'pending')`).bind(user.id,type,key,name,file.type,file.size).run();
    key=null;
    return json({success:true,message:"Voaray ny antontan-taratasy. Miandry ny fanamarinana ataon'ny Administrateur."},201);
  } catch(error) {
    if(key && env.QUALIFICATION_FILES) { try { await env.QUALIFICATION_FILES.delete(key); } catch {} }
    console.error("QUALIFICATION_UPLOAD_ERROR",error);
    return json({success:false,message:"Nisy olana teo am-pandefasana ny antontan-taratasy."},500);
  }
}
