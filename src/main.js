
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { CATEGORY_KEYS, ISSUE_TITLES, PERSONAS, PLACES, REPAIR_COSTS, createSeedIssues } from './data.js';
import { calculateScore, distanceToSegment, explainScore, priorityBand } from './scoring.js';
import { createStreetGraph, nearestStreetNode, segmentLengthMeters } from './streets.js';
import { guessIssueCategory } from './reporting.js';

import {
  getNotifications,
  addNotification,
  markAsRead,
  clearNotifications
} from './notification.js';

const $=s=>document.querySelector(s);
const K=CATEGORY_KEYS,T=ISSUE_TITLES;
const P=Object.fromEntries(Object.entries(PERSONAS).map(([key,p])=>[key,{n:p.name,s:p.plural,e:p.icon,w:p.weights}]));
const POI=PLACES.map(p=>({...p,n:p.name,w:p.weight,g:p.icon}));
const issues=createSeedIssues().map(i=>({id:i.id,t:i.type,type:i.type,x:i.x,y:i.y,n:i.reports,reports:i.reports,age:i.age,mg:i.merged}));
let ps='wheel',cur=0,merged=0,rep={};
const {segments:S,connections:G}=createStreetGraph(),sd=distanceToSegment,band=priorityBand;
const sc=(issue,persona=ps)=>calculateScore(issue,persona);
const why=(issue,breakdown)=>explainScore(issue,breakdown,ps);
const map=$('#map'),DEMO_CENTER={lat:12.9716,lng:77.5946},METERS_PER_UNIT=2.5;
let origin={...DEMO_CENTER},located=false,userMarker=null,reportMarker=null;
const geoMap=L.map(map,{zoomControl:true,scrollWheelZoom:false,preferCanvas:true}).setView([origin.lat,origin.lng],15);
geoMap.createPane('routePane');geoMap.getPane('routePane').style.zIndex=450;
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
 maxZoom:19,
 attribution:'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community'
}).addTo(geoMap);
L.control.scale({metric:true,imperial:false,position:'bottomleft'}).addTo(geoMap);
const placeLayer=L.layerGroup().addTo(geoMap),issueLayer=L.layerGroup().addTo(geoMap),routeLayer=L.layerGroup().addTo(geoMap),reportLayer=L.layerGroup().addTo(geoMap);
const toLatLng=(x,y)=>{
 const north=(260-y)*METERS_PER_UNIT,east=(x-400)*METERS_PER_UNIT;
 return L.latLng(origin.lat+north/111320,origin.lng+east/(111320*Math.cos(origin.lat*Math.PI/180)));
};
const toLocal=ll=>({
 x:400+(ll.lng-origin.lng)*111320*Math.cos(origin.lat*Math.PI/180)/METERS_PER_UNIT,
 y:260-(ll.lat-origin.lat)*111320/METERS_PER_UNIT
});
const coordText=ll=>'Lat '+ll.lat.toFixed(6)+' · Lng '+ll.lng.toFixed(6);
const cssColor=name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const bandColor=token=>cssColor(token.match(/--[\w-]+/)[0]);
function showCoordinates(ll,label='Selected location'){$('#mapcoord-label').textContent=label;$('#mapcoord').textContent=coordText(ll)}
function drawStaticLayers(){
 placeLayer.clearLayers();
 POI.forEach(p=>L.marker(toLatLng(p.x,p.y),{interactive:false,icon:L.divIcon({className:'poi-icon',html:'<span>'+p.g+'</span>',iconSize:[27,27],iconAnchor:[14,14]})}).addTo(placeLayer).bindTooltip(p.n,{direction:'top',offset:[0,-12]}));
}
function pinReport(ll){if(reportMarker)reportMarker.remove();reportMarker=L.circleMarker(ll,{radius:10,color:'#fff',weight:3,fillColor:'#d6246e',fillOpacity:1}).addTo(reportLayer)}
function ring(x,y){const c=L.circleMarker(toLatLng(x,y),{radius:15,className:'rg',fillOpacity:.35}).addTo(reportLayer);setTimeout(()=>c.remove(),1100)}
function requestMyLocation(){
 if(!navigator.geolocation){$('#locstatus').textContent='Location is unavailable in this browser · showing the demo area';return}
 $('#locstatus').textContent='Requesting your location…';
 navigator.geolocation.getCurrentPosition(position=>{
  origin={lat:position.coords.latitude,lng:position.coords.longitude};located=true;
  geoMap.fitBounds(L.latLngBounds(toLatLng(0,0),toLatLng(800,520)),{padding:[20,20],maxZoom:15});
  if(userMarker)userMarker.setLatLng([origin.lat,origin.lng]);
  else userMarker=L.marker([origin.lat,origin.lng],{interactive:false,icon:L.divIcon({className:'user-location-icon',html:'<span class="user-location"></span>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(geoMap);
  drawStaticLayers();if(rep.x!=null){const reportLL=toLatLng(rep.x,rep.y);pinReport(reportLL);$('#report-coords').textContent=coordText(reportLL)}
  $('#locstatus').textContent='Satellite view near you · sample issue pins';showCoordinates(L.latLng(origin.lat,origin.lng),'You are here');render();
 },error=>{
  $('#locstatus').textContent=error.code===1?'Location denied · Bengaluru demo area · sample issues':'Location unavailable · Bengaluru demo area · sample issues';
  if(!located)showCoordinates(L.latLng(origin.lat,origin.lng),'Demo map center');
  toast(error.code===1?'Allow location access in your browser to center the satellite map on you.':'Could not read your location. The demo map is still available.');
 },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
geoMap.on('click',e=>{const p=toLocal(e.latlng);rep.x=p.x;rep.y=p.y;showCoordinates(e.latlng,'Selected report location');pinReport(e.latlng);tab('rep');repUI()});
$('#locate').onclick=requestMyLocation;
drawStaticLayers();geoMap.fitBounds(L.latLngBounds(toLatLng(0,0),toLatLng(800,520)),{padding:[20,20],maxZoom:15});
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t.h);t.h=setTimeout(()=>t.classList.remove('on'),4500)}
function tab(k){['top','rep','det','rt','plan'].forEach(x=>$('#p-'+x).hidden=x!=k);if(k=='rt')routeUI();else routeLayer.clearLayers();document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t==k))}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>tab(b.dataset.t));
function sel(id){cur=id;const i=issues.find(x=>x.id==id);if(i){const ll=toLatLng(i.x,i.y);showCoordinates(ll,'Issue #'+i.id);geoMap.panTo(ll)}render();tab('det')}
function repUI(){
 $('#chips').innerHTML=K.map(k=>`<button data-k="${k}" class="${rep.t==k?'on':''}">${T[k]}</button>`).join('');
 $('#chips').querySelectorAll('button').forEach(b=>b.onclick=()=>{rep.t=b.dataset.k;repUI()});
 $('#pst').textContent=rep.x==null?'Step 1: tap the map to drop a pin where the problem is.':'Pin dropped. Pick the issue type and add a photo.';
 if(rep.x==null){$('#report-coords').textContent='Tap the map to set a pin and see its coordinates.';if(reportMarker){reportMarker.remove();reportMarker=null}}
 else{const ll=toLatLng(rep.x,rep.y);$('#report-coords').textContent=coordText(ll);showCoordinates(ll,'Selected report location');pinReport(ll)}
 const pv=$('#pv');pv.hidden=!rep.ph;if(rep.ph)pv.src=rep.ph;
 $('#go').disabled=rep.x==null||!rep.t;
}
$('#ph').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{rep.ph=r.result;repUI()};r.readAsDataURL(f)};
$('#dup').onclick=()=>{const i=issues[1];rep={x:i.x+9,y:i.y+7,t:i.t};repUI();toast('A second report of the same issue, 12 m away. Now press Submit.')};

