import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { CATEGORY_KEYS, ISSUE_TITLES, PERSONAS, REPAIR_COSTS, createSeedIssues } from './data.js';
import { calculateScore, explainScore, priorityBand } from './scoring.js';
import { guessIssueCategory } from './reporting.js';

const $=s=>document.querySelector(s);
const K=CATEGORY_KEYS,T=ISSUE_TITLES;
const P=Object.fromEntries(Object.entries(PERSONAS).map(([key,p])=>[key,{n:p.name,s:p.plural,e:p.icon,w:p.weights}]));
const issues=createSeedIssues().map(i=>({id:i.id,t:i.type,type:i.type,x:i.x,y:i.y,n:i.reports,reports:i.reports,age:i.age,mg:i.merged}));
let ps='wheel',cur=0,merged=0,rep={};
const band=priorityBand;
const sc=(issue,persona=ps)=>calculateScore(issue,persona,schools.length?scorePlaces():undefined);
const why=(issue,breakdown)=>explainScore(issue,breakdown,ps);
const map=$('#map'),DEMO_CENTER={lat:12.9716,lng:77.5946},METERS_PER_UNIT=2.5;
let origin={...DEMO_CENTER},located=false,userMarker=null,reportMarker=null,schools=[],schoolRequest=0,fitNextRoute=false,schoolLookupKey='',schoolLookupAt=0,schoolLookupReady=false,schoolLookupPending=false;
const routeCache=new Map(),routePending=new Map();
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
const scorePlaces=()=>schools.map(s=>({...toLocal(L.latLng(s.lat,s.lon)),name:s.name,weight:s.govt ? 1 : s.primary ? .9 : .8}));
const coordText=ll=>'Lat '+ll.lat.toFixed(6)+' · Lng '+ll.lng.toFixed(6);
const cssColor=name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const bandColor=token=>cssColor(token.match(/--[\w-]+/)[0]);
function showCoordinates(ll,label='Selected location'){$('#mapcoord-label').textContent=label;$('#mapcoord').textContent=coordText(ll)}
function drawSchoolLayer(){
 placeLayer.clearLayers();
 schools.forEach(s=>{
  const kind=s.govt?'Government school':s.primary?'Primary school':'Nearby school';
  const marker=L.marker([s.lat,s.lon],{icon:L.divIcon({className:'poi-icon school-icon',html:'<span>🏫</span>',iconSize:[32,32],iconAnchor:[16,16]}),title:`${s.name} · ${kind}`}).addTo(placeLayer);
  marker.bindTooltip(s.name,{direction:'top',offset:[0,-12]});
  marker.on('click',()=>{if($(`#rb option[value="${s.id}"]`)){$('#rb').value=s.id;showCoordinates(L.latLng(s.lat,s.lon),'Route destination');fitNextRoute=true;tab('rt')}});
 });
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function schoolKind(s){return s.govt&&s.primary?'Government primary school':s.govt?'Government school':s.primary?'Primary school':'School'}
function rebuildRouteOptions(keep=true){
 const oldA=$('#ra').value,oldB=$('#rb').value;
 const stops=[{id:'current',name:located?'My location':'Bengaluru demo center',lat:origin.lat,lon:origin.lng,kind:located?'Your location':'Demo map center'},...schools];
 const options=stops.map(s=>`<option value="${esc(s.id)}">${esc(s.id==='current'?s.name:`${s.name} · ${schoolKind(s)}`)}</option>`).join('');
 ['ra','rb'].forEach(id=>{$('#'+id).innerHTML=options});
 const primary=schools.find(s=>s.primary)||schools.find(s=>s.govt)||schools[0];
 $('#ra').value=keep&&stops.some(s=>s.id===oldA)?oldA:'current';
 $('#rb').value=keep&&stops.some(s=>s.id===oldB)?oldB:(primary?.id||'current');
 if($('#rb').value==='current'&&schools.length)$('#rb').value=schools[0].id;
}
function classifySchool(tags={}){
 const name=tags.name||tags['name:en']||tags.operator||'Unnamed school';
 const govtText=[name,tags.operator,tags['operator:type'],tags.ownership,tags['school:ownership']].filter(Boolean).join(' ');
 const govt=/government|govt\.?|public school|state[- ]run|municipal|zilla parishad|z\.?p\.? school|education department/i.test(govtText)
  ||/^(government|public|municipal)$/i.test(tags['operator:type']||'')||/^(government|public|municipal)$/i.test(tags.ownership||'');
 const levels=[tags['isced:level'],tags['school:level'],tags.education,tags.grades,tags['education:level'],name].filter(Boolean).join(' ');
 const primary=/(^|[^a-z])(1|primary|elementary|lower primary|l\.?p\.?s?)([^a-z]|$)/i.test(levels);
 return{name,govt,primary};
}
async function loadNearbySchools(center){
 const centerKey=`${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
 if(centerKey===schoolLookupKey&&(schoolLookupReady||Date.now()-schoolLookupAt<30000))return;
 const request=++schoolRequest;
 schoolLookupKey=centerKey;schoolLookupAt=Date.now();schoolLookupReady=false;schoolLookupPending=true;schools=[];
 rebuildRouteOptions(false);drawSchoolLayer();render();
 $('#locstatus').textContent='Satellite view near you · finding nearby schools…';
 const lat=center.lat.toFixed(6),lon=center.lng.toFixed(6);
 const query=`[out:json][timeout:10];(node(around:5000,${lat},${lon})["amenity"="school"]["name"];way(around:5000,${lat},${lon})["amenity"="school"]["name"];relation(around:5000,${lat},${lon})["amenity"="school"]["name"];);out center tags;`;
 try{
  let data=null,lastError=null;
  for(const endpoint of ['https://overpass-api.de/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter']){
   try{
    const response=await fetch(endpoint+'?data='+encodeURIComponent(query),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if(response.status===406||response.status===429)throw new Error('OpenStreetMap asked the app to pause school lookups. Try again later.');
    if(!response.ok)throw new Error(`School lookup returned ${response.status}`);
    data=await response.json();break;
   }catch(error){lastError=error;if(/406|429|asked the app to pause/i.test(error.message||''))break}
  }
  if(!data)throw lastError||new Error('Nearby school data is temporarily unavailable.');
  if(request!==schoolRequest)return;
  schoolLookupReady=true;schoolLookupPending=false;
  schools=(data.elements||[]).map(e=>{
   const point=e.center||e;const classified=classifySchool(e.tags||{});
   return{id:`school-${e.type}-${e.id}`,osmType:e.type,osmId:e.id,lat:point.lat,lon:point.lon,...classified};
  }).filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon)&&s.name!=='Unnamed school')
    .sort((a,b)=>distanceMeters(center,{lat:a.lat,lng:a.lon})-distanceMeters(center,{lat:b.lat,lng:b.lon}))
    .filter((s,i,all)=>all.findIndex(x=>x.name.toLowerCase()===s.name.toLowerCase()&&Math.abs(x.lat-s.lat)<.00015&&Math.abs(x.lon-s.lon)<.00015)===i)
    .slice(0,30);
  rebuildRouteOptions(false);drawSchoolLayer();fitNextRoute=true;render();
  $('#locstatus').textContent=schools.length?`Satellite view near you · ${schools.length} nearby schools from OpenStreetMap`:'Satellite view near you · no nearby schools listed in OpenStreetMap';
  if(schools.length)toast(`Found ${schools.length} nearby schools. Choose one to plan a real street route.`);
  else toast('No schools were listed nearby in OpenStreetMap. You can still report issues on the map.');
  if(!$('#p-rt').hidden)routeUI();
 }catch(error){
  if(request!==schoolRequest)return;
  schoolLookupPending=false;
  schools=[];rebuildRouteOptions(false);drawSchoolLayer();render();
  $('#locstatus').textContent='Satellite view near you · school lookup unavailable';
  if(!$('#p-rt').hidden)routeUI();
 }
}
function distanceMeters(a,b){const dy=(a.lat-b.lat)*111320,dx=(a.lng-b.lng)*111320*Math.cos(a.lat*Math.PI/180);return Math.hypot(dx,dy)}
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
  loadNearbySchools(origin);if(rep.x!=null){const reportLL=toLatLng(rep.x,rep.y);pinReport(reportLL);$('#report-coords').textContent=coordText(reportLL)}
  $('#locstatus').textContent='Satellite view near you · finding nearby schools…';showCoordinates(L.latLng(origin.lat,origin.lng),'You are here');render();
 },error=>{
  $('#locstatus').textContent=error.code===1?'Location denied · Bengaluru demo area · sample issues':'Location unavailable · Bengaluru demo area · sample issues';
  if(!located)showCoordinates(L.latLng(origin.lat,origin.lng),'Demo map center');
  toast(error.code===1?'Allow location access in your browser to center the satellite map on you.':'Could not read your location. The demo map is still available.');
 },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
geoMap.on('click',e=>{const p=toLocal(e.latlng);rep.x=p.x;rep.y=p.y;showCoordinates(e.latlng,'Selected report location');pinReport(e.latlng);tab('rep');repUI()});
$('#locate').onclick=requestMyLocation;
drawSchoolLayer();geoMap.fitBounds(L.latLngBounds(toLatLng(0,0),toLatLng(800,520)),{padding:[20,20],maxZoom:15});
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
$('#go').onclick=()=>{const{x,y,t,ph}=rep,d=issues.find(i=>i.t==t&&Math.hypot(i.x-x,i.y-y)<=20);
 if(d){const m=Math.round(Math.hypot(d.x-x,d.y-y)*2.5);d.n++;d.reports=d.n;d.mg++;merged++;if(ph&&!d.ph)d.ph=ph;ring(d.x,d.y);cur=d.id;toast(`Duplicate found: same ${T[t].toLowerCase()} ${m} m from #${d.id}. Merged, now ${d.n} reports on one issue.`)}
 else{const n={id:issues.length+1,t,type:t,x,y,n:1,reports:1,age:0,mg:0,ph};issues.push(n);ring(x,y);cur=n.id;toast(`Issue #${n.id} added to the map and scored.`)}
 rep={};$('#ph').value='';repUI();render();tab('det')};
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
  i.li.style.transition='none';i.li.style.transform=`translateY(${d}px)`;requestAnimationFrame(()=>requestAnimationFrame(()=>{i.li.style.transition='transform .8s cubic-bezier(.2,.8,.2,1)';i.li.style.transform=''}))});
 detail();routeUI();planUI()}
