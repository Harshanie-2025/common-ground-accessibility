import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import Chart from 'chart.js/auto';
import { CATEGORY_KEYS, ISSUE_TITLES, PERSONAS, REPAIR_COSTS, createSeedIssues } from './data.js';
import { calculateScore, explainScore, priorityBand } from './scoring.js';
import { guessIssueCategory } from './reporting.js';
import { getNotifications, addNotification, markAsRead, clearNotifications } from './notification.js';
import { fetchLocalContext } from './local-context.js';

const $=s=>document.querySelector(s);
const K=CATEGORY_KEYS,T=ISSUE_TITLES;
const P=Object.fromEntries(Object.entries(PERSONAS).map(([key,p])=>[key,{n:p.name,s:p.plural,e:p.icon,w:p.weights}]));
const HISTORY_KEY='last100m.completedTasks.v1';
function readHistory(){try{const rows=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(rows)?rows.filter(r=>r&&Number.isFinite(Number(r.issueId))&&Number.isFinite(Number(r.lat))&&Number.isFinite(Number(r.lon))).slice(0,200):[]}catch{return[]}}
let historyRecords=readHistory();
let resolutionChart = null;

function updateResolutionChart() {
  const canvas = document.getElementById('resolution-chart');

  if (!canvas) return;

  const solved = issues.filter(i => i.fx).length;
  const pending = issues.length - solved;
  const total = issues.length;

  document.getElementById('total-count').textContent = total;
  document.getElementById('solved-count').textContent = solved;
  document.getElementById('pending-count').textContent = pending;

  document.getElementById('resolution-rate').textContent =
    total ? Math.round((solved / total) * 100) + '%' : '0%';

  if (!resolutionChart) {
    resolutionChart = new Chart(canvas, {
      type: 'pie',

      data: {
        labels: ['Solved', 'Pending'],
        datasets: [{
          data: [solved, pending],
          backgroundColor: ['#16a34a', '#f59e0b'],
          borderColor: '#0b171c',
          borderWidth: 3
        }]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: '#dce8ef'
            }
          }
        }
      }
    });
  } else {
    resolutionChart.data.datasets[0].data = [solved, pending];
    resolutionChart.update();
  }
}
const issues=createSeedIssues().map(i=>({id:i.id,t:i.type,type:i.type,x:i.x,y:i.y,n:i.reports,reports:i.reports,age:i.age,mg:i.merged}));
function restoreCompletedIssues(){issues.forEach(i=>{delete i.fx;delete i.completedAt});for(const record of historyRecords){if(distanceMeters({lat:record.baseLat??DEMO_CENTER.lat,lng:record.baseLon??DEMO_CENTER.lng},origin)>1000)continue;const issue=issues.find(i=>i.id===Number(record.issueId)&&i.t===record.type&&i.x===record.x&&i.y===record.y);if(issue){issue.fx=true;issue.completedAt=record.completedAt}}}
let ps='wheel',cur=0,merged=0,rep={};
let aiConfigured=false,aiMessages=[],aiBusy=false;
const band=priorityBand;
const sc=(issue,persona=ps)=>calculateScore(issue,persona);
const why=(issue,breakdown)=>explainScore(issue,breakdown,ps);
const map=$('#map'),DEMO_CENTER={lat:12.9716,lng:77.5946},METERS_PER_UNIT=2.5;
let origin={...DEMO_CENTER},located=false,userMarker=null,reportMarker=null,reportPickActive=false,fitNextRoute=false,routePins={from:null,to:null},mapPickTarget=null,placeResults=[],placeSearchPending=false,placeSearchError='',nominatimBusy=false,lastNominatimSearchAt=0;
let localContext=[],localContextRequest=0,localContextCenterKey='',localContextPending=false,localContextError='',localContextLoaded=false,localContextVisible=true,localContextTimestamp='';
restoreCompletedIssues();
const routeCache=new Map(),routePending=new Map();
const geoMap=L.map(map,{zoomControl:true,scrollWheelZoom:false,preferCanvas:true}).setView([origin.lat,origin.lng],15);
geoMap.createPane('routePane');geoMap.getPane('routePane').style.zIndex=450;
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
 maxZoom:19,
 attribution:'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community'
}).addTo(geoMap);
L.control.scale({metric:true,imperial:false,position:'bottomleft'}).addTo(geoMap);
const localContextLayer=L.layerGroup().addTo(geoMap),issueLayer=L.layerGroup().addTo(geoMap),routeLayer=L.layerGroup().addTo(geoMap),routeEndpointLayer=L.layerGroup().addTo(geoMap),reportLayer=L.layerGroup().addTo(geoMap);
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
function updateLocalContextUI(){
 const button=$('#local-context-toggle'),status=$('#local-data-status');
 if(!button||!status)return;
 button.disabled=!located||localContextPending;
 if(!located){button.textContent='Use location to load data';status.textContent='Nearby OpenStreetMap context loads after you allow location access.';return}
 if(localContextPending){button.textContent='Loading nearby data…';status.textContent='Looking up nearby places and accessibility details.';return}
 if(localContextError){button.disabled=false;button.textContent='Retry nearby data';status.textContent=`Nearby map data is temporarily unavailable: ${localContextError}`;return}
 if(!localContextLoaded){button.textContent='Load nearby OSM data';status.textContent='Load mapped places within 2 km and accessibility details within 1 km of your location.';return}
 const placeCount=localContext.filter(feature=>feature.kind!=='access').length;
 const accessCount=localContext.filter(feature=>feature.kind==='access').length;
 const taggedPlaceCount=localContext.filter(feature=>feature.accessTagged).length;
 const timestamp=localContextTimestamp?new Date(localContextTimestamp).toLocaleString() : '';
 button.disabled=false;
 button.textContent=localContextVisible?'Hide nearby OSM data':'Show nearby OSM data';
 status.textContent=localContext.length
  ? `Showing ${placeCount} mapped places within 2 km, ${accessCount} mapped crossings/steps/kerbs within 1 km, and ${taggedPlaceCount} places with wheelchair tags${timestamp?` · OSM snapshot ${timestamp}`:''}. Coverage is incomplete; check conditions on site.`
  : 'No matching features were mapped within 2 km for places or 1 km for access details. Missing map data does not mean the area is accessible.';
}
function localFeatureIcon(feature){
 if(feature.kind==='access')return '⚠';
 if(feature.accessTagged)return 'W';
 if(feature.label==='Hospital'||feature.label==='Clinic'||feature.label==='Doctor')return '+';
 if(feature.kind==='transit')return 'B';
 if(feature.label==='Pharmacy')return 'Rx';
 return '•';
}
function drawLocalContext(){
 localContextLayer.clearLayers();
 if(!localContextVisible)return;
 localContext.forEach(feature=>{
  const sourceUrl=`https://www.openstreetmap.org/${encodeURIComponent(feature.osmType)}/${encodeURIComponent(feature.osmId)}`;
  const notes=feature.notes.map(note=>`<li>${esc(note)}</li>`).join('');
  const popup=`<div class="osm-popup"><strong>${esc(feature.name)}</strong><span>${esc(feature.label)}</span><ul>${notes}</ul><small>Mapped context only; this is not a user-verified issue.</small><a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">View OpenStreetMap feature</a></div>`;
  const marker=L.marker([feature.lat,feature.lon],{
   icon:L.divIcon({className:`osm-marker osm-${feature.kind}${feature.accessTagged?' osm-tagged':''}`,html:`<span aria-hidden="true">${localFeatureIcon(feature)}</span>`,iconSize:[30,30],iconAnchor:[15,15]}),
   title:`${feature.label}: ${feature.name}`,
   alt:`${feature.label}: ${feature.name}`,
  }).addTo(localContextLayer).bindPopup(popup,{maxWidth:280});
  marker.bindTooltip(`${feature.label}: ${feature.name}`,{direction:'top',offset:[0,-10]});
  marker.on('click',event=>{
   if(event.originalEvent)L.DomEvent.stopPropagation(event.originalEvent);
   if(reportPickActive){marker.closePopup();setReportLocation(event.latlng);return}
   if(mapPickTarget){marker.closePopup();setMapRoutePoint(mapPickTarget,event.latlng)}
  });
 });
}
async function loadNearbyLocalContext(center,{force=false}={}){
 if(!located)return;
 const key=`${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
 if(!force&&key===localContextCenterKey&&(localContextLoaded||localContextPending))return;
 const request=++localContextRequest;
 localContextCenterKey=key;localContextPending=true;localContextError='';localContextLoaded=false;localContext=[];localContextVisible=true;localContextTimestamp='';
 rebuildRouteOptions(true);
 localContextLayer.addTo(geoMap);drawLocalContext();updateLocalContextUI();
 try{
  const result=await fetchLocalContext(center);
  if(request!==localContextRequest)return;
  localContext=result.features;localContextTimestamp=result.timestamp;localContextPending=false;localContextLoaded=true;localContextError='';
  rebuildRouteOptions(true);drawLocalContext();updateLocalContextUI();
  if(!$('#p-rt').hidden)routeUI();
 }catch(error){
  if(request!==localContextRequest)return;
  localContextPending=false;localContextLoaded=false;localContextError=error.message||'Nearby map data is temporarily unavailable.';
  drawLocalContext();updateLocalContextUI();
 }
}
function toggleLocalContext(){
 if(!located){toast('Allow location access first to load real local map data.');return}
 if(!localContextLoaded){loadNearbyLocalContext(origin,{force:Boolean(localContextError)});return}
 localContextVisible=!localContextVisible;
 if(localContextVisible)localContextLayer.addTo(geoMap);else localContextLayer.remove();
 updateLocalContextUI();
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rebuildRouteOptions(keep=true){
 const oldA=$('#ra').value,oldB=$('#rb').value;
 const mappedPlaces=localContext.filter(feature=>feature.kind!=='access').slice(0,30);
 const stops=[{id:'current',name:located?'My location':'Bengaluru demo center',lat:origin.lat,lon:origin.lng,kind:located?'Your location':'Demo map center'},...Object.values(routePins).filter(Boolean),...mappedPlaces];
 const options=stops.map(s=>{const label=s.id==='current'?s.name:s.id.startsWith('osm-')?`${s.name} · ${s.label}`:s.name;return`<option value="${esc(s.id)}">${esc(label)}</option>`}).join('');
 ['ra','rb'].forEach(id=>{$('#'+id).innerHTML=options});
 $('#ra').value=keep&&stops.some(s=>s.id===oldA)?oldA:(routePins.from?.id||'current');
async function reserveNominatimSlot(){const wait=Math.max(0,1000-(Date.now()-lastNominatimSearchAt));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));lastNominatimSearchAt=Date.now()}
}
function renderPlaceSearch(){
 const box=$('#route-search-results');if(!box)return;
 if(placeSearchPending){box.innerHTML='<div class="route-loading"><span class="spinner"></span><strong>Searching OpenStreetMap…</strong><small>Search results are public map matches.</small></div>';return}
 if(placeSearchError){box.innerHTML=`<div class="route-error"><span>${esc(placeSearchError)}</span></div>`;return}
 if(!placeResults.length){box.innerHTML='';return}
 box.innerHTML=placeResults.map((place,index)=>`<div class="place-result"><div><strong>${esc(place.name)}</strong><small>${esc(place.address)}<br>${esc(coordText(L.latLng(place.lat,place.lon)))}</small></div><div class="place-result-actions"><button class="sm" data-place-index="${index}" data-place-slot="from" type="button">Use as start</button><button class="sm" data-place-index="${index}" data-place-slot="to" type="button">Use as destination</button></div></div>`).join('');
 box.querySelectorAll('[data-place-index]').forEach(button=>button.onclick=()=>assignRoutePlace(button.dataset.placeSlot,placeResults[Number(button.dataset.placeIndex)]));
}
async function searchRoutePlace(){
 const query=$('#route-query').value.trim();if(!query){toast('Enter an address or place to search.');$('#route-query').focus();return}
 if(placeSearchPending)return;
 if(nominatimBusy){toast('Wait for the current OpenStreetMap search to finish.');return}
 nominatimBusy=true;placeSearchPending=true;placeSearchError='';placeResults=[];renderPlaceSearch();
 try{
  await reserveNominatimSlot();
  const params=new URLSearchParams({q:query,format:'jsonv2',limit:'5','accept-language':'en'});
  const bounds=geoMap.getBounds();if(bounds.isValid())params.set('viewbox',[bounds.getWest(),bounds.getNorth(),bounds.getEast(),bounds.getSouth()].join(','));
  const response=await fetch(`https://nominatim.openstreetmap.org/search?${params}`,{headers:{Accept:'application/json'},referrerPolicy:'unsafe-url',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`OpenStreetMap search returned ${response.status}.`);
  const data=await response.json();
  placeResults=(data||[]).map((item,index)=>({id:`place-${item.osm_type}-${item.osm_id}-${index}`,name:item.name||item.display_name?.split(',')[0]||'Map result',address:item.display_name||'',lat:Number(item.lat),lon:Number(item.lon),kind:'Place'})).filter(item=>Number.isFinite(item.lat)&&Number.isFinite(item.lon));
  if(!placeResults.length)placeSearchError='No matching place was found. Try a fuller address or choose a point on the map.';
 }catch(error){placeSearchError=error.message||'The OpenStreetMap place search is temporarily unavailable.'}
 finally{placeSearchPending=false;nominatimBusy=false;renderPlaceSearch()}
}
function assignRoutePlace(slot,place){
 if(!place)return;
 const id=`route-${slot}`;routePins[slot]={id,name:place.name,kind:'Place',lat:place.lat,lon:place.lon,source:place.address||'OpenStreetMap'};
 rebuildRouteOptions(true);$('#r'+(slot==='from'?'a':'b')).value=id;fitNextRoute=true;
 const ll=L.latLng(place.lat,place.lon);showCoordinates(ll,slot==='from'?'Route start':'Route destination');geoMap.panTo(ll);tab('rt');
}
function beginMapRoutePick(slot){tab('rt');mapPickTarget=slot;document.querySelectorAll('.route-pick-actions .active').forEach(button=>button.classList.remove('active'));$('#map').classList.add('route-picking');$('#pick-route-'+(slot==='from'?'start':'end')).classList.add('active');toast(`Tap the map to set the route ${slot==='from'?'start':'destination'}.`)}
function setMapRoutePoint(slot,ll){
 const id=`route-${slot}`;routePins[slot]={id,name:`Map point · ${coordText(ll)}`,kind:'Map point',lat:ll.lat,lon:ll.lng,source:'Map pin'};
 rebuildRouteOptions(true);$('#r'+(slot==='from'?'a':'b')).value=id;fitNextRoute=true;showCoordinates(ll,slot==='from'?'Route start':'Route destination');
 mapPickTarget=null;$('#map').classList.remove('route-picking');document.querySelectorAll('.route-pick-actions .active').forEach(button=>button.classList.remove('active'));tab('rt');toast(`Route ${slot==='from'?'start':'destination'} set at ${coordText(ll)}.`);
}
function distanceMeters(a,b){const dy=(a.lat-b.lat)*111320,dx=(a.lng-b.lng)*111320*Math.cos(a.lat*Math.PI/180);return Math.hypot(dx,dy)}
function pinReport(ll){if(reportMarker)reportMarker.remove();reportMarker=L.circleMarker(ll,{radius:10,color:'#fff',weight:3,fillColor:'#d6246e',fillOpacity:1}).addTo(reportLayer)}
function setReportLocation(ll){const point=L.latLng(ll),p=toLocal(point);rep.x=p.x;rep.y=p.y;reportPickActive=false;map.classList.remove('report-picking');$('#pick-report-location').classList.remove('active');$('#pick-report-location').setAttribute('aria-pressed','false');showCoordinates(point,'Selected report location');pinReport(point);tab('rep');repUI();toast(`Report location set at ${coordText(point)}.`)}
function beginReportMapPick(){mapPickTarget=null;reportPickActive=true;map.classList.remove('route-picking');document.querySelectorAll('.route-pick-actions .active').forEach(button=>button.classList.remove('active'));tab('rep');map.classList.add('report-picking');$('#pick-report-location').classList.add('active');$('#pick-report-location').setAttribute('aria-pressed','true');toast('Tap any point on the map to set the report location.')}
function ring(x,y){const c=L.circleMarker(toLatLng(x,y),{radius:15,className:'rg',fillOpacity:.35}).addTo(reportLayer);setTimeout(()=>c.remove(),1100)}
function requestMyLocation(){
 if(!navigator.geolocation){$('#locstatus').textContent='Location is unavailable in this browser · showing the demo area';return}
 $('#locstatus').textContent='Requesting your location…';
 navigator.geolocation.getCurrentPosition(position=>{
  origin={lat:position.coords.latitude,lng:position.coords.longitude};located=true;restoreCompletedIssues();updateLocalContextUI();
  geoMap.fitBounds(L.latLngBounds(toLatLng(0,0),toLatLng(800,520)),{padding:[20,20],maxZoom:15});
  if(userMarker)userMarker.setLatLng([origin.lat,origin.lng]);
  else userMarker=L.marker([origin.lat,origin.lng],{interactive:false,icon:L.divIcon({className:'user-location-icon',html:'<span class="user-location"></span>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(geoMap);
  loadNearbyLocalContext(origin);if(rep.x!=null){const reportLL=toLatLng(rep.x,rep.y);pinReport(reportLL);$('#report-coords').textContent=coordText(reportLL)}
  $('#locstatus').textContent='Satellite view centered on your location';showCoordinates(L.latLng(origin.lat,origin.lng),'You are here');render();
 },error=>{
  $('#locstatus').textContent=error.code===1?'Location denied · Bengaluru demo area · sample issues':'Location unavailable · Bengaluru demo area · sample issues';
  if(!located)showCoordinates(L.latLng(origin.lat,origin.lng),'Demo map center');
  toast(error.code===1?'Allow location access in your browser to center the satellite map on you.':'Could not read your location. The demo map is still available.');
 },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
geoMap.on('click',e=>{if(mapPickTarget){setMapRoutePoint(mapPickTarget,e.latlng);return}setReportLocation(e.latlng)});
$('#locate').onclick=requestMyLocation;
$('#local-context-toggle').onclick=toggleLocalContext;
updateLocalContextUI();
$('#pick-report-location').onclick=beginReportMapPick;
geoMap.fitBounds(L.latLngBounds(toLatLng(0,0),toLatLng(800,520)),{padding:[20,20],maxZoom:15});
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t.h);t.h=setTimeout(()=>t.classList.remove('on'),4500)}
function tab(k){if(reportPickActive&&k!=='rep'){reportPickActive=false;map.classList.remove('report-picking');$('#pick-report-location').classList.remove('active');$('#pick-report-location').setAttribute('aria-pressed','false')}['top','rep','det','rt','plan','hist'].forEach(x=>$('#p-'+x).hidden=x!=k);if(k=='rt')routeUI();else{routeLayer.clearLayers();routeEndpointLayer.clearLayers()}if(k==='hist')renderHistory();document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t==k))}
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
 if(d){const m=Math.round(Math.hypot(d.x-x,d.y-y)*2.5);d.n++;d.reports=d.n;d.mg++;merged++;if(ph&&!d.ph)d.ph=ph;ring(d.x,d.y);cur=d.id;toast(`Duplicate found: same ${T[t].toLowerCase()} ${m} m from #${d.id}. Merged, now ${d.n} reports on one issue.`);addNotification('Report merged',`Your report was merged with existing issue #${d.id}. Total reports: ${d.n}.`)}
 else{const n={id:issues.length+1,t,type:t,x,y,n:1,reports:1,age:0,mg:0,ph};issues.push(n);ring(x,y);cur=n.id;toast(`Issue #${n.id} added to the map and scored.`);addNotification('New issue reported',`Your issue #${n.id} has been added successfully.`)}
 renderNotifications();
 rep={};$('#ph').value='';repUI();render();tab('det')};
function render(){
 const p=P[ps],rows=live().map(i=>({i,s:sc(i)}));
 $('#s1').textContent=rows.length;$('#s2').textContent=rows.filter(r=>r.s.total>=75).length;$('#s2l').textContent='critical for '+p.s;$('#s3').textContent=merged;$('#vw').textContent=`Viewing as ${p.e} ${p.n}`;
 $('#note').textContent=`Ranked for ${p.n.toLowerCase()}. Switch the persona above and watch the order change.`;
 document.querySelectorAll('#pers button').forEach(b=>b.classList.toggle('on',b.dataset.p==ps));
 issues.forEach(i=>{
  const score=sc(i),color=i.fx?cssColor('--c4'):bandColor(band(score.total)[1]);
  const icon=L.divIcon({className:'pin-wrap',html:'<span class="map-pin '+(i.id==cur?'active ':'')+(i.fx?'fixed':'')+'" style="--pin-color:'+color+'"><span>'+(i.fx?'✓':score.total)+'</span></span>',iconSize:[32,32],iconAnchor:[16,30]});
  if(!i.marker){i.marker=L.marker(toLatLng(i.x,i.y),{icon,title:'Issue #'+i.id+', '+T[i.t]+', score '+score.total,riseOnHover:true}).addTo(issueLayer);i.marker.on('click',e=>{if(reportPickActive){if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);setReportLocation(e.latlng);return}if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);sel(i.id)})}
  else{i.marker.setLatLng(toLatLng(i.x,i.y));i.marker.setIcon(icon)}
  i.marker.bindTooltip('Issue #'+i.id+' · '+T[i.t]+' · '+(i.fx?'Fixed':'Score '+score.total),{direction:'top',offset:[0,-25]});
 });
 const O=$('#top');issues.forEach(i=>{if(!i.li){i.li=document.createElement('li');i.li.onclick=()=>sel(i.id);O.append(i.li)}i.li.hidden=Boolean(i.fx)});
 const f=new Map(issues.map(i=>[i,i.li.hidden?null:i.li.getBoundingClientRect().top]));
 rows.sort((a,b)=>b.s.total-a.s.total).forEach(({i,s},k)=>{i.li.hidden=k>9;i.li.classList.toggle('on',i.id==cur);
  i.li.innerHTML=`<span class="rk">${k+1}</span><div><strong>${T[i.t]}</strong> <em>#${i.id}</em><p>${why(i,s)}</p></div><span class="sc" style="background:${band(s.total)[1]}">${s.total}</span>`;O.append(i.li)});
 rows.slice(0,10).forEach(({i})=>{const o=f.get(i);if(o==null)return;const d=o-i.li.getBoundingClientRect().top;if(!d)return;
  i.li.style.transition='none';i.li.style.transform=`translateY(${d}px)`;requestAnimationFrame(()=>requestAnimationFrame(()=>{i.li.style.transition='transform .8s cubic-bezier(.2,.8,.2,1)';i.li.style.transform=''}))});
 detail();
 routeUI();
 planUI();
 renderHistory();