// Submit a new issue or merge it with an existing issue
$('#go').onclick = () => {
  const { x, y, t, ph } = rep;

  const d = issues.find(
    i => i.t == t && Math.hypot(i.x - x, i.y - y) <= 20
  );

  if (d) {
    const m = Math.round(Math.hypot(d.x - x, d.y - y) * 2.5);

    d.n++;
    d.reports = d.n;
    d.mg++;
    merged++;

    if (ph && !d.ph) d.ph = ph;

    ring(d.x, d.y);
    cur = d.id;

    toast(`Duplicate found: same ${T[t].toLowerCase()} ${m} m from #${d.id}. Merged, now ${d.n} reports on one issue.`);

    addNotification(
      'Report merged',
      `Your report was merged with existing issue #${d.id}. Total reports: ${d.n}.`
    );
  } else {
    const n = {
      id: issues.length + 1,
      t,
      type: t,
      x,
      y,
      n: 1,
      reports: 1,
      age: 0,
      mg: 0,
      ph
    };

    issues.push(n);
    ring(x, y);
    cur = n.id;

    toast(`Issue #${n.id} added to the map and scored.`);

    addNotification(
      'New issue reported',
      `Your issue #${n.id} has been added successfully.`
    );
  }

  renderNotifications();

  rep = {};
  $('#ph').value = '';
  repUI();
  render();
  tab('det');
};