function detail(){const D=$('#p-det'),i=issues.find(x=>x.id==cur);
 if(!i){D.innerHTML='<p class="mu">Tap any pin on the map to see its score and exactly how it was calculated.</p>';return}
 const s=sc(i),b=band(s.total),R=[[`Impact on ${P[ps].s}`,s.impact,45,`${T[i.t]} weighs ${s.weight.toFixed(2)} for this persona, times 45`],['Footfall exposure',s.footfall,25,`${s.distance} m from the ${s.place}`],['Corroboration',s.corroboration,15,`${i.n} report${i.n>1?'s':''}, full marks at 5`],['Time unresolved',s.age,15,`${i.age} day${i.age==1?'':'s'}, full marks at 30`]];
 D.innerHTML=`<div class="big"><div class="ring" style="--v:${s.total};--k:${b[1]}"><b>${s.total}</b></div><div><strong style="font-size:19px">${T[i.t]}</strong><div class="mu">#${i.id}, ${b[0]} for ${P[ps].s}${i.mg?`. ${i.mg} duplicate${i.mg>1?'s':''} merged`:''}</div></div></div>
 <div class="report-coords"><strong>Location coordinates</strong><br>${coordText(toLatLng(i.x,i.y))}</div>
 ${i.fx?`<p><strong style='color:var(--c4)'>Fixed</strong></p>${i.af?cmp(i):''}`:`<button class='sm' id='st'>Still broken here (${i.cf||0})</button><div class='res'><strong>Fixed?</strong><p class='mu' style='margin:4px 0'>Add an after photo as proof.</p><input type='file' id='af' accept='image/*' aria-label='After photo'><button class='sm f' id='fx'>Mark as fixed</button></div>`}
 ${i.ph&&!(i.fx&&i.af)?`<img class='pv' src='${i.ph}' alt='Photo of the issue'>`:''}
 ${R.map(r=>`<div class="row"><div><span>${r[0]}</span><span>${r[1].toFixed(1)} / ${r[2]}</span></div><div class="bar"><i style="width:${r[1]/r[2]*100}%"></i></div><small>${r[3]}</small></div>`).join('')}
 <code>score = 45 × impact weight + 25 × exposure + 15 × min(reports ÷ 5, 1) + 15 × min(days ÷ 30, 1)</code>
 <strong>Same issue, four realities</strong>
 ${['wheel','eld','vis','par'].map(k=>{const v=sc(i,k).total;return`<div class="mini ${k==ps?'on':''}"><span>${P[k].e} ${P[k].n}</span><div class="bar"><i style="width:${v}%;background:${band(v)[1]}"></i></div><span>${v}</span></div>`}).join('')}`;wire(i)}
