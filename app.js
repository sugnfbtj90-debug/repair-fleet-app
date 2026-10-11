import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, setDoc, doc, getDocsFromServer } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig),db=getFirestore(app);
const $=id=>document.getElementById(id);
let allRequests=[];

function show(id){$(id).classList.remove("hidden")}
function hide(id){$(id).classList.add("hidden")}
function dateText(ts){if(!ts)return "";const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleString("ru-RU")}

function renderRequests(){
 const filter=$("status-filter").value,root=$("requests");
 const rows=allRequests.filter(r=>r.status!=="Выполнена"&&(!filter||r.status===filter)).sort((a,b)=>{
  const da=a.createdAt?.toDate?a.createdAt.toDate():new Date(a.createdAt||0);
  const db=b.createdAt?.toDate?b.createdAt.toDate():new Date(b.createdAt||0);
  return db-da;
 });
 $("active-count").textContent=rows.length;
 root.innerHTML="";
 if(!rows.length){root.innerHTML='<div class="card muted">Активных заявок нет.</div>';return}
 rows.forEach(r=>{
  const n=$("request-template").content.cloneNode(true);
  n.querySelector(".vehicle-tag").textContent=r.vehicle||"—";
  n.querySelector(".type-tag").textContent=r.type||"";
  n.querySelector(".repair-type-tag").textContent=r.repairType||"";
  n.querySelector(".fleet-tag").textContent=r.fleet||"";
  const badge=n.querySelector(".status-badge");
  badge.textContent=r.status||"Создана";
  badge.classList.add(r.status==="Создана"?"status-created":r.status==="В работе"?"status-working":"status-parts");
  n.querySelector(".comment").textContent=r.comment||"Без комментария";
  n.querySelector(".meta").textContent="Создана: "+dateText(r.createdAt);
  const s=n.querySelector(".status-select");s.value=r.status||"Создана";
  s.addEventListener("change",async e=>{
   e.target.disabled=true;
   try{
    const newStatus=e.target.value;
    const now=new Date();
    const updateData={status:newStatus,updatedAt:now};
    if(newStatus==="Выполнена") updateData.completedAt=now;
    await updateDoc(doc(db,"repairRequests",r.id),updateData);
    const idx=allRequests.findIndex(x=>x.id===r.id);
    if(idx!==-1) allRequests[idx]={...allRequests[idx],...updateData};
    renderRequests();
   }catch(err){alert("Ошибка: "+err.message);e.target.value=r.status}
   finally{e.target.disabled=false}
  });
  root.appendChild(n);
 });
}

async function loadRequests(){
 const button=$("show-active-btn");
 try{
  button.disabled=true;button.textContent="Загрузка…";
  $("requests").innerHTML='<div class="card muted">Загрузка активных заявок…</div>';
  const snap=await getDocsFromServer(collection(db,"repairRequests"));
  allRequests=snap.docs.map(d=>({id:d.id,...d.data()}));
  renderRequests();
  if(!$("tab-stats").classList.contains("hidden")) renderDailyChart();
 }catch(err){
  console.error(err);
  $("requests").innerHTML='<div class="card error"><b>Не удалось загрузить заявки.</b><br>'+((err.code||"Ошибка")+" — "+err.message)+'</div>';
 }finally{
  button.disabled=false;button.textContent="Показать активные заявки";
 }
}

$("show-active-btn").addEventListener("click",loadRequests);
$("status-filter").addEventListener("change",renderRequests);
$("type").addEventListener("change",()=>{
  const wrap=$("repair-type-wrap");
  if($("type").value==="Ремонт") show("repair-type-wrap"); else hide("repair-type-wrap");
});
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
 document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
 document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));
 show("tab-"+b.dataset.tab);
 if(b.dataset.tab==="stats") loadStatsData();
}));