function render(){
 const p=P[ps],rows=live().map(i=>({i,s:sc(i)}));
 $('#s1').textContent=rows.length;$('#s2').textContent=rows.filter(r=>r.s.total>=75).length;$('#s2l').textContent='critical for '+p.s;$('#s3').textContent=merged;$('#vw').textContent=`Viewing as ${p.e} ${p.n}`;
 $('#note').textContent=`Ranked for ${p.n.toLowerCase()}. Switch the persona above and watch the order change.`;
 document.querySelectorAll('#pers button').forEach(b=>b.classList.toggle('on',b.dataset.p==ps));
 issues.forEach(i=>{
  const score=sc(i),color=i.fx?cssColor('--c4'):bandColor(band(score.total)[1]);
  const icon=L.divIcon({className:'pin-wrap',html:'<span class="map-pin '+(i.id==cur?'active ':'')+(i.fx?'fixed':'')+'" style="--pin-color:'+color+'"><span>'+(i.fx?'✓':score.total)+'</span></span>',iconSize:[32,32],iconAnchor:[16,30]});
  if(!i.marker){i.marker=L.marker(toLatLng(i.x,i.y),{icon,title:'Issue #'+i.id+', '+T[i.t]+', score '+score.total,riseOnHover:true}).addTo(issueLayer);i.marker.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);sel(i.id)})}
  else{i.marker.setLatLng(toLatLng(i.x,i.y));i.marker.setIcon(icon)}
  i.marker.bindTooltip('Issue #'+i.id+' · '+T[i.t]+' · '+(i.fx?'Fixed':'Score '+score.total),{direction:'top',offset:[0,-25]});
 });
 const O=$('#top');issues.forEach(i=>{if(!i.li){i.li=document.createElement('li');i.li.onclick=()=>sel(i.id);O.append(i.li)}});
 const f=new Map(issues.map(i=>[i,i.li.hidden?null:i.li.getBoundingClientRect().top]));
 rows.sort((a,b)=>b.s.total-a.s.total).forEach(({i,s},k)=>{i.li.hidden=k>9;i.li.classList.toggle('on',i.id==cur);
  i.li.innerHTML=`<span class="rk">${k+1}</span><div><strong>${T[i.t]}</strong> <em>#${i.id}</em><p>${why(i,s)}</p></div><span class="sc" style="background:${band(s.total)[1]}">${s.total}</span>`;O.append(i.li)});
 rows.slice(0,10).forEach(({i})=>{const o=f.get(i);if(o==null)return;const d=o-i.li.getBoundingClientRect().top;if(!d)return;
  i.li.style.transition='none';i.li.style.transform=`translateY(${d}px)`;requestAnimationFrame(()=>requestAnimationFrame(()=>{i.li.style.transition='transform .8s cubic-bezier(.2,.8,1)';i.li.style.transform=''}))});
 detail();routeUI();planUI()
}