$('#pers').innerHTML=Object.keys(P).map(k=>`<button data-p="${k}">${P[k].e} ${P[k].n}</button>`).join('');
document.querySelectorAll('#pers button').forEach(b=>b.onclick=()=>{ps=b.dataset.p;render()});
const C=REPAIR_COSTS,fmt=n=>'₹'+n.toLocaleString('en-IN'),live=()=>issues.filter(i=>!i.fx);
const wt=i=>P[ps].w[K.indexOf(i.t)];
let currentRouteKey='';
const routeStop=id=>id==='current'?{id:'current',name:located?'My location':'Bengaluru demo center',lat:origin.lat,lon:origin.lng}:schools.find(s=>s.id===id);
const profile=()=>ps==='wheel'?'wheelchair':ps==='vis'?'blind':'foot';
const fmtDistance=km=>km<1?`${Math.round(km*1000)} m`:`${km.toFixed(1)} km`;
const fmtDuration=seconds=>{const minutes=Math.max(1,Math.round(seconds/60));return minutes<60?`${minutes} min`:`${Math.floor(minutes/60)} hr ${minutes%60} min`};
function decodePolyline6(encoded){let index=0,lat=0,lon=0,points=[];while(index<encoded.length){let result=0,shift=0,byte;do{byte=encoded.charCodeAt(index++)-63;result|=(byte&0x1f)<<shift;shift+=5}while(byte>=0x20);lat+=result&1?~(result>>1):result>>1;result=0;shift=0;do{byte=encoded.charCodeAt(index++)-63;result|=(byte&0x1f)<<shift;shift+=5}while(byte>=0x20);lon+=result&1?~(result>>1):result>>1;points.push([lat/1e6,lon/1e6])}return points}
async function fetchPedestrianRoute(from,to,costing){
 const response=await fetch('https://valhalla1.openstreetmap.de/route',{method:'POST',headers:{'Content-Type':'application/json','X-Client-Id':'last-100-metres-hackathon-prototype'},body:JSON.stringify({locations:[{lat:from.lat,lon:from.lon,type:'break'},{lat:to.lat,lon:to.lon,type:'break'}],costing:'pedestrian',costing_options:{pedestrian:{type:costing}},units:'kilometers',language:'en-US'}),signal:AbortSignal.timeout(25000)});
 const payload=await response.json();if(!response.ok||payload.error)throw new Error(payload.error||`Routing returned ${response.status}`);
 const trip=payload.trip,leg=trip?.legs?.[0];if(!leg?.shape)throw new Error('No walkable route was returned for those locations.');
 return{points:decodePolyline6(leg.shape),summary:trip.summary,maneuvers:leg.maneuvers||[]};
}
function pointToSegmentMeters(point,a,b){const scaleX=111320*Math.cos(point.lat*Math.PI/180),ax=(a[1]-point.lng)*scaleX,ay=(a[0]-point.lat)*111320,bx=(b[1]-point.lng)*scaleX,by=(b[0]-point.lat)*111320,dx=bx-ax,dy=by-ay,ratio=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));return Math.hypot(ax+ratio*dx,ay+ratio*dy)}
function barriersOnRoute(points){return live().map(i=>{const ll=toLatLng(i.x,i.y);let d=Infinity;for(let n=1;n<points.length;n++)d=Math.min(d,pointToSegmentMeters(ll,points[n-1],points[n]));return{i,d,weight:wt(i)}}).filter(x=>x.d<28&&x.weight>=.3).sort((a,b)=>a.d-b.d)}
function showRoute(route,from,to,fit){
 routeLayer.clearLayers();const latlngs=route.points.map(p=>L.latLng(p[0],p[1]));
 L.polyline(latlngs,{pane:'routePane',color:'#fff',weight:13,opacity:.92,lineCap:'round',lineJoin:'round',attribution:'Route data © OpenStreetMap contributors'}).addTo(routeLayer);
 L.polyline(latlngs,{pane:'routePane',color:cssColor('--ac'),weight:7,opacity:.97,lineCap:'round',lineJoin:'round'}).addTo(routeLayer);
 const endpoint=(ll,label,letter)=>L.marker(ll,{pane:'markerPane',icon:L.divIcon({className:'route-end-icon',html:`<span>${letter}</span>`,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(routeLayer).bindTooltip(`${label} · ${coordText(L.latLng(ll.lat,ll.lon))}`,{direction:'top'});
 endpoint(L.latLng(from.lat,from.lon),from.name,'A');endpoint(L.latLng(to.lat,to.lon),to.name,'B');
 if(fit&&latlngs.length>1)geoMap.fitBounds(L.latLngBounds(latlngs),{padding:[55,55],maxZoom:17});
 const hazards=barriersOnRoute(route.points),summary=route.summary||{},steps=route.maneuvers||[];
 const eta=Number(summary.time)||steps.reduce((n,s)=>n+(Number(s.time)||0),0),distance=Number(summary.length)||steps.reduce((n,s)=>n+(Number(s.length)||0),0);
 const hazardLine=hazards.length?`<div class="route-alert"><strong>${hazards.length} sample issue pin${hazards.length===1?'':'s'} near this route</strong><span>${hazards.slice(0,4).map(({i,d})=>`#${i.id} ${esc(T[i.t].toLowerCase())} · ${Math.round(d)} m`).join(' · ')}</span><small>These are prototype reports. Confirm conditions on the ground.</small></div>`:'<div class="route-clear">No sample issue pins were found close to this route.</div>';
 const directionList=steps.length?`<div class="route-steps"><h3>Walking directions</h3>${steps.map((s,i)=>`<div class="turn-step"><span>${i+1}</span><div><strong>${esc(s.instruction||'Continue on the route')}</strong><small>${Number(s.length)>0?fmtDistance(Number(s.length)):''}${Number(s.time)>0?' · '+fmtDuration(Number(s.time)):''}</small></div></div>`).join('')}</div>`:'<p class="mu">Turn-by-turn steps were not included for this route.</p>';
 $('#rres').innerHTML=`<div class="route-summary"><strong>${fmtDistance(distance)} · ${fmtDuration(eta)}</strong><span>Pedestrian route for ${esc(P[ps].n.toLowerCase())}</span></div>${hazardLine}${directionList}<small class="route-source">Street routing: OpenStreetMap data · Valhalla. Distance and time are estimates.</small>`;
}
function routeUI(){
 routeLayer.clearLayers();if($('#p-rt').hidden)return;
 const p=P[ps],from=routeStop($('#ra').value),to=routeStop($('#rb').value),costing=profile();
 $('#rtn').textContent=`${located?'Nearby schools are based on OpenStreetMap data.':'Use your location to load nearby schools.'} Walking profile: ${costing==='blind'?'visually impaired':costing==='wheelchair'?'wheelchair':'standard pedestrian'}.`;
 if(!from||!to||$('#ra').value===$('#rb').value){
  const message=!located?'Use your location to find nearby schools.':schoolLookupPending?'Finding nearby schools…':!schoolLookupReady?'OpenStreetMap school data is temporarily unavailable. Try again shortly.':!schools.length?'No named schools are listed nearby in OpenStreetMap.':'Choose two different locations.';
  $('#rres').innerHTML=`<div class="route-empty"><strong>${message}</strong><span>${schools.length?'Pick a nearby school for turn-by-turn walking directions.':'Government and primary labels appear when local map data identifies them.'}</span></div>`;return
 }
 const key=[from.lat.toFixed(6),from.lon.toFixed(6),to.lat.toFixed(6),to.lon.toFixed(6),costing].join('|'),fit=fitNextRoute;fitNextRoute=false;currentRouteKey=key;
 if(routeCache.has(key)){showRoute(routeCache.get(key),from,to,fit);return}
 $('#rres').innerHTML='<div class="route-loading"><span class="spinner"></span><strong>Finding a walkable street route…</strong><small>Using OpenStreetMap street data.</small></div>';
 if(routePending.has(key))return;
 const promise=fetchPedestrianRoute(from,to,costing);routePending.set(key,promise);
 promise.then(route=>{routeCache.set(key,route);if(currentRouteKey===key&&!$('#p-rt').hidden)showRoute(route,from,to,fit)}).catch(error=>{if(currentRouteKey===key&&!$('#p-rt').hidden)$('#rres').innerHTML=`<div class="route-error"><strong>Could not find a route</strong><span>${esc(error.message||'The routing service is temporarily unavailable.')}</span><button class="sm" id="retry-route">Try again</button></div>`}).finally(()=>{routePending.delete(key);const retry=$('#retry-route');if(retry)retry.onclick=routeUI});
}
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
function fixIt(i){i.fx=true;i.li.hidden=true;toast(`#${i.id} marked fixed. Map pins, ranking, and routes updated.`);render()}
function wire(i){const D=$('#p-det'),q=s=>D.querySelector(s);
 if(q('#st'))q('#st').onclick=()=>{i.n++;i.reports=i.n;i.cf=(i.cf||0)+1;toast(`Confirmed. #${i.id} now has ${i.n} reports, so its score went up.`);render()};
 if(q('#af'))q('#af').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>i.af=r.result;r.readAsDataURL(f)};
 if(q('#fx'))q('#fx').onclick=()=>fixIt(i);
 const g=q('input[type=range]');if(g)g.oninput=()=>q('.cmp').style.setProperty('--p',g.value)}
const tag=t=>{const k=guessIssueCategory(t);if(k){rep.t=k;repUI();toast(`Heard “${t}”. Tagged as ${T[k].toLowerCase()}. Now tap the map for the location.`)}else toast('Could not tell the issue type. Pick one below.')};
$('#vt').onkeydown=e=>{if(e.key=='Enter'&&e.target.value.trim())tag(e.target.value)};
$('#mic').onclick=()=>{const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return toast('Voice input is not supported in this browser. Type instead.');const r=new R();r.lang=$('#lg').value;r.onresult=e=>{const t=e.results[0][0].transcript;$('#vt').value=t;tag(t)};r.onerror=()=>toast('The microphone is not available here. Type instead.');r.start()};
rebuildRouteOptions(false);
['ra','rb'].forEach(id=>$('#'+id).onchange=()=>{fitNextRoute=true;const stop=routeStop($('#'+id).value);if(stop)showCoordinates(L.latLng(stop.lat,stop.lon),id==='ra'?'Route start':'Route destination');routeUI()});
$('#bud').oninput=planUI;
repUI();render();showCoordinates(L.latLng(origin.lat,origin.lng),'Bengaluru demo center');requestMyLocation();
