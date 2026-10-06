import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, doc, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig),db=getFirestore(app);
const $=id=>document.getElementById(id);
let allRequests=[],unsubscribe=null;

function show(id){$(id).classList.remove("hidden")}
function hide(id){$(id).classList.add("hidden")}
function dateText(ts){if(!ts)return "";const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleString("ru-RU")}

function renderRequests(){
 const filter=$("status-filter").value,root=$("requests");root.innerHTML="";
 const rows=allRequests.filter(r=>r.status!=="Выполнена"&&(!filter||r.status===filter)).sort((a,b)=>{
  const da=a.createdAt?.toDate?a.createdAt.toDate():new Date(a.createdAt||0);
  const db=b.createdAt?.toDate?b.createdAt.toDate():new Date(b.createdAt||0);
  return db-da;
 });
 $("active-count").textContent=rows.length;
 if(!rows.length){root.innerHTML='<div class="card muted">Активных заявок нет.</div>';return}
 rows.forEach(r=>{
  const n=$("request-template").content.cloneNode(true);
  n.querySelector(".vehicle-tag").textContent=r.vehicle;
  n.querySelector(".type-tag").textContent=r.type;
  n.querySelector(".status-badge").textContent=r.status;
  n.querySelector(".comment").textContent=r.comment||"Без комментария";
  n.querySelector(".meta").textContent="Создана: "+dateText(r.createdAt);
  const s=n.querySelector(".status-select");s.value=r.status;
  s.addEventListener("change",async e=>{
    e.target.disabled=true;
    try{await updateDoc(doc(db,"repairRequests",r.id),{status:e.target.value,updatedAt:new Date()})}
    catch(err){alert("Ошибка: "+err.message);e.target.value=r.status}
    finally{e.target.disabled=false}
  });
  root.appendChild(n);
 });
}

let pollTimer=null;
async function loadRequests(){
 try{
  const snap=await getDocs(collection(db,"repairRequests"));
  allRequests=snap.docs.map(d=>({id:d.id,...d.data()}));
  renderRequests();
  $("requests").dataset.loaded="1";
 }catch(err){
  console.error(err);
  $("requests").innerHTML='<div class="card error"><b>Не удалось загрузить заявки.</b><br>'+((err.code||"Ошибка") + " — " + err.message)+'</div>';
 }
}
function subscribe(){
 if(pollTimer)clearInterval(pollTimer);
 loadRequests();
 pollTimer=setInterval(loadRequests,3000);
}

$("status-filter").addEventListener("change",renderRequests);
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
 document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
 document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));
 show("tab-"+b.dataset.tab)
}));

$("request-form").addEventListener("submit",async e=>{
 e.preventDefault();hide("create-message");
 try{
  const vehicle=$("vehicle").value.trim().toUpperCase();
  const type=$("type").value;
  const comment=$("comment").value.trim();
  const createdAt=new Date();
  const ref=await addDoc(collection(db,"repairRequests"),{
   vehicle,type,comment,status:"Создана",createdAt,updatedAt:createdAt
  });
  const newRequest={id:ref.id,vehicle,type,comment,status:"Создана",createdAt,updatedAt:createdAt};
  allRequests=[newRequest,...allRequests.filter(x=>x.id!==ref.id)];
  $("status-filter").value="";
  renderRequests();
  $("vehicle").value="";$("comment").value="";
  $("create-message").textContent="Заявка создана. Статус: Создана.";
  show("create-message");
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab==="active"));
  document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));
  show("tab-active");
  setTimeout(loadRequests,250);
 }catch(err){$("create-message").textContent="Заявка не создана: "+(err.code||"ошибка")+" — "+err.message;show("create-message")}
});

function statsObj(rows,key){const o={};rows.forEach(r=>{const v=key(r);o[v]=(o[v]||0)+1});return o}
$("load-stats").addEventListener("click",()=>{
 const from=$("date-from").value,to=$("date-to").value;
 const rows=allRequests.filter(r=>{
  const d=r.createdAt?.toDate?r.createdAt.toDate():new Date(r.createdAt);
  return(!from||d>=new Date(from+"T00:00:00"))&&(!to||d<=new Date(to+"T23:59:59"));
 });
 const day=statsObj(rows,r=>(r.createdAt.toDate?r.createdAt.toDate():new Date(r.createdAt)).toLocaleDateString("ru-RU"));
 const type=statsObj(rows,r=>r.type),status=statsObj(rows,r=>r.status);
 const table=(title,o)=>'<div class="card"><h3>'+title+'</h3><table class="stat-table"><tbody>'+Object.keys(o).sort().map(k=>'<tr><td>'+k+'</td><td><b>'+o[k]+'</b></td></tr>').join("")+'</tbody></table></div>';
 $("stats-content").innerHTML=table("По дням",day)+table("По видам",type)+table("По статусам",status);
});
$("download-csv").addEventListener("click",()=>{
 const header="Госномер;Вид заявки;Статус;Комментарий;Дата\n";
 const body=allRequests.map(r=>[r.vehicle,r.type,r.status,r.comment||"",dateText(r.createdAt)].map(v=>'="'+String(v).replaceAll('"','""')+'"').join(";")).join("\n");
 const blob=new Blob(["\uFEFF"+header+body],{type:"text/csv;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="zayavki_remont.csv";a.click();URL.revokeObjectURL(a.href);
});

hide("loading");show("main-screen");subscribe();