function detail(){
 const D=$('#p-det'),i=issues.find(x=>x.id==cur);
 if(!i){D.innerHTML='<p class="mu">Tap any pin on the map to see its score and exactly how it was calculated.</p>';return}
 const s=sc(i),b=band(s.total),R=[[`Impact on ${P[ps].s}`,s.impact,45,`${T[i.t]} weighs ${s.weight.toFixed(2)} for this persona, times 45`],['Footfall exposure',s.footfall,25,`${s.distance} m from the ${s.place}`],['Corroboration',s.corroboration,15,`${i.n} report${i.n>1?'s':''}, full marks at 5`],['Time unresolved',s.age,15,`${i.age} day${i.age==1?'':'s'}, full marks at 30`]];
 D.innerHTML=`<div class="big"><div class="ring" style="--v:${s.total};--k:${b[1]}"><b>${s.total}</b></div><div><strong style="font-size:19px">${T[i.t]}</strong><div class="mu">#${i.id}, ${b[0]} for ${P[ps].s}${i.mg?`. ${i.mg} duplicate${i.mg>1?'s':''} merged`:''}</div></div></div>
 <div class="report-coords"><strong>Location coordinates</strong><br>${coordText(toLatLng(i.x,i.y))}</div>
 ${i.fx?`<p><strong style='color:var(--c4)'>Fixed</strong></p>${i.af?cmp(i):''}`:`<button class='sm' id='st'>Still broken here (${i.cf||0})</button><div class='res'><strong>Fixed?</strong><p class='mu' style='margin:4px 0'>Add an after photo as proof.</p><input type='file' id='af' accept='image/*' aria-label='After photo'><button class='sm f' id='fx'>Mark as fixed</button></div>`}
 ${i.ph&&!(i.fx&&i.af)?`<img class='pv' src='${i.ph}' alt='Photo of the issue'>`:''}
 ${R.map(r=>`<div class="row"><div><span>${r[0]}</span><span>${r[1].toFixed(1)} / ${r[2]}</span></div><div class="bar"><i style="width:${r[1]/r[2]*100}%"></i></div><small>${r[3]}</small></div>`).join('')}
 <code>score = 45 × impact weight + 25 × exposure + 15 × min(reports ÷ 5, 1) + 15 × min(days ÷ 30, 1)</code>
 <strong>Same issue, four realities</strong>
 ${['wheel','eld','vis','par'].map(k=>{const v=sc(i,k).total;return`<div class="mini ${k==ps?'on':''}"><span>${P[k].e} ${P[k].n}</span><div class="bar"><i style="width:${v}%;background:${band(v)[1]}"></i></div><span>${v}</span></div>`}).join('')}`;
 wire(i);
}

$('#pers').innerHTML=Object.keys(P).map(k=>`<button data-p="${k}">${P[k].e} ${P[k].n}</button>`).join('');
document.querySelectorAll('#pers button').forEach(b=>b.onclick=()=>{ps=b.dataset.p;render()});
const C=REPAIR_COSTS,fmt=n=>'₹'+n.toLocaleString('en-IN'),live=()=>issues.filter(i=>!i.fx);
const wt=i=>P[ps].w[K.indexOf(i.t)],slen=si=>segmentLengthMeters(S,si);
const snap=p=>nearestStreetNode(p,G);
const wseg=(si,skip)=>{let m=0;live().forEach(i=>{if(i.id!=skip&&sd(i,S[si])<=30)m=Math.max(m,wt(i))});return m};
function route(a,b,skip){
 const D={[a]:0},pv={},seen=new Set();
 while(1){
  let u=null;
  for(const k in D)if(!seen.has(k)&&(u==null||D[k]<D[u]))u=k;
  if(u==null)return null;
  if(u==b)break;
  seen.add(u);
  for(const[v,si]of G[u]){
   const w=wseg(si,skip);
   if(w>=.9)continue;
   const c=D[u]+slen(si)*(1+3*w);
   if(D[v]==null||c<D[v]){D[v]=c;pv[v]=[u,si]}
  }
 }
 const r=[];
 for(let k=b;k!=a;k=pv[k][0])r.push(pv[k][1]);
 return r.reverse()
}

