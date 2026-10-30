import { CATEGORY_KEYS, ISSUE_TITLES, PERSONAS, PLACES, REPAIR_COSTS, createSeedIssues } from './data.js';
import { calculateScore, distanceToSegment, explainScore, priorityBand } from './scoring.js';
import { createStreetGraph, nearestStreetNode, segmentLengthMeters } from './streets.js';
import { guessIssueCategory } from './reporting.js';

const $=s=>document.querySelector(s),NS='http://www.w3.org/2000/svg';
const K=CATEGORY_KEYS,T=ISSUE_TITLES;
const P=Object.fromEntries(Object.entries(PERSONAS).map(([key,p])=>[key,{n:p.name,s:p.plural,e:p.icon,w:p.weights}]));
const POI=PLACES.map(p=>({...p,n:p.name,w:p.weight,g:p.icon}));
const issues=createSeedIssues().map(i=>({id:i.id,t:i.type,x:i.x,y:i.y,n:i.reports,age:i.age,mg:i.merged}));
let ps='wheel',cur=0,merged=0,rep={};
const {segments:S,connections:G}=createStreetGraph(),sd=distanceToSegment,band=priorityBand;
const sc=(issue,persona=ps)=>calculateScore(issue,persona);
const why=(issue,breakdown)=>explainScore(issue,breakdown,ps);
const map=$('#map');
map.innerHTML=`<rect width="800" height="520" fill="var(--gr)"/><rect x="190" y="275" width="190" height="120" rx="26" fill="var(--c4)" opacity=".14"/>
${POI.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="${75*p.w}" fill="var(--ac)" opacity=".07"/>`).join('')}
<g id="rd" stroke-linecap="round" stroke-width="11">${S.map((s,k)=>`<line class="sg" id="sg${k}" x1="${s[0]}" y1="${s[1]}" x2="${s[2]}" y2="${s[3]}" stroke="var(--st)"/>`).join('')}</g>
<g fill="var(--mu)" font-size="11" font-weight="600"><text x="44" y="104">College Road</text><text x="44" y="254">Market Street</text><text x="44" y="404">Station Road</text></g>
${POI.map(p=>`<g><circle cx="${p.x}" cy="${p.y}" r="11" fill="var(--sf)" stroke="var(--ink)" stroke-width="1.5"/><text x="${p.x}" y="${p.y+4}" text-anchor="middle" font-size="11" font-weight="800" fill="var(--ink)">${p.g}</text><text x="${p.x}" y="${p.y+27}" text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--ink)">${p.n}</text></g>`).join('')}
<g id="rtl" fill="none"></g><g id="ps"></g><g id="tm"></g><g id="rg"></g>`;
const pt=e=>{const q=map.createSVGPoint();q.x=e.clientX;q.y=e.clientY;return q.matrixTransform(map.getScreenCTM().inverse())};
map.onclick=e=>{const p=pt(e);rep.x=p.x;rep.y=p.y;tab('rep');repUI()};
function ring(x,y){const c=document.createElementNS(NS,'circle');c.setAttribute('class','rg');c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',14);c.onanimationend=()=>c.remove();$('#rg').append(c)}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t.h);t.h=setTimeout(()=>t.classList.remove('on'),4500)}
function tab(k){['top','rep','det','rt','plan'].forEach(x=>$('#p-'+x).hidden=x!=k);if(k=='rt')routeUI();else $('#rtl').innerHTML='';document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t==k))}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>tab(b.dataset.t));
function sel(id){cur=id;render();tab('det')}
function repUI(){
 $('#chips').innerHTML=K.map(k=>`<button data-k="${k}" class="${rep.t==k?'on':''}">${T[k]}</button>`).join('');
 $('#chips').querySelectorAll('button').forEach(b=>b.onclick=()=>{rep.t=b.dataset.k;repUI()});
 $('#pst').textContent=rep.x==null?'Step 1: tap the map to drop a pin where the problem is.':'Pin dropped. Pick the issue type and add a photo.';
 const pv=$('#pv');pv.hidden=!rep.ph;if(rep.ph)pv.src=rep.ph;
 $('#go').disabled=rep.x==null||!rep.t;
 $('#tm').innerHTML=rep.x==null?'':`<circle cx="${rep.x}" cy="${rep.y}" r="15" fill="none" stroke="var(--ac)" stroke-width="3" stroke-dasharray="5 4"/><circle cx="${rep.x}" cy="${rep.y}" r="4" fill="var(--ac)"/>`}
$('#ph').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{rep.ph=r.result;repUI()};r.readAsDataURL(f)};
$('#dup').onclick=()=>{const i=issues[1];rep={x:i.x+9,y:i.y+7,t:i.t};repUI();toast('A second report of the same issue, 12 m away. Now press Submit.')};
$('#go').onclick=()=>{const{x,y,t,ph}=rep,d=issues.find(i=>i.t==t&&Math.hypot(i.x-x,i.y-y)<=20);
 if(d){const m=Math.round(Math.hypot(d.x-x,d.y-y)*2.5);d.n++;d.mg++;merged++;if(ph&&!d.ph)d.ph=ph;ring(d.x,d.y);cur=d.id;toast(`Duplicate found: same ${T[t].toLowerCase()} ${m} m from #${d.id}. Merged, now ${d.n} reports on one issue.`)}
 else{const n={id:issues.length+1,t,x,y,n:1,age:0,mg:0,ph};issues.push(n);ring(x,y);cur=n.id;toast(`Issue #${n.id} added to the map and scored.`)}
 rep={};$('#ph').value='';repUI();render();tab('det')};