updateResolutionChart();
}
function renderHistory(){
 const list=$('#history-list');if(!list)return;
 const count=historyRecords.length;$('#history-count').textContent=count;$('#history-total').textContent=count;list.className='history-list';
 if(!count){list.innerHTML='<div class="history-empty">No completed tasks yet. Open an issue and mark it as fixed to add it here.</div>';return}
 const rows=[...historyRecords].sort((a,b)=>new Date(b.completedAt||0)-new Date(a.completedAt||0));
 list.innerHTML=rows.map((record,index)=>{const date=new Date(record.completedAt||0),dateText=Number.isNaN(date.getTime())?'Completed previously':date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});return`<button class="history-card" type="button" data-history-index="${index}"><span><strong>${esc(record.title||T[record.type]||'Completed task')} #${esc(record.issueId)}</strong><small>${esc(dateText)} · ${esc(coordText(L.latLng(record.lat,record.lon)))}</small>${record.afterPhoto?'<small>After photo attached</small>':''}</span><span class="history-status">Fixed</span></button>`}).join('');
 list.querySelectorAll('[data-history-index]').forEach(button=>button.onclick=()=>{
  const record=rows[Number(button.dataset.historyIndex)],issue=issues.find(i=>i.id===Number(record.issueId)&&i.t===record.type&&i.x===record.x&&i.y===record.y);
  if(issue&&issue.fx){sel(issue.id);return}
  const ll=L.latLng(record.lat,record.lon);geoMap.setView(ll,17);showCoordinates(ll,'Completed task location');toast('Showing the archived task location. Its issue is not part of this map session.');
 });
}
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
const routeStop=id=>id==='current'?{id:'current',name:located?'My location':'Bengaluru demo center',lat:origin.lat,lon:origin.lng}:routePins.from?.id===id?routePins.from:routePins.to?.id===id?routePins.to:localContext.find(feature=>feature.id===id);
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
function renderRouteEndpoints(from,to){
 routeEndpointLayer.clearLayers();
 if(!from||!to)return;
 const endpoint=(stop,letter)=>L.marker(L.latLng(stop.lat,stop.lon),{pane:'markerPane',icon:L.divIcon({className:'route-end-icon',html:`<span>${letter}</span>`,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(routeEndpointLayer).bindTooltip(`${stop.name} · ${coordText(L.latLng(stop.lat,stop.lon))}`,{direction:'top'});
 endpoint(from,'A');endpoint(to,'B');
}
function showRoute(route,from,to,fit){
 routeLayer.clearLayers();const latlngs=route.points.map(p=>L.latLng(p[0],p[1]));
 L.polyline(latlngs,{pane:'routePane',color:'#fff',weight:13,opacity:.92,lineCap:'round',lineJoin:'round',attribution:'Route data © OpenStreetMap contributors'}).addTo(routeLayer);
 L.polyline(latlngs,{pane:'routePane',color:cssColor('--ac'),weight:7,opacity:.97,lineCap:'round',lineJoin:'round'}).addTo(routeLayer);
 renderRouteEndpoints(from,to);
 if(fit&&latlngs.length>1)geoMap.fitBounds(L.latLngBounds(latlngs),{padding:[55,55],maxZoom:17});
 const hazards=barriersOnRoute(route.points),summary=route.summary||{},steps=route.maneuvers||[];
 const eta=Number(summary.time)||steps.reduce((n,s)=>n+(Number(s.time)||0),0),distance=Number(summary.length)||steps.reduce((n,s)=>n+(Number(s.length)||0),0);
 const hazardLine=hazards.length?`<div class="route-alert"><strong>${hazards.length} sample issue pin${hazards.length===1?'':'s'} near this route</strong><span>${hazards.slice(0,4).map(({i,d})=>`#${i.id} ${esc(T[i.t].toLowerCase())} · ${Math.round(d)} m`).join(' · ')}</span><small>These are prototype reports. Confirm conditions on the ground.</small></div>`:'<div class="route-clear">No sample issue pins were found close to this route.</div>';
 const directionList=steps.length?`<div class="route-steps"><h3>Walking directions</h3>${steps.map((s,i)=>`<div class="turn-step"><span>${i+1}</span><div><strong>${esc(s.instruction||'Continue on the route')}</strong><small>${Number(s.length)>0?fmtDistance(Number(s.length)):''}${Number(s.time)>0?' · '+fmtDuration(Number(s.time)):''}</small></div></div>`).join('')}</div>`:'<p class="mu">Turn-by-turn steps were not included for this route.</p>';
 $('#rres').innerHTML=`<div class="route-summary"><strong>${fmtDistance(distance)} · ${fmtDuration(eta)}</strong><span>Pedestrian route for ${esc(P[ps].n.toLowerCase())}</span></div>${hazardLine}${directionList}<small class="route-source">Street routing: OpenStreetMap data · Valhalla. Distance and time are estimates.</small>`;
}
function routeUI(){
 routeLayer.clearLayers();if($('#p-rt').hidden){routeEndpointLayer.clearLayers();return}
 const p=P[ps],from=routeStop($('#ra').value),to=routeStop($('#rb').value),costing=profile();
 $('#rtn').textContent=`Set a start and destination anywhere on the map or search for an address. Nearby mapped places can also be selected. Walking profile: ${costing==='blind'?'visually impaired':costing==='wheelchair'?'wheelchair':'standard pedestrian'}.`;
 if(!from||!to||$('#ra').value===$('#rb').value){
  routeEndpointLayer.clearLayers();
  const message=$('#ra').value===$('#rb').value?'Choose two different route points.':!from||!to?'Set a start and destination to get a walking route.':'Choose any two places using the map, nearby map data, or address search.';
  $('#rres').innerHTML=`<div class="route-empty"><strong>${message}</strong><span>Set endpoints on the map, choose a nearby mapped place, or search any address above.</span></div>`;
  return
 }
 renderRouteEndpoints(from,to);
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
function fixIt(i){
 i.fx=true;i.li.hidden=true;i.completedAt=new Date().toISOString();
 const ll=toLatLng(i.x,i.y),record={issueId:i.id,type:i.t,title:T[i.t],x:i.x,y:i.y,lat:ll.lat,lon:ll.lng,baseLat:origin.lat,baseLon:origin.lng,completedAt:i.completedAt,reports:i.n,afterPhoto:Boolean(i.af)};
 historyRecords=[record,...historyRecords.filter(r=>!(Number(r.issueId)===i.id&&r.type===i.t&&r.x===i.x&&r.y===i.y))].slice(0,200);
 try{localStorage.setItem(HISTORY_KEY,JSON.stringify(historyRecords))}catch{toast('Task marked fixed. Browser storage is unavailable, so history lasts only until this page closes.')}
 if(!$('#p-hist').hidden)renderHistory();toast(`#${i.id} marked fixed and added to History.`);addNotification('Issue marked fixed',`Issue #${i.id} (${T[i.t]}) was marked as fixed.`);renderNotifications();render()
}
function wire(i){const D=$('#p-det'),q=s=>D.querySelector(s);
 if(q('#st'))q('#st').onclick=()=>{i.n++;i.reports=i.n;i.cf=(i.cf||0)+1;toast(`Confirmed. #${i.id} now has ${i.n} reports, so its score went up.`);addNotification('Issue confirmed',`You confirmed that issue #${i.id} is still broken.`);renderNotifications();render()};
 if(q('#af'))q('#af').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>i.af=r.result;r.readAsDataURL(f)};
 if(q('#fx'))q('#fx').onclick=()=>fixIt(i);
 const g=q('input[type=range]');if(g)g.oninput=()=>q('.cmp').style.setProperty('--p',g.value)}
const tag=t=>{const k=guessIssueCategory(t);if(k){rep.t=k;repUI();toast(`Heard “${t}”. Tagged as ${T[k].toLowerCase()}. Now tap the map for the location.`)}else toast('Could not tell the issue type. Pick one below.')};
$('#vt').onkeydown=e=>{if(e.key=='Enter'&&e.target.value.trim())tag(e.target.value)};
$('#mic').onclick=()=>{const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return toast('Voice input is not supported in this browser. Type instead.');const r=new R();r.lang=$('#lg').value;r.onresult=e=>{const t=e.results[0][0].transcript;$('#vt').value=t;tag(t)};r.onerror=()=>toast('The microphone is not available here. Type instead.');r.start()};
function updateAiAvailability(configured,message=''){
 aiConfigured=configured;
 $('#ai-status').textContent=message||(configured?'AI ready':'Setup needed');
 $('#ai-status').classList.toggle('ready',configured);
 $('#ai-setup').hidden=configured;
 $('#ai-send').disabled=!configured||aiBusy;
 $('#ai-input').disabled=!configured||aiBusy;
 $('#ai-suggestions').querySelectorAll('button').forEach(button=>button.disabled=!configured||aiBusy);
}
async function checkAiAvailability(){
 try{const response=await fetch('/api/ai',{headers:{Accept:'application/json'}});const result=await response.json();updateAiAvailability(Boolean(result.configured))}
 catch{updateAiAvailability(false,'Start the app server')}
}
function renderAiMessage(role,content){
 const bubble=document.createElement('div');bubble.className=`ai-message ${role}`;bubble.textContent=content;
 $('#ai-thread').append(bubble);$('#ai-thread').scrollTop=$('#ai-thread').scrollHeight;return bubble;
}
function aiBoardContext(){
 const ranked=live().map(issue=>{const score=sc(issue);return{
  id:issue.id,category:T[issue.t],score:score.total,priority:band(score.total)[0],
  accessibilityImpact:Math.round(score.impact),reports:issue.n,daysOpen:issue.age,
  mergedReports:issue.mg||0
 }}).sort((a,b)=>b.score-a.score);
 return{
  selectedPersona:P[ps].n,
  summary:{openIssues:ranked.length,completedIssues:issues.length-ranked.length,highPriorityIssues:ranked.filter(issue=>issue.score>=75).length},
  issues:ranked.slice(0,15)
 };
}
async function sendAiMessage(value){
 const question=String(value||'').trim();if(!question||aiBusy)return;
 if(!aiConfigured){toast('Add an OpenRouter API key to the local .env file to enable AI.');return}
 $('#ai-input').value='';aiMessages.push({role:'user',content:question});
 renderAiMessage('user',question);aiBusy=true;updateAiAvailability(true,'Thinking…');
 const pending=renderAiMessage('assistant','Thinking…');pending.classList.add('pending');
 try{
  const response=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({messages:aiMessages.slice(-8),context:aiBoardContext()})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'The AI request could not be completed.');
  pending.textContent=result.answer;pending.classList.remove('pending');
  aiMessages.push({role:'assistant',content:result.answer});
 }catch(error){
  aiMessages.pop();
  pending.textContent=error.message||'Could not connect to the AI service. Try again.';pending.classList.remove('pending','assistant');pending.classList.add('error');
  if(/not configured|API key/i.test(error.message||''))updateAiAvailability(false);
 }finally{aiBusy=false;updateAiAvailability(aiConfigured);$('#ai-input').focus()}
}
$('#ai-form').onsubmit=event=>{event.preventDefault();sendAiMessage($('#ai-input').value)};
$('#ai-input').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('#ai-form').requestSubmit()}};
$('#ai-suggestions').querySelectorAll('[data-ai-prompt]').forEach(button=>button.onclick=()=>sendAiMessage(button.dataset.aiPrompt));
function showAiPanel(open){
 $('#ai-panel').hidden=!open;$('#ai-launcher').setAttribute('aria-expanded',String(open));
 if(open)$('#ai-close').focus();else $('#ai-launcher').focus();
}
$('#ai-launcher').onclick=()=>showAiPanel($('#ai-panel').hidden);
$('#ai-close').onclick=()=>showAiPanel(false);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#ai-panel').hidden)showAiPanel(false)});
checkAiAvailability();
rebuildRouteOptions(false);
['ra','rb'].forEach(id=>$('#'+id).onchange=()=>{fitNextRoute=true;const stop=routeStop($('#'+id).value);if(stop)showCoordinates(L.latLng(stop.lat,stop.lon),id==='ra'?'Route start':'Route destination');routeUI()});
$('#pick-route-start').onclick=()=>beginMapRoutePick('from');
$('#pick-route-end').onclick=()=>beginMapRoutePick('to');
$('#route-search').onclick=searchRoutePlace;
$('#route-query').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchRoutePlace()}};
$('#bud').oninput=planUI;
repUI();render();showCoordinates(L.latLng(origin.lat,origin.lng),'Bengaluru demo center');requestMyLocation();

function renderNotifications(){
 const count=$('#notification-count'),list=$('#notification-list');if(!count||!list)return;
 const notifications=getNotifications(),unread=notifications.filter(n=>!n.read).length;
 count.textContent=unread;count.hidden=unread===0;list.replaceChildren();
 if(!notifications.length){list.textContent='No notifications yet.';return}
 notifications.forEach(n=>{
  const item=document.createElement('button');item.type='button';item.className='notification-item'+(n.read?'':' unread');
  const title=document.createElement('strong');title.textContent=n.title;
  const message=document.createElement('span');message.textContent=n.message;
  const time=document.createElement('small');time.textContent=new Date(n.time).toLocaleString();
  item.append(title,message,time);item.onclick=()=>{markAsRead(n.id);renderNotifications()};list.append(item)
 });
}
const notificationToggle=$('#notification-toggle'),notificationPanel=$('#notification-panel');
if(notificationToggle&&notificationPanel)notificationToggle.onclick=()=>{notificationPanel.hidden=!notificationPanel.hidden;notificationToggle.setAttribute('aria-expanded',String(!notificationPanel.hidden))};
const clearButton=$('#clear-notifications');if(clearButton)clearButton.onclick=()=>{clearNotifications();renderNotifications()};
renderNotifications();