function routeUI(){
 routeLayer.clearLayers();
 if($('#p-rt').hidden)return;
 const A=snap(POI[$('#ra').value]),B=snap(POI[$('#rb').value]),p=P[ps];
 $('#rtn').textContent=`Walking as a ${p.n.toLowerCase()}. Any barrier that fully blocks this persona closes the street.`;
 let r=route(A,B),dash=false,h;
 if(r){
  const L=Math.round(r.reduce((t,si)=>t+slen(si),0)),bs=new Set();
  r.forEach(si=>live().forEach(i=>{if(sd(i,S[si])<=30&&wt(i)>=.3)bs.add(i.id)}));
  h=`<strong>${bs.size?`Passable, with ${bs.size} barrier${bs.size>1?'s':''}`:'Clear route'}</strong><p class='mu'>${L} m. ${bs.size?'On the way: '+[...bs].map(id=>'#'+id+' '+T[issues[id-1].t].toLowerCase()).join(', ')+'.':'Nothing here blocks or slows '+p.s+'.'}</p>`
 }else{
  let best=null;
  live().forEach(i=>{if(wt(i)<.9)return;const x=route(A,B,i.id);if(x&&(!best||x.length<best.r.length))best={i,r:x}});
  h=`<strong style='color:var(--c1)'>No passable route for ${p.s}</strong><p class='mu'>${best?`Fixing #${best.i.id} (${T[best.i.t].toLowerCase()}) would open one. The dashed line shows the route it unlocks.`:'More than one blockage is in the way.'}</p>`;
  if(best){r=best.r;dash=true}
 }
 $('#rres').innerHTML=h;
 if(r&&r.length)r.forEach(si=>{const s=S[si];L.polyline([toLatLng(s[0],s[1]),toLatLng(s[2],s[3])],{pane:'routePane',color:cssColor('--ac'),weight:6,opacity:.95,dashArray:dash?'2 10':null,lineCap:'round'}).addTo(routeLayer)})
}

function plan(){
 const b=+$('#bud').value,o=live().map(i=>({i,s:sc(i).total,c:C[i.t]})).sort((x,y)=>y.s/y.c-x.s/x.c);
 let left=b;
 const pick=o.filter(r=>r.c<=left&&(left-=r.c,1));
 return{b,pick,spent:b-left}
}

function planUI(){
 const{b,pick,spent}=plan(),ids=new Set(pick.map(r=>r.i.id)),load=(p,ex)=>live().reduce((t,i)=>t+(ex&&ids.has(i.id)?0:sc(i,p).total),0);
 $('#pres').innerHTML=`<div class='res'><strong>${fmt(b)} budget</strong><p class='mu' style='margin:4px 0'>Fixes ${pick.length} issues for ${fmt(spent)}, picked by score per rupee for ${P[ps].s}.</p></div>`+
  ['wheel','eld','vis','par'].map(k=>{const a=load(k),z=load(k,1),d=a?Math.round((a-z)/a*100):0;return`<div class='mini' style='grid-template-columns:140px 1fr 44px'><span>${P[k].e} ${P[k].n}</span><div class='bar'><i style='width:${100-d}%'></i></div><span>-${d}%</span></div>`}).join('')+
  `<p class='mu' style='margin:6px 0'>Bars show the barrier load left after these fixes.</p><ol>${pick.map(r=>`<li style='grid-template-columns:1fr auto'><div><strong>${T[r.i.t]} #${r.i.id}</strong><p>${fmt(r.c)}</p></div><span class='sc' style='background:${band(r.s)[1]}'>${r.s}</span></li>`).join('')}</ol><button class='btn g' id='pr'>Print ward brief</button>`;
 $('#pr').onclick=brief
}

function brief(){
 const r=live().map(i=>({i,s:sc(i)})).sort((a,b)=>b.s.total-a.s.total).slice(0,5),q=plan();
 $('#brief').innerHTML=`<h1>Last 100 m: ward brief</h1><p>Persona: ${P[ps].n}. ${live().length} open issues, ${issues.length-live().length} fixed.</p><h2>Top 5 fixes</h2><ol>${r.map(({i,s})=>`<li><strong>${T[i.t]} #${i.id}</strong>, score ${s.total} (${band(s.total)[0]}). ${why(i,s)}</li>`).join('')}</ol><h2>Budget plan, ${fmt(q.b)}</h2><p>${q.pick.map(x=>T[x.i.t]+' #'+x.i.id).join(', ')||'None'}</p>`;
 try{window.print()}catch(e){toast('Printing is blocked here. Open the page link in its own tab and try again.')}}