function render(){
 const p=P[ps],rows=live().map(i=>({i,s:sc(i)}));
 $('#s1').textContent=rows.length;$('#s2').textContent=rows.filter(r=>r.s.total>=75).length;$('#s2l').textContent='critical for '+p.s;$('#s3').textContent=merged;$('#vw').textContent=`Viewing as ${p.e} ${p.n}`;
 $('#note').textContent=`Ranked for ${p.n.toLowerCase()}. Switch the persona above and watch the order change.`;
 document.querySelectorAll('#pers button').forEach(b=>b.classList.toggle('on',b.dataset.p==ps));
 S.forEach((s,k)=>{let m=-1;rows.forEach(r=>{if(sd(r.i,s)<=30)m=Math.max(m,r.s.total)});$('#sg'+k).style.stroke=m<0?'var(--st)':band(m)[1]});
 const L=$('#ps');
 rows.forEach(({i,s})=>{let g=i.el;if(!g){g=i.el=document.createElementNS(NS,'g');g.setAttribute('class','pin');g.innerHTML='<circle class="hl" r="14"/><circle class="pc" r="14"/><text dy=".35em"></text>';g.onclick=e=>{e.stopPropagation();sel(i.id)};L.append(g)}
  const b=band(s.total);g.setAttribute('transform',`translate(${i.x} ${i.y})`);g.classList.toggle('crit',s.total>=75);g.classList.toggle('on',i.id==cur);
  g.querySelector('.hl').style.stroke=b[1];g.querySelector('.pc').style.fill=b[1];g.querySelector('.pc').style.transform=`scale(${.8+s.total/160})`;g.querySelector('text').textContent=s.total});
 const O=$('#top');issues.forEach(i=>{if(!i.li){i.li=document.createElement('li');i.li.onclick=()=>sel(i.id);O.append(i.li)}});
 const f=new Map(issues.map(i=>[i,i.li.hidden?null:i.li.getBoundingClientRect().top]));
 rows.sort((a,b)=>b.s.total-a.s.total).forEach(({i,s},k)=>{i.li.hidden=k>9;i.li.classList.toggle('on',i.id==cur);
  i.li.innerHTML=`<span class="rk">${k+1}</span><div><strong>${T[i.t]}</strong> <em>#${i.id}</em><p>${why(i,s)}</p></div><span class="sc" style="background:${band(s.total)[1]}">${s.total}</span>`;O.append(i.li)});
 rows.slice(0,10).forEach(({i})=>{const o=f.get(i);if(o==null)return;const d=o-i.li.getBoundingClientRect().top;if(!d)return;
  i.li.style.transition='none';i.li.style.transform=`translateY(${d}px)`;requestAnimationFrame(()=>requestAnimationFrame(()=>{i.li.style.transition='transform .8s cubic-bezier(.2,.8,.2,1)';i.li.style.transform=''}))});
 detail();routeUI();planUI()}