$("request-form").addEventListener("submit",async e=>{
 e.preventDefault();hide("create-message");
 try{
  const vehicle=$("vehicle").value.trim().toUpperCase();
  const type=$("type").value;
  const repairType=type==="Ремонт"?$("repair-type").value:"";
  const fleet=$("fleet").value;
  const comment=$("comment").value.trim();
  const createdAt=new Date();
  const ref=await addDoc(collection(db,"repairRequests"),{vehicle,type,repairType,fleet,comment,status:"Создана",createdAt,updatedAt:createdAt});
  allRequests=[{id:ref.id,vehicle,type,repairType,fleet,comment,status:"Создана",createdAt,updatedAt:createdAt},...allRequests.filter(x=>x.id!==ref.id)];
  $("vehicle").value="";$("comment").value="";$("fleet").value="";$("type").value="Диагностика";hide("repair-type-wrap");
  $("create-message").textContent="Заявка создана. Статус: Создана.";show("create-message");
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab==="active"));
  document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));
  show("tab-active");renderRequests();
 }catch(err){$("create-message").textContent="Заявка не создана: "+(err.code||"ошибка")+" — "+err.message;show("create-message")}
});

function asDate(value){return value?.toDate?value.toDate():value?new Date(value):null}
function dateKey(date){return date?[
 date.getFullYear(),
 String(date.getMonth()+1).padStart(2,"0"),
 String(date.getDate()).padStart(2,"0")
].join("-"):""}
function dateLabel(key){const [y,m,d]=key.split("-");return d+"."+m}
function statsObj(rows,key){const o={};rows.forEach(r=>{const v=key(r);if(v)o[v]=(o[v]||0)+1});return o}
function filteredStatsRows(){
 const from=$("date-from").value,to=$("date-to").value;
 return allRequests.filter(r=>{
  const d=asDate(r.createdAt),key=dateKey(d);
  return d&&(!from||key>=from)&&(!to||key<=to);
 });
}
function renderDailyChart(){
 const root=$("daily-chart");
 const defaultFleets=["Автоколонна №1","Автоколонна №2","Участок механизации"];
 const fleetNames=[...defaultFleets];
 allRequests.forEach(r=>{
  const name=(r.fleet||"Не указана").trim();
  if(name&&!fleetNames.includes(name)) fleetNames.push(name);
 });
 const emptyData=()=>({created:{},completed:{}});
 const byFleet={};
 const overall=emptyData();
 const allDateKeys=new Set();
 fleetNames.forEach(name=>byFleet[name]=emptyData());
 allRequests.forEach(r=>{
  const fleet=(r.fleet||"Не указана").trim()||"Не указана";
  if(!byFleet[fleet]) byFleet[fleet]=emptyData();
  const createdDate=asDate(r.createdAt);
  const completedDate=r.status==="Выполнена"?asDate(r.completedAt||r.updatedAt||r.createdAt):null;
  const ck=dateKey(createdDate),fk=dateKey(completedDate);
  if(ck){
   allDateKeys.add(ck);
   overall.created[ck]=(overall.created[ck]||0)+1;
   byFleet[fleet].created[ck]=(byFleet[fleet].created[ck]||0)+1;
  }
  if(fk){
   allDateKeys.add(fk);
   overall.completed[fk]=(overall.completed[fk]||0)+1;
   byFleet[fleet].completed[fk]=(byFleet[fleet].completed[fk]||0)+1;
  }
 });
 const keys=[...allDateKeys].sort();
 if(!keys.length){root.innerHTML='<div class="chart-note">Пока нет данных для построения графиков.</div>';return}
 const escapeText=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const renderChart=(data,title,isOverall=false)=>{
  const created=data.created,completed=data.completed;
  const max=Math.max(1,...keys.map(k=>Math.max(created[k]||0,completed[k]||0)));
  const width=Math.max(680,keys.length*52),height=255,left=38,right=18,top=20,bottom=45,plotH=height-top-bottom,baseY=top+plotH;
  const groupW=Math.min(38,Math.max(26,(width-left-right)/keys.length-10)),barW=Math.max(8,(groupW-5)/2),gap=5;
  const yGrid=[0,Math.ceil(max/2),max].filter((v,i,a)=>a.indexOf(v)===i);
  const grid=yGrid.map(v=>{
   const y=baseY-(v/max)*plotH;
   return '<line class="chart-axis" x1="'+left+'" y1="'+y+'" x2="'+(width-right)+'" y2="'+y+'"></line><text class="chart-label" x="'+(left-9)+'" y="'+(y+4)+'" text-anchor="end">'+v+'</text>';
  }).join("");
  const bars=keys.map((k,i)=>{
   const x=left+(i+0.5)*((width-left-right)/keys.length)-groupW/2;
   const c=created[k]||0,f=completed[k]||0;
   const ch=c/max*plotH,fh=f/max*plotH,label=dateLabel(k);
   return '<rect class="chart-bar-created" x="'+x.toFixed(1)+'" y="'+(baseY-ch).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(0,ch).toFixed(1)+'" rx="3"><title>'+label+': создано '+c+'</title></rect>'+
          '<rect class="chart-bar-completed" x="'+(x+barW+gap).toFixed(1)+'" y="'+(baseY-fh).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(0,fh).toFixed(1)+'" rx="3"><title>'+label+': выполнено '+f+'</title></rect>'+
          '<text class="chart-label" x="'+(x+groupW/2).toFixed(1)+'" y="'+(baseY+19)+'" text-anchor="middle">'+label+'</text>'+
          (c?'<text class="chart-value" x="'+(x+barW/2).toFixed(1)+'" y="'+(baseY-ch-5).toFixed(1)+'" text-anchor="middle">'+c+'</text>':'')+
          (f?'<text class="chart-value" x="'+(x+barW+gap+barW/2).toFixed(1)+'" y="'+(baseY-fh-5).toFixed(1)+'" text-anchor="middle">'+f+'</text>':'');
  }).join("");
  const totalCreated=Object.values(created).reduce((sum,n)=>sum+n,0);
  const totalCompleted=Object.values(completed).reduce((sum,n)=>sum+n,0);
  return '<div class="fleet-chart-block'+(isOverall?' overall-chart':'')+'"><div class="fleet-chart-header"><h3>'+escapeText(title)+'</h3><span class="fleet-chart-totals"><span class="total-created">Создано: <b>'+totalCreated+'</b></span><span class="total-completed">Выполнено: <b>'+totalCompleted+'</b></span></span></div><svg viewBox="0 0 '+width+' '+height+'" width="'+width+'" height="'+height+'" role="img" aria-label="'+escapeText(title)+': количество созданных и выполненных заявок по дням">'+grid+'<line class="chart-axis" x1="'+left+'" y1="'+baseY+'" x2="'+(width-right)+'" y2="'+baseY+'"></line>'+bars+'</svg></div>';
 };
 const charts=fleetNames.map(fleet=>renderChart(byFleet[fleet]||emptyData(),fleet)).join("");
 root.innerHTML='<div class="chart-note">Общая динамика — на первом графике. Ниже представлены те же показатели отдельно по подразделениям.</div>'+renderChart(overall,"Общий график",true)+charts;
}
async function loadStatsData(){
 const root=$("daily-chart");
 root.innerHTML='<div class="chart-note">Обновление графика…</div>';
 try{
  const snap=await getDocsFromServer(collection(db,"repairRequests"));
  allRequests=snap.docs.map(d=>({id:d.id,...d.data()}));
  renderDailyChart();
  renderStatsTables();
 }catch(err){
  console.error(err);
  root.innerHTML='<div class="chart-note error"><b>Не удалось загрузить данные графика.</b><br>'+((err.code||"Ошибка")+" — "+err.message)+'</div>';
 }
}
function dateInsideRange(value,from,to){
 const d=asDate(value),key=dateKey(d);
 return !!d&&(!from||key>=from)&&(!to||key<=to);
}
function pieSvg(segments,total){
 const cx=86,cy=86,r=60,circ=2*Math.PI*r;
 let offset=0;
 const slices=segments.filter(s=>s.value>0).map(s=>{
  const length=total?circ*s.value/total:0;
  const node='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+s.color+'" stroke-width="25" stroke-linecap="butt" stroke-dasharray="'+length.toFixed(3)+' '+(circ-length).toFixed(3)+'" stroke-dashoffset="'+(-offset).toFixed(3)+'" transform="rotate(-90 '+cx+' '+cy+')" />';
  offset+=length;
  return node;
 }).join("");
 const empty=total===0?'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="#eeeeec" stroke-width="25"/>':slices;
 return '<svg class="pie-svg" viewBox="0 0 172 172" role="img" aria-label="Всего: '+total+' заявок">'+empty+'<text class="pie-total" x="'+cx+'" y="82" text-anchor="middle">'+total+'</text><text class="pie-caption" x="'+cx+'" y="101" text-anchor="middle">заявок</text></svg>';
}
function pieCard(title,rows){
 const palette=["#ee3f32","#ffcc00","#313131","#16865a","#8d73b8","#62a5bc"];
 const fleets=["Автоколонна №1","Автоколонна №2","Участок механизации"];
 const names=[...fleets];
 rows.forEach(r=>{
  const name=(r.fleet||"Не указана").trim()||"Не указана";
  if(!names.includes(name)) names.push(name);
 });
 const segments=names.map((name,i)=>({
  name,value:rows.filter(r=>((r.fleet||"Не указана").trim()||"Не указана")===name).length,color:palette[i%palette.length]
 }));
 const total=segments.reduce((sum,s)=>sum+s.value,0);
 const legend=segments.map(s=>{
  const pct=total?Math.round(s.value/total*100):0;
  return '<li class="pie-legend-row"><span class="pie-dot" style="background:'+s.color+'"></span><span class="pie-legend-name">'+s.name+'</span><b>'+s.value+'</b><span class="pie-percent">'+pct+'%</span></li>';
 }).join("");
 return '<div class="card pie-card"><div class="pie-title-row"><div><h3>'+title+'</h3><p class="hint">Распределение по автоколоннам</p></div><span class="pie-period-total">'+total+' заявок</span></div><div class="pie-body">'+pieSvg(segments,total)+'<ul class="pie-legend">'+legend+'</ul></div></div>';
}
function renderStatsTables(){
 const from=$("date-from").value,to=$("date-to").value;
 const rows=allRequests.filter(r=>dateInsideRange(r.createdAt,from,to));
 const createdByPeriod=rows;
 const completedByPeriod=allRequests.filter(r=>r.status==="Выполнена"&&dateInsideRange(r.completedAt||r.updatedAt||r.createdAt,from,to));
 const day=statsObj(rows,r=>dateLabel(dateKey(asDate(r.createdAt)))),type=statsObj(rows,r=>r.type),status=statsObj(rows,r=>r.status);
 const completed=rows.filter(r=>r.status==="Выполнена").length,active=rows.length-completed;
 const table=(title,o)=>'<div class="card"><h3>'+title+'</h3><table class="stat-table"><tbody>'+Object.keys(o).sort().map(k=>'<tr><td>'+k+'</td><td><b>'+o[k]+'</b></td></tr>').join("")+'</tbody></table></div>';
 const pies='<div class="pie-grid">'+pieCard("Созданные заявки",createdByPeriod)+pieCard("Выполненные заявки",completedByPeriod)+'</div>';
 $("stats-content").innerHTML=pies+'<div class="card"><h3>Сводка</h3><div class="summary-cards"><div><b>'+rows.length+'</b><span>создано за период</span></div><div><b>'+active+'</b><span>активных из заявок периода</span></div><div><b>'+completedByPeriod.length+'</b><span>выполнено за период</span></div></div></div>'+table("По дням создания",day)+table("По видам",type)+table("По текущим статусам",status);
}
$("load-stats").addEventListener("click",renderStatsTables);