const cmp=i=>{const st=`style='clip-path:inset(0 calc(100% - var(--p)*1%) 0 0)'`;return`<div class='cmp' style='--p:50'><img src='${i.af}' alt='After the fix'>${i.ph?`<img src='${i.ph}' alt='Before the fix' ${st}>`:`<div class='pv' ${st}>No before photo</div>`}</div><input type='range' min='0' max='100' value='50' aria-label='Before and after'>`};

function fixIt(i){
  i.fx = true;
  i.li.hidden = true;
  toast(`#${i.id} marked fixed. Map pins, ranking, and routes updated.`);
  addNotification(
    'Issue marked fixed',
    `Issue #${i.id} (${T[i.t]}) was marked as fixed.`
  );
  renderNotifications();
  render();
}

function wire(i){
 const D=$('#p-det'),q=s=>D.querySelector(s);
 if(q('#st'))q('#st').onclick=()=>{
  i.n++;
  i.reports=i.n;
  i.cf=(i.cf||0)+1;
  toast(`Confirmed. #${i.id} now has ${i.n} reports, so its score went up.`);
  addNotification(
    'Issue confirmed',
    `You confirmed that issue #${i.id} is still broken.`
  );
  renderNotifications();
  render()
 };
 if(q('#af'))q('#af').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>i.af=r.result;r.readAsDataURL(f)};
 if(q('#fx'))q('#fx').onclick=()=>fixIt(i);
 const g=q('input[type=range]');if(g)g.oninput=()=>q('.cmp').style.setProperty('--p',g.value)
}

const tag=t=>{
 const k=guessIssueCategory(t);
 if(k){rep.t=k;repUI();toast(`Heard “${t}”. Tagged as ${T[k].toLowerCase()}. Now tap the map for the location.`)}
 else toast('Could not tell the issue type. Pick one below.')
};
$('#vt').onkeydown=e=>{if(e.key=='Enter'&&e.target.value.trim())tag(e.target.value)};
$('#mic').onclick=()=>{
 const R=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!R)return toast('Voice input is not supported in this browser. Type instead.');
 const r=new R();
 r.lang=$('#lg').value;
 r.onresult=e=>{const t=e.results[0][0].transcript;$('#vt').value=t;tag(t)};
 r.onerror=()=>toast('The microphone is not available here. Type instead.');
 r.start()
};
['ra','rb'].forEach((id,k)=>{$('#'+id).innerHTML=POI.map((p,j)=>`<option value='${j}' ${j==k?'selected':''}>${p.n}</option>`).join('');$('#'+id).onchange=routeUI});
$('#bud').oninput=planUI;

repUI();
render();
showCoordinates(L.latLng(origin.lat,origin.lng),'Bengaluru demo center');
requestMyLocation();

// ---------- Notification System ----------

function renderNotifications() {
  const count = document.querySelector('#notification-count');
  const list = document.querySelector('#notification-list');

  if (!count || !list) return;

  const notifications = getNotifications();
  const unread = notifications.filter(n => !n.read).length;

  count.textContent = unread;
  count.hidden = unread === 0;

  list.innerHTML = '';

  if (notifications.length === 0) {
    list.textContent = 'No notifications yet.';
    return;
  }

  notifications.forEach(n => {
    const item = document.createElement('div');
    item.className = 'notification-item';

    const title = document.createElement('strong');
    title.textContent = n.title;

    const message = document.createElement('p');
    message.textContent = n.message;

    const time = document.createElement('small');
    time.textContent = new Date(n.time).toLocaleString();

    item.append(title, message, time);

    if (!n.read) {
      item.classList.add('unread');
    }

    item.onclick = () => {
      markAsRead(n.id);
      renderNotifications();
    };

    list.appendChild(item);
  });
}

// Open and close notification panel
const notificationToggle = document.querySelector('#notification-toggle');
const notificationPanel = document.querySelector('#notification-panel');

if (notificationToggle && notificationPanel) {
  notificationToggle.onclick = () => {
    notificationPanel.hidden = !notificationPanel.hidden;

    notificationToggle.setAttribute(
      'aria-expanded',
      String(!notificationPanel.hidden)
    );
  };
}

// Clear all notifications
const clearButton = document.querySelector('#clear-notifications');

if (clearButton) {
  clearButton.onclick = () => {
    clearNotifications();
    renderNotifications();
  };
}

renderNotifications();