function detail(){const D=$('#p-det'),i=issues.find(x=>x.id==cur);
 if(!i){D.innerHTML='<p class="mu">Tap any pin on the map to see its score and exactly how it was calculated.</p>';return}
 const s=sc(i),b=band(s.total),R=[[`Impact on ${P[ps].s}`,s.im,45,`${T[i.t]} weighs ${s.w.toFixed(2)} for this persona, times 45`],['Footfall exposure',s.ex,25,`${s.dist} m from the ${s.poi}`],['Corroboration',s.co,15,`${i.n} report${i.n>1?'s':''}, full marks at 5`],['Time unresolved',s.ag,15,`${i.age} day${i.age==1?'':'s'}, full marks at 30`]];
 D.innerHTML=`<div class="big"><div class="ring" style="--v:${s.total};--k:${b[1]}"><b>${s.total}</b></div><div><strong style="font-size:19px">${T[i.t]}</strong><div class="mu">#${i.id}, ${b[0]} for ${P[ps].s}${i.mg?`. ${i.mg} duplicate${i.mg>1?'s':''} merged`:''}</div></div></div>
 ${i.fx?`<p><strong style='color:var(--c4)'>Fixed</strong></p>${i.af?cmp(i):''}`:`<button class='sm' id='st'>Still broken here (${i.cf||0})</button><div class='res'><strong>Fixed?</strong><p class='mu' style='margin:4px 0'>Add an after photo as proof.</p><input type='file' id='af' accept='image/*' aria-label='After photo'><button class='sm f' id='fx'>Mark as fixed</button></div>`}
 ${i.ph&&!(i.fx&&i.af)?`<img class='pv' src='${i.ph}' alt='Photo of the issue'>`:''}
 ${R.map(r=>`<div class="row"><div><span>${r[0]}</span><span>${r[1].toFixed(1)} / ${r[2]}</span></div><div class="bar"><i style="width:${r[1]/r[2]*100}%"></i></div><small>${r[3]}</small></div>`).join('')}
 <code>score = 45 × impact weight + 25 × exposure + 15 × min(reports ÷ 5, 1) + 15 × min(days ÷ 30, 1)</code>
 <strong>Same issue, four realities</strong>
 ${['wheel','eld','vis','par'].map(k=>{const v=sc(i,k).total;return`<div class="mini ${k==ps?'on':''}"><span>${P[k].e} ${P[k].n}</span><div class="bar"><i style="width:${v}%;background:${band(v)[1]}"></i></div><span>${v}</span></div>`}).join('')}`;wire(i)}
$('#pers').innerHTML=Object.keys(P).map(k=>`<button data-p="${k}">${P[k].e} ${P[k].n}</button>`).join('');
document.querySelectorAll('#pers button').forEach(b=>b.onclick=()=>{ps=b.dataset.p;render()});
const C=REPAIR_COSTS,fmt=n=>'₹'+n.toLocaleString('en-IN'),live=()=>issues.filter(i=>!i.fx);
const wt=i=>P[ps].w[K.indexOf(i.t)],slen=si=>segmentLengthMeters(S,si);
const snap=p=>nearestStreetNode(p,G);
const wseg=(si,skip)=>{let m=0;live().forEach(i=>{if(i.id!=skip&&sd(i,S[si])<=30)m=Math.max(m,wt(i))});return m};
function route(a,b,skip){const D={[a]:0},pv={},seen=new Set();
 while(1){let u=null;for(const k in D)if(!seen.has(k)&&(u==null||D[k]<D[u]))u=k;if(u==null)return null;if(u==b)break;seen.add(u);
  for(const[v,si]of G[u]){const w=wseg(si,skip);if(w>=.9)continue;const c=D[u]+slen(si)*(1+3*w);if(D[v]==null||c<D[v]){D[v]=c;pv[v]=[u,si]}}}
 const r=[];for(let k=b;k!=a;k=pv[k][0])r.push(pv[k][1]);return r.reverse()}