function buildDemoRequests(){
 const createdCounts=[8,5,4,4,3,3,3];
 const completedCounts=[3,4,5,5,5,4,4];
 const vehicles=[
  "А123ВС77","М456ОР97","К789ТУ50","В234КХ99","Е567МН77",
  "Н890РС50","О135ТА97","Р246УВ77","С357ЕК50","Т468АН99",
  "У579МР77","Х680ВС50","А791ОР97","В802ТУ77","Е913КХ50",
  "К124МН99","М235РС77","Н346ТА50","О457УВ97","Р568ЕК77",
  "С679АН50","Т780МР99","У891ВС77","Х902ОР50","А013ТУ97",
  "В124КХ77","Е235МН50","К346РС99","М457ТА77","Н568УВ50"
 ];
 const types=["Ремонт","Диагностика","Шиномонтаж","ТО"];
 const repairTypes=[
  "Ремонт тормозной системы","Ремонт рулевого управления","Ремонт ДВС",
  "Ремонт КПП","Ремонт подвески","Жестяно-сварочные работы","Прочие слесарные работы"
 ];
 const comments={
  "Ремонт":["Замена изношенных деталей, контроль после ремонта","Устранена неисправность, проведена проверка","Выполнен ремонт по результатам осмотра","Заменены расходные материалы и проверены узлы"],
  "Диагностика":["Проведена компьютерная диагностика","Проверены основные системы автомобиля","Неисправность выявлена и устранена, контрольная проверка выполнена"],
  "Шиномонтаж":["Проведена сезонная замена колёс","Выполнен шиномонтаж и балансировка","Проверено давление, колёса установлены"],
  "ТО":["Выполнено плановое техническое обслуживание","Заменены масло и фильтры","Проведён регламентный осмотр"]
 };
 const fleets=["Автоколонна №1","Автоколонна №2","Участок механизации"];
 const choose=arr=>arr[Math.floor(Math.random()*arr.length)];
 const makeDate=(day,hourStart,hourEnd)=>{
  const hour=hourStart+Math.floor(Math.random()*(hourEnd-hourStart+1));
  const minute=Math.floor(Math.random()*60);
  return new Date(2026,8,28+day,hour,minute,0,0);
 };
 const rows=[];
 let serial=1;
 createdCounts.forEach((count,day)=>{
  for(let j=0;j<count;j++){
   const type=choose(types);
   rows.push({
    id:"demo_utm_20260928_"+String(serial).padStart(3,"0"),
    serial,
    createdDay:day,
    vehicle:vehicles[serial-1],
    type,
    repairType:type==="Ремонт"?choose(repairTypes):"",
    fleet:choose(fleets),
    comment:choose(comments[type]),
    status:"Выполнена",
    createdAt:makeDate(day,7,11),
    completedAt:null,
    demo:true,
    demoBatch:"demo_week_20260928"
   });
   serial++;
  }
 });
 completedCounts.forEach((count,day)=>{
  const available=rows
   .filter(r=>r.completedAt===null&&r.createdDay<=day)
   .sort((a,b)=>a.createdDay-b.createdDay||a.serial-b.serial);
  if(available.length<count) throw new Error("Не удалось распределить даты выполнения демозаявок.");
  available.slice(0,count).forEach(r=>{
   r.completedAt=makeDate(day,14,18);
  });
 });
 return rows.map(r=>({...r,updatedAt:r.completedAt}));
}
$("seed-demo-btn").addEventListener("click",async()=>{
 const button=$("seed-demo-btn"),message=$("demo-seed-message");
 if(!window.confirm("Добавить в общую базу 30 демонстрационных выполненных заявок за 28 сентября — 4 октября 2026 года? При повторном запуске эти записи обновятся, а не продублируются.")) return;
 button.disabled=true;message.textContent="Добавляю 30 заявок…";
 try{
  const rows=buildDemoRequests();
  await Promise.all(rows.map(r=>setDoc(doc(db,"repairRequests",r.id),{
   vehicle:r.vehicle,type:r.type,repairType:r.repairType,fleet:r.fleet,
   comment:r.comment,status:r.status,createdAt:r.createdAt,
   updatedAt:r.updatedAt,completedAt:r.completedAt,demo:r.demo,demoBatch:r.demoBatch
  })));
  await loadStatsData();
  message.textContent="Готово: 30 демонстрационных заявок добавлены в общую статистику.";
 }catch(err){
  console.error(err);
  message.textContent="Не удалось добавить демонстрационные заявки: "+(err.code||"ошибка")+" — "+err.message;
 }
 finally{button.disabled=false}
});

$("download-csv").addEventListener("click",()=>{
 const header="Госномер;Вид заявки;Вид ремонта;Автоколонна;Статус;Комментарий;Дата\n";
 const body=allRequests.map(r=>[r.vehicle,r.type,r.repairType||"",r.fleet||"",r.status,r.comment||"",dateText(r.createdAt)].map(v=>'="'+String(v).replaceAll('"','""')+'"').join(";")).join("\n");
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+header+body],{type:"text/csv;charset=utf-8"}));a.download="zayavki_remont.csv";a.click();
});
hide("loading");show("main-screen");