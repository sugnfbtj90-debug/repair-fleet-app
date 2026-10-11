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
 const created={},completed={};
 allRequests.forEach(r=>{
  const createdDate=asDate(r.createdAt);
  const completedDate=r.status==="Выполнена"?asDate(r.completedAt||r.updatedAt):null;
  const ck=dateKey(createdDate),fk=dateKey(completedDate);
  if(ck) created[ck]=(created[ck]||0)+1;
  if(fk) completed[fk]=(completed[fk]||0)+1;
 });
 const keys=[...new Set([...Object.keys(created),...Object.keys(completed)])].sort();
 if(!keys.length){root.innerHTML='<div class="chart-note">Пока нет данных для построения графика.</div>';return}
 const max=Math.max(1,...keys.map(k=>Math.max(created[k]||0,completed[k]||0)));
 const width=Math.max(680,keys.length*52),height=255,left=34,right=18,top=20,bottom=45,plotH=height-top-bottom,baseY=top+plotH;
 const groupW=Math.min(38,Math.max(26,(width-left-right)/keys.length-10)),barW=Math.max(8,(groupW-5)/2),gap=5;
 const yGrid=[0,Math.ceil(max/2),max].filter((v,i,a)=>a.indexOf(v)===i);
 const grid=yGrid.map(v=>{
  const y=baseY-(v/max)*plotH;
  return '<line class="chart-axis" x1="'+left+'" y1="'+y+'" x2="'+(width-right)+'" y2="'+y+'"></line><text class="chart-label" x="'+(left-8)+'" y="'+(y+4)+'" text-anchor="end">'+v+'</text>';
 }).join("");
 const bars=keys.map((k,i)=>{
  const x=left+(i+0.5)*((width-left-right)/keys.length)-groupW/2;
  const c=created[k]||0, f=completed[k]||0;
  const ch= c/max*plotH, fh=f/max*plotH;
  const label=dateLabel(k);
  return '<rect class="chart-bar-created" x="'+x.toFixed(1)+'" y="'+(baseY-ch).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(0,ch).toFixed(1)+'" rx="3"><title>'+label+': создано '+c+'</title></rect>'+
         '<rect class="chart-bar-completed" x="'+(x+barW+gap).toFixed(1)+'" y="'+(baseY-fh).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(0,fh).toFixed(1)+'" rx="3"><title>'+label+': выполнено '+f+'</title></rect>'+
         '<text class="chart-label" x="'+(x+groupW/2).toFixed(1)+'" y="'+(baseY+19)+'" text-anchor="middle">'+label+'</text>'+
         (c?'<text class="chart-value" x="'+(x+barW/2).toFixed(1)+'" y="'+(baseY-ch-5).toFixed(1)+'" text-anchor="middle">'+c+'</text>':'')+
         (f?'<text class="chart-value" x="'+(x+barW+gap+barW/2).toFixed(1)+'" y="'+(baseY-fh-5).toFixed(1)+'" text-anchor="middle">'+f+'</text>':'');
 }).join("");
 root.innerHTML='<div class="chart-note">Показаны все даты. При большом количестве дней график можно прокрутить вправо.</div><svg viewBox="0 0 '+width+' '+height+'" width="'+width+'" height="'+height+'" role="img" aria-label="Количество созданных и выполненных заявок по дням">'+grid+'<line class="chart-axis" x1="'+left+'" y1="'+baseY+'" x2="'+(width-right)+'" y2="'+baseY+'"></line>'+bars+'</svg>';
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
function renderStatsTables(){
 const rows=filteredStatsRows();
 const day=statsObj(rows,r=>dateLabel(dateKey(asDate(r.createdAt)))),type=statsObj(rows,r=>r.type),status=statsObj(rows,r=>r.status);
 const completed=rows.filter(r=>r.status==="Выполнена").length,active=rows.length-completed;
 const table=(title,o)=>'<div class="card"><h3>'+title+'</h3><table class="stat-table"><tbody>'+Object.keys(o).sort().map(k=>'<tr><td>'+k+'</td><td><b>'+o[k]+'</b></td></tr>').join("")+'</tbody></table></div>';
 $("stats-content").innerHTML='<div class="card"><h3>Сводка</h3><div class="summary-cards"><div><b>'+rows.length+'</b><span>всего заявок</span></div><div><b>'+active+'</b><span>активных</span></div><div><b>'+completed+'</b><span>выполнено</span></div></div></div>'+table("По дням",day)+table("По видам",type)+table("По статусам",status);
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