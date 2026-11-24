async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
async function authenticatedUser(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\\s*)me_session=([a-f0-9]{64})(?:;|$)/);
  if (!match) return null;
  const tokenHash = await hashToken(match[1]);
  return env.DB.prepare(`SELECT users.id FROM sessions JOIN users ON users.id=sessions.user_id
    WHERE sessions.token_hash=? AND sessions.expires_at>? AND users.status='active'
    AND users.security_status='clear' LIMIT 1`).bind(tokenHash, new Date().toISOString()).first();
}
const QUESTIONS = [
  {q:"Inona no renivohitr'i Madagasikara?",a:["Toamasina","Antananarivo","Mahajanga","Fianarantsoa"],c:1},
  {q:"Inona no vola ampiasaina eto Madagasikara?",a:["Euro","Dolara","Ariary","Rand"],c:2},
  {q:"Iza amin'ireto no biby mampiavaka an'i Madagasikara?",a:["Kangoroa","Lémurien","Orsa polar","Tigre"],c:1},
  {q:"Inona no ranomasimbe manamorona ny ilany atsinanan'i Madagasikara?",a:["Ranomasimbe Indiana","Ranomasimbe Atlantika","Ranomasimbe Arktika","Ranomasimbe Pasifika"],c:0},
  {q:"Firy ny andro ao anatin'ny herinandro?",a:["Dimy","Enina","Fito","Valo"],c:2},
  {q:"Inona no lokon'ny ravin'ny ankamaroan'ny zavamaniry salama?",a:["Manga","Maitso","Volomparasy","Mainty"],c:1},
  {q:"Iza amin'ireto no fitaovana ampiasaina hiantsoana olona lavitra?",a:["Finday","Sotro","Seza","Vilany"],c:0},
  {q:"Inona no tokony hatao raha mahazo hafatra mangataka tenimiafina?",a:["Alefa avy hatrany","Aparitaka","Tsy omena ary hamarinina ny mpandefa","Omena ny olona rehetra"],c:2},
  {q:"Inona no ilaina rehefa manao asa an-tserasera?",a:["Manaraka toromarika sy fe-potoana","Mizara tenimiafina","Mandainga momba ny asa","Tsy mamaky ny fangatahana"],c:0},
  {q:"Inona no tokony hatao alohan'ny handefasana asa vita amin'ny mpanjifa?",a:["Tsy jerena intsony","Hamarino fa feno sy mifanaraka amin'ny toromarika","Fafao ny asa","Alefaso tsy misy porofo raha ilaina"],c:1}
];
function dayInMadagascar() {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Indian/Antananarivo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value;
  return get("year")+"-"+get("month")+"-"+get("day");
}
function shuffle(items) {
  const a=items.slice();
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
export async function onRequestPost({request,env}) {
  try {
    const user=await authenticatedUser(request,env);
    if(!user) return json({success:false,message:"Mila miditra amin'ny kaonty mavitrika ianao."},401);
    const day=dayInMadagascar();
    const selected=shuffle(QUESTIONS).slice(0,5);
    const answerKey=selected.map(q=>q.c);
    const publicQuestions=selected.map(q=>({question:q.q,answers:q.a}));
    const inserted=await env.DB.prepare(`
      INSERT INTO quiz_rounds (user_id, day_key, round_no, questions_json, answer_key_json, status)
      SELECT ?, ?, COALESCE(MAX(round_no),0)+1, ?, ?, 'started'
      FROM quiz_rounds WHERE user_id=? AND day_key=?
      HAVING COUNT(*) < 3
      RETURNING id, round_no
    `).bind(user.id,day,JSON.stringify(publicQuestions),JSON.stringify(answerKey),user.id,day).first();
    if(!inserted) {
      return json({success:false,limit_reached:true,message:"Efa nahavita lalao Quiz 3 androany ianao. Afaka miverina rahampitso."},429);
    }
    return json({success:true,round_id:inserted.id,round_number:inserted.round_no,daily_limit:3,questions:publicQuestions});
  } catch(error) {
    console.error("QUIZ_START_ERROR:",error);
    return json({success:false,message:"Nisy olana teo am-panombohana ny Quiz."},500);
  }
}