function routeUI(){if($('#p-rt').hidden)return;const A=snap(POI[$('#ra').value]),B=snap(POI[$('#rb').value]),p=P[ps];
 $('#rtn').textContent=`Walking as a ${p.n.toLowerCase()}. Any barrier that fully blocks this persona closes the street.`;
 let r=route(A,B),dash=false,h;
 if(r){const L=Math.round(r.reduce((t,si)=>t+slen(si),0)),bs=new Set();r.forEach(si=>live().forEach(i=>{if(sd(i,S[si])<=30&&wt(i)>=.3)bs.add(i.id)}));
  h=`<strong>${bs.size?`Passable, with ${bs.size} barrier${bs.size>1?'s':''}`:'Clear route'}</strong><p class='mu'>${L} m. ${bs.size?'On the way: '+[...bs].map(id=>'#'+id+' '+T[issues[id-1].t].toLowerCase()).join(', ')+'.':'Nothing here blocks or slows '+p.s+'.'}</p>`}
 else{let best=null;live().forEach(i=>{if(wt(i)<.9)return;const x=route(A,B,i.id);if(x&&(!best||x.length<best.r.length))best={i,r:x}});
  h=`<strong style='color:var(--c1)'>No passable route for ${p.s}</strong><p class='mu'>${best?`Fixing #${best.i.id} (${T[best.i.t].toLowerCase()}) would open one. The dashed line shows the route it unlocks.`:'More than one blockage is in the way.'}</p>`;if(best){r=best.r;dash=true}}
 $('#rres').innerHTML=h;
 $('#rtl').innerHTML=r&&r.length?`<polyline points='${r.map(si=>S[si][0]+','+S[si][1]+' '+S[si][2]+','+S[si][3]).join(' ')}' stroke='var(--ac)' stroke-width='5' stroke-linecap='round' stroke-linejoin='round' ${dash?"stroke-dasharray='2 10'":''}/>`:''}
function plan(){const b=+$('#bud').value,o=live().map(i=>({i,s:sc(i).total,c:C[i.t]})).sort((x,y)=>y.s/y.c-x.s/x.c);let left=b;const pick=o.filter(r=>r.c<=left&&(left-=r.c,1));return{b,pick,spent:b-left}}
function planUI(){const{b,pick,spent}=plan(),ids=new Set(pick.map(r=>r.i.id)),load=(p,ex)=>live().reduce((t,i)=>t+(ex&&ids.has(i.id)?0:sc(i,p).total),0);
 $('#pres').innerHTML=`<div class='res'><strong>${fmt(b)} budget</strong><p class='mu' style='margin:4px 0'>Fixes ${pick.length} issues for ${fmt(spent)}, picked by score per rupee for ${P[ps].s}.</p></div>`+
  ['wheel','eld','vis','par'].map(k=>{const a=load(k),z=load(k,1),d=a?Math.round((a-z)/a*100):0;return`<div class='mini' style='grid-template-columns:140px 1fr 44px'><span>${P[k].e} ${P[k].n}</span><div class='bar'><i style='width:${100-d}%'></i></div><span>-${d}%</span></div>`}).join('')+
  `<p class='mu' style='margin:6px 0'>Bars show the barrier load left after these fixes.</p><ol>${pick.map(r=>`<li style='grid-template-columns:1fr auto'><div><strong>${T[r.i.t]} #${r.i.id}</strong><p>${fmt(r.c)}</p></div><span class='sc' style='background:${band(r.s)[1]}'>${r.s}</span></li>`).join('')}</ol><button class='btn g' id='pr'>Print ward brief</button>`;
 $('#pr').onclick=brief}
function brief(){const r=live().map(i=>({i,s:sc(i)})).sort((a,b)=>b.s.total-a.s.total).slice(0,5),q=plan();
 $('#brief').innerHTML=`<h1>Last 100 m: ward brief</h1><p>Persona: ${P[ps].n}. ${live().length} open issues, ${issues.length-live().length} fixed.</p><h2>Top 5 fixes</h2><ol>${r.map(({i,s})=>`<li><strong>${T[i.t]} #${i.id}</strong>, score ${s.total} (${band(s.total)[0]}). ${why(i,s)}</li>`).join('')}</ol><h2>Budget plan, ${fmt(q.b)}</h2><p>${q.pick.map(x=>T[x.i.t]+' #'+x.i.id).join(', ')||'None'}</p>`;
 try{window.print()}catch(e){toast('Printing is blocked here. Open the page link in its own tab and try again.')}}
const cmp=i=>{const st=`style='clip-path:inset(0 calc(100% - var(--p)*1%) 0 0)'`;return`<div class='cmp' style='--p:50'><img src='${i.af}' alt='After the fix'>${i.ph?`<img src='${i.ph}' alt='Before the fix' ${st}>`:`<div class='pv' ${st}>No before photo</div>`}</div><input type='range' min='0' max='100' value='50' aria-label='Before and after'>`};
function fixIt(i){i.fx=true;const g=i.el;g.classList.remove('crit');g.classList.add('fx');g.querySelector('.pc').style.fill='var(--c4)';g.querySelector('text').textContent='✓';i.li.hidden=true;toast(`#${i.id} marked fixed. Ranking, streets and routes updated.`);render()}
function wire(i){const D=$('#p-det'),q=s=>D.querySelector(s);
 if(q('#st'))q('#st').onclick=()=>{i.n++;i.cf=(i.cf||0)+1;toast(`Confirmed. #${i.id} now has ${i.n} reports, so its score went up.`);render()};
 if(q('#af'))q('#af').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>i.af=r.result;r.readAsDataURL(f)};
 if(q('#fx'))q('#fx').onclick=()=>fixIt(i);
 const g=q('input[type=range]');if(g)g.oninput=()=>q('.cmp').style.setProperty('--p',g.value)}
const tag=t=>{const k=guessIssueCategory(t);if(k){rep.t=k;repUI();toast(`Heard “${t}”. Tagged as ${T[k].toLowerCase()}. Now tap the map for the location.`)}else toast('Could not tell the issue type. Pick one below.')};
$('#vt').onkeydown=e=>{if(e.key=='Enter'&&e.target.value.trim())tag(e.target.value)};
$('#mic').onclick=()=>{const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return toast('Voice input is not supported in this browser. Type instead.');const r=new R();r.lang=$('#lg').value;r.onresult=e=>{const t=e.results[0][0].transcript;$('#vt').value=t;tag(t)};r.onerror=()=>toast('The microphone is not available here. Type instead.');r.start()};
['ra','rb'].forEach((id,k)=>{$('#'+id).innerHTML=POI.map((p,j)=>`<option value='${j}' ${j==k?'selected':''}>${p.n}</option>`).join('');$('#'+id).onchange=routeUI});
$('#bud').oninput=planUI;
repUI();render();
