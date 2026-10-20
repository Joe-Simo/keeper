/**
 * Keeper's MCP Apps view (ui://keeper/house-card.html, mimeType text/html;profile=mcp-app).
 * One self-contained HTML file any MCP Apps host can render beside a tool result: it does the
 * ui/initialize handshake, listens for ui/notifications/tool-result, and draws an Echo Show style
 * card for whichever Keeper result arrived. Buttons call Keeper tools back through the host
 * (tools/call), so a tap and a spoken "next" move the same routine.
 */
export const CARD_URI = "ui://keeper/house-card.html";
export const CARD_MIME = "text/html;profile=mcp-app";

export const CARD_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Keeper</title>
<style>
:root{--bg:#14110e;--panel:#1d1915;--line:#2e2822;--ink:#f5efe7;--mute:#a99e91;--lamp:#f1b56c;--ok:#93d3a6;--bad:#f2897c}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{padding:20px 22px 22px;min-height:100vh;display:flex;flex-direction:column}
.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);margin:0 0 8px;font-weight:600;display:flex;gap:8px;align-items:center}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--lamp);display:inline-block}
.eyebrow.em i{background:var(--bad)}.eyebrow.em{color:var(--bad)}
h1{font-size:23px;line-height:1.22;margin:0 0 6px;font-weight:620;letter-spacing:-.01em}
.big{font-size:21px;line-height:1.35;margin:4px 0 0;font-weight:500}
.sub{color:var(--mute);font-size:13px;margin:6px 0 0}
.src{display:inline-flex;gap:6px;align-items:center;margin-top:14px;font-size:12px;color:var(--mute);border:1px solid var(--line);border-radius:999px;padding:4px 10px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.chip{border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:4px 11px;font-size:13px}
.chip.priv{color:var(--mute);border-style:dashed}
.bar{height:4px;border-radius:4px;background:var(--line);margin:14px 0 0;overflow:hidden}.bar b{display:block;height:100%;background:var(--lamp);border-radius:4px;transition:width .3s}
ul.list{list-style:none;margin:12px 0 0;padding:0}ul.list li{padding:8px 0;border-bottom:1px solid var(--line)}ul.list li:last-child{border-bottom:0}
.who{color:var(--lamp);font-weight:600}.t{color:var(--mute);font-size:12px;display:block;margin-top:2px}
.btns{display:flex;gap:8px;margin-top:auto;padding-top:16px;flex-wrap:wrap}
button.b{background:var(--ink);color:#16120e;border:0;border-radius:999px;padding:10px 16px;font:600 14px/1 inherit;cursor:pointer}
button.b.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
button.b:disabled{opacity:.5;cursor:default}
.code{font:600 30px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;color:var(--lamp);margin:10px 0 2px}
.lock{width:42px;height:42px;border-radius:12px;background:var(--panel);border:1px solid var(--line);display:grid;place-items:center;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:12px}
.sec{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px}.sec b{display:block;font-size:13px;margin-bottom:3px}.sec span{color:var(--mute);font-size:12px}
.empty{color:var(--mute);margin:auto 0}
</style></head>
<body><main id="app" aria-live="polite"><p class="empty">Waiting for Keeper...</p></main>
<script>
(function(){
  var app=document.getElementById("app"), nextId=1, pending={};
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function send(msg){window.parent.postMessage(Object.assign({jsonrpc:"2.0"},msg),"*")}
  function request(method,params){var id=nextId++;send({id:id,method:method,params:params});return new Promise(function(res,rej){pending[id]={res:res,rej:rej}})}
  function notify(method,params){send({method:method,params:params||{}})}
  function size(){notify("ui/notifications/size-changed",{height:Math.ceil(document.documentElement.scrollHeight)})}
  window.addEventListener("message",function(e){
    var m=e.data; if(!m||m.jsonrpc!=="2.0")return;
    if(m.id!=null&&pending[m.id]&&!m.method){var p=pending[m.id];delete pending[m.id];m.error?p.rej(m.error):p.res(m.result);return}
    if(m.method==="ui/notifications/tool-result"){render(m.params&&m.params.structuredContent)}
    if(m.method==="ui/resource-teardown"&&m.id!=null){send({id:m.id,result:{}})}
  });
  function callTool(name,args){
    app.querySelectorAll("button").forEach(function(b){b.disabled=true});
    return request("tools/call",{name:name,arguments:args||{}}).then(function(r){render(r&&r.structuredContent)}).catch(function(){app.querySelectorAll("button").forEach(function(b){b.disabled=false})});
  }
  function eyebrow(text,em){return "<p class='eyebrow"+(em?" em":"")+"'><i></i>"+esc(text)+"</p>"}
  function who(d){var a=d.audience||{};return a.kind==="guest"?a.name+", "+a.role:a.kind==="owner"?a.name+", owner":"Locked"}
  function btn(label,tool,args,ghost){return "<button class='b"+(ghost?" ghost":"")+"' data-tool='"+esc(tool)+"' data-args='"+esc(JSON.stringify(args||{}))+"'>"+esc(label)+"</button>"}
  var LOCKSVG="<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='#f1b56c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='5' y='11' width='14' height='10' rx='2'/><path d='M8 11V8a4 4 0 0 1 8 0v3'/></svg>";
  var R={
    visit:function(d){
      if(!d.ok)return "<div class='lock'>"+LOCKSVG+"</div><h1>Not unlocked</h1><p class='sub'>"+esc(d.speech)+"</p>";
      return eyebrow("Visit started")+"<h1>Welcome, "+esc(d.pass.name)+"</h1><p class='sub'>Ask in your own words. Your pass covers:</p><div class='chips'>"+(d.sectionLabels||[]).map(function(s){return "<span class='chip'>"+esc(s)+"</span>"}).join("")+"<span class='chip'>Emergency</span></div>"+((d.answered||[]).length?"<ul class='list'>"+d.answered.map(function(q){return "<li><span class='t'>You asked: "+esc(q.question)+"</span>"+esc(q.answer)+"</li>"}).join("")+"</ul>":"")+"<div class='btns'>"+btn("What can you help with?","house_manual",{},true)+"</div>";
    },
    visit_end:function(d){return "<div class='lock'>"+LOCKSVG+"</div><h1>Locked</h1><p class='sub'>"+esc(d.speech)+"</p><div class='btns'>"+btn("Emergency","emergency_info",{},true)+"</div>"},
    answer:function(d){
      if(d.locked&&!d.emergency)return "<div class='lock'>"+LOCKSVG+"</div><h1>Say your pass code</h1><p class='sub'>"+esc(d.speech)+"</p><div class='btns'>"+btn("Emergency","emergency_info",{},true)+"</div>";
      if(d.emergency)return eyebrow("Emergency",true)+"<h1>Call 911 first</h1><ul class='list'>"+[d.note].concat(d.related||[]).filter(Boolean).map(function(n){return "<li>"+esc(n.text)+"</li>"}).join("")+"</ul>";
      if(!d.found)return eyebrow(who(d))+"<h1>Not in the notes</h1><p class='big'>"+esc(d.speech)+"</p>"+(d.loggedQuestion?"<p class='src'>Sent to the owner: &ldquo;"+esc(d.loggedQuestion.text)+"&rdquo;</p>":"");
      var n=d.note,h=eyebrow(n.sectionLabel+" &middot; "+who(d)).replace("&amp;middot;","&middot;")+"<h1>"+esc(n.title)+"</h1><p class='big'>"+esc(n.text)+"</p><p class='src'>From the owner's notes"+(n.share==="private"?" &middot; private":"")+"</p>";
      if((d.related||[]).length)h+="<div class='chips'>"+d.related.map(function(r){return "<span class='chip'>Also: "+esc(r.title)+"</span>"}).join("")+"</div>";
      if(n.steps&&n.steps.length)h+="<div class='btns'>"+btn("Walk me through it","routine_walk",{move:"start",routine:n.title})+"</div>";
      return h;
    },
    routine:function(d){
      var r=d.routine; if(!r)return eyebrow("Routine")+"<p class='big'>"+esc(d.speech)+"</p>";
      var pct=Math.round(100*r.step/r.total);
      if(r.done)return eyebrow(r.title)+"<h1>All done</h1><p class='sub'>"+esc(d.speech)+"</p><div class='bar'><b style='width:100%'></b></div>";
      return eyebrow(r.title+" &middot; step "+r.step+" of "+r.total).replace("&amp;middot;","&middot;")+"<p class='big' style='font-size:25px'>"+esc(r.text)+"</p><div class='bar'><b style='width:"+pct+"%'></b></div><div class='btns'>"+(r.step>1?btn("Back","routine_walk",{move:"back"},true):"")+btn(r.step===r.total?"Finish":"Next","routine_walk",{move:"next"})+btn("Stop","routine_walk",{move:"stop"},true)+"</div>";
    },
    manual:function(d){
      if(!d.sections.length)return "<div class='lock'>"+LOCKSVG+"</div><h1>Say your pass code</h1><p class='sub'>"+esc(d.speech)+"</p>";
      return eyebrow(d.owner?"Your manual":"What I can help with")+"<p class='big'>"+esc(d.speech)+"</p><div class='grid'>"+d.sections.map(function(g){return "<div class='sec'><b>"+esc(g.label)+"</b><span>"+g.notes.map(function(n){return esc(n.title)+(d.owner&&n.share==="private"?" (private)":"")}).join(", ")+"</span></div>"}).join("")+"</div>";
    },
    note_saved:function(d){
      if(!d.note)return eyebrow("Manual")+"<p class='big'>"+esc(d.speech)+"</p>";
      var n=d.note,priv=n.share==="private";
      return eyebrow(n.sectionLabel+" &middot; "+(priv?"private":"shared with guests")).replace("&amp;middot;","&middot;")+"<h1>"+esc(n.title)+"</h1><p class='big'>"+esc(n.text)+"</p><p class='sub'>"+esc(d.speech)+"</p><div class='btns'>"+(priv?btn("Share with guests","note_update",{note:n.id,share:"guests"}):btn("Make private","note_update",{note:n.id,share:"private"},true))+"</div>";
    },
    note_removed:function(d){return eyebrow("Manual")+"<p class='big'>"+esc(d.speech)+"</p>"},
    pass:function(d){
      if(!d.pass)return eyebrow("Passes")+"<p class='big'>"+esc(d.speech)+"</p>";
      var p=d.pass; if(p.revoked)return eyebrow("Pass ended")+"<h1>"+esc(p.name)+"</h1><p class='sub'>"+esc(d.speech)+"</p>";
      return eyebrow(p.role+" pass")+"<h1>"+esc(p.name)+"</h1><p class='code'>"+esc(p.code)+"</p><p class='sub'>Until "+esc(new Date(p.until).toLocaleString([], {weekday:"short",hour:"numeric",minute:"2-digit"}))+"</p><div class='chips'>"+p.sections.map(function(s){return "<span class='chip'>"+esc(s)+"</span>"}).join("")+"</div><div class='btns'>"+btn("End this pass","pass_revoke",{name:p.name},true)+"</div>";
    },
    passes:function(d){
      return eyebrow("Passes")+"<p class='big'>"+esc(d.speech)+"</p><ul class='list'>"+(d.passes||[]).map(function(p){return "<li><span class='who'>"+esc(p.name)+"</span> "+esc(p.role)+(d.visit===p.name?" &middot; here now":"")+"<span class='t'>Code "+esc(p.code)+" &middot; "+esc(p.sections.join(", "))+(p.active?"":" &middot; ended")+"</span></li>"}).join("")+"</ul>";
    },
    questions:function(d){
      var q=d.questions||[]; if(!q.length)return eyebrow("Questions")+"<h1>Nothing waiting</h1><p class='sub'>"+esc(d.speech)+"</p>";
      return eyebrow(q.length+" waiting")+"<h1>Questions from guests</h1><ul class='list'>"+q.map(function(x){return "<li><span class='who'>"+esc(x.by)+"</span> "+esc(x.text)+"<span class='t'>"+(x.reason==="not_shared"?"A private or unshared note may cover this":"Not in the manual yet")+"</span></li>"}).join("")+"</ul><p class='sub'>Answer by voice: &ldquo;Tell "+esc(q[0].by)+" ...&rdquo;</p>";
    },
    answered:function(d){
      if(!d.question)return eyebrow("Questions")+"<p class='big'>"+esc(d.speech)+"</p>";
      return eyebrow("Answered")+"<p class='sub'>"+esc(d.question.by)+" asked</p><h1>"+esc(d.question.text)+"</h1><p class='big'>"+esc(d.question.answer)+"</p><p class='src'>"+(d.note?"Saved to the manual &middot; "+esc(d.note.sectionLabel)+" &middot; "+(d.note.share==="guests"?"shared":"private"):"Sent to "+esc(d.question.by)+" only")+"</p>";
    },
    recap:function(d){
      return eyebrow("While you were out")+"<p class='big'>"+esc(d.speech)+"</p><ul class='list'>"+(d.activity||[]).map(function(a){return "<li><span class='who'>"+esc(a.who||"Keeper")+"</span> "+esc(a.text)+"<span class='t'>"+esc(new Date(a.at).toLocaleString([], {weekday:"short",hour:"numeric",minute:"2-digit"}))+"</span></li>"}).join("")+"</ul>"+(d.open?"<div class='btns'>"+btn("See questions","questions_open",{})+"</div>":"");
    },
    denied:function(d){return "<div class='lock'>"+LOCKSVG+"</div><h1>Owner only</h1><p class='sub'>"+esc(d.speech)+"</p>"}
  };
  function render(d){
    if(!d||!d.kind){return}
    var f=R[d.kind]; app.innerHTML=f?f(d):"<p class='big'>"+esc(d.speech)+"</p>";
    app.querySelectorAll("[data-tool]").forEach(function(b){b.addEventListener("click",function(){callTool(b.getAttribute("data-tool"),JSON.parse(b.getAttribute("data-args")||"{}"))})});
    size();
  }
  request("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"keeper-card",version:"1.0.0"},appCapabilities:{}}).then(function(){notify("ui/notifications/initialized")}).catch(function(){});
})();
</script></body></html>`;
