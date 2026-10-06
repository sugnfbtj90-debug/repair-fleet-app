import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, query, orderBy, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const fbApp=initializeApp(firebaseConfig),auth=getAuth(fbApp),db=getFirestore(fbApp);
const $=id=>document.getElementById(id);
let currentUser=null,isManager=false,allRequests=[],unsubscribe=null;

function show(id){$(id).classList.remove("hidden")} function hide(id){$(id).classList.add("hidden")}
function setManagerVisibility(){document.querySelectorAll(".manager-only").forEach(e=>e.classList.toggle("hidden",!isManager))}
function dateText(ts){if(!ts)return "";const d=ts.toDate?ts.toDate():new Date(ts);return d.toLocaleString("ru-RU")}
function renderRequests(){
 const filter=$("status-filter").value,root=$("requests");root.innerHTML="";
 const rows=allRequests.filter(r=>r.status!=="Выполнена"&&(!filter||r.status===filter));
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
  s.addEventListener("change",async e=>{if(!isManager)return;e.target.disabled=true;try{await updateDoc(doc(db,"repairRequests",r.id),{status:e.target.value,updatedAt:new Date()})}catch(err){alert("Ошибка: "+err.message);e.target.value=r.status}finally{e.target.disabled=false}});
  root.appendChild(n);
 });
}
async function loadRole(uid){const snap=await getDoc(doc(db,"users",uid));isManager=snap.exists()&&snap.data().role==="manager";setManagerVisibility()}
function subscribe(){
 const q=query(collection(db,"repairRequests"),orderBy("createdAt","desc"));
 if(unsubscribe)unsubscribe();
 unsubscribe=onSnapshot(q,s=>{allRequests=s.docs.map(d=>({id:d.id,...d.data()}));renderRequests()});
}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();hide("login-error");try{await signInWithEmailAndPassword(auth,$("login-email").value.trim(),$("login-password").value)}catch(err){$("login-error").textContent="Неверный email или пароль.";show("login-error")}});
$("logout-btn").addEventListener("click",()=>signOut(auth));
$("status-filter").addEventListener("change",renderRequests);
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));show("tab-"+b.dataset.tab)}));
$("request-form").addEventListener("submit",async e=>{e.preventDefault();hide("create-message");try{await addDoc(collection(db,"repairRequests"),{vehicle:$("vehicle").value.trim().toUpperCase(),type:$("type").value,comment:$("comment").value.trim(),status:"Создана",createdAt:new Date(),updatedAt:new Date(),createdBy:currentUser.uid});$("vehicle").value="";$("comment").value="";$("create-message").textContent="Заявка создана.";show("create-message")}catch(err){alert("Не удалось создать заявку: "+err.message)}});
function statsObj(rows,key){const o={};rows.forEach(r=>{const v=key(r);o[v]=(o[v]||0)+1});return o}
$("load-stats").addEventListener("click",()=>{
 const from=$("date-from").value,to=$("date-to").value;
 const rows=allRequests.filter(r=>{const d=r.createdAt?.toDate?r.createdAt.toDate():new Date(r.createdAt);return(!from||d>=new Date(from+"T00:00:00"))&&(!to||d<=new Date(to+"T23:59:59"))});
 const day=statsObj(rows,r=>(r.createdAt.toDate?r.createdAt.toDate():new Date(r.createdAt)).toLocaleDateString("ru-RU")),type=statsObj(rows,r=>r.type),status=statsObj(rows,r=>r.status);
 const table=(title,o)=>'<div class="card"><h3>'+title+'</h3><table class="stat-table"><tbody>'+Object.keys(o).sort().map(k=>'<tr><td>'+k+'</td><td><b>'+o[k]+'</b></td></tr>').join("")+'</tbody></table></div>';
 $("stats-content").innerHTML=table("По дням",day)+table("По видам",type)+table("По статусам",status);
});
$("download-csv").addEventListener("click",()=>{
 const header="Госномер;Вид заявки;Статус;Комментарий;Дата\n";
 const body=allRequests.map(r=>[r.vehicle,r.type,r.status,r.comment||"",dateText(r.createdAt)].map(v=>'="'+String(v).replaceAll('"','""')+'"').join(";")).join("\n");
 const blob=new Blob(["\uFEFF"+header+body],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="zayavki_remont.csv";a.click();
});
onAuthStateChanged(auth,async user=>{
 currentUser=user;hide("loading");
 if(!user){show("login-screen");hide("main-screen");if(unsubscribe)unsubscribe();return}
 try{await loadRole(user.uid)}catch(e){isManager=false;setManagerVisibility()}
 hide("login-screen");show("main-screen");subscribe();
});