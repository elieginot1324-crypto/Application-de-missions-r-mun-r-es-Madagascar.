async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function json(data,status=200) {
  return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
async function authenticatedUser(request,env) {
  const cookie=request.headers.get("Cookie")||"";
  const match=cookie.match(/(?:^|;\s*)me_session=([a-f0-9]{64})(?:;|$)/);
  if(!match)return null;
  const tokenHash=await hashToken(match[1]);
  return env.DB.prepare(`SELECT users.id FROM sessions JOIN users ON users.id=sessions.user_id
    WHERE sessions.token_hash=? AND sessions.expires_at>? AND users.status='active'
    AND users.security_status='clear' LIMIT 1`).bind(tokenHash,new Date().toISOString()).first();
}
export async function onRequestPost({request,env}) {
  try {
    const user=await authenticatedUser(request,env);
    if(!user)return json({success:false,message:"Mila miditra amin'ny kaonty mavitrika ianao."},401);
    const body=await request.json();
    const roundId=Number(body.round_id);
    const choices=body.choices;
    if(!Number.isSafeInteger(roundId)||roundId<1||!Array.isArray(choices)||choices.length!==5||
       choices.some(value=>!Number.isInteger(value)||value<0||value>3)) {
      return json({success:false,message:"Tsy mety ny valiny nalefa."},400);
    }
    const round=await env.DB.prepare(`SELECT id,questions_json,answer_key_json,status FROM quiz_rounds
      WHERE id=? AND user_id=? LIMIT 1`).bind(roundId,user.id).first();
    if(!round)return json({success:false,message:"Tsy hita na tsy anao ity lalao ity."},404);
    if(round.status!=="started")return json({success:false,message:"Efa nalefa ny valin'ity lalao ity."},409);
    const questions=JSON.parse(round.questions_json);
    const keys=JSON.parse(round.answer_key_json);
    if(!Array.isArray(questions)||questions.length!==5||!Array.isArray(keys)||keys.length!==5)
      throw new Error("INVALID_STORED_QUIZ_ROUND");
    const score=choices.reduce((sum,choice,index)=>sum+(choice===keys[index]?1:0),0);
    const review=questions.map((item,index)=>({
      question:item.question,
      selected_answer:item.answers[choices[index]],
      correct_answer:item.answers[keys[index]],
      correct:choices[index]===keys[index]
    }));
    const updated=await env.DB.prepare(`UPDATE quiz_rounds SET status='completed',score=?,choices_json=?,
      completed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status='started'`)
      .bind(score,JSON.stringify(choices),roundId,user.id).run();
    if(!updated.meta||updated.meta.changes!==1)
      return json({success:false,message:"Efa voaray na nalefa ny valin'ity lalao ity."},409);
    return json({success:true,score,total:5,review,round_completed:true,message:"Voamarina soa aman-tsara ny valinteninao."});
  } catch(error) {
    console.error("QUIZ_SUBMIT_ERROR:",error);
    return json({success:false,message:"Nisy olana teo am-panamarinana ny valiny."},500);
  }
}