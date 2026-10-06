const $=id=>document.getElementById(id);
let allRequests=[];
function show(id){$(id).classList.remove("hidden")}
function hide(id){$(id).classList.add("hidden")}
function dateText(v){if(!v)return "";return new Date(v).toLocaleString("ru-RU")}
function renderRequests(){
 const filter=$("status-filter").value,root=$("requests");
 const rows=allRequests.filter(r=>r.status!=="Выполнена"&&(!filter||r.status===filter)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
 $("active-count").textContent=rows.length;root.innerHTML="";
 if(!rows.length){root.innerHTML='<div class="card muted">Активных заявок нет.</div>';return}
 rows.forEach(r=>{
  const n=$("request-template").content.cloneNode(true);
  n.querySelector(".vehicle-tag").textContent=r.vehicle||"—";
  n.querySelector(".type-tag").textContent=r.type||"";
  const badge=n.querySelector(".status-badge");badge.textContent=r.status||"Создана";
  badge.classList.add(r.status==="Создана"?"status-created":r.status==="В работе"?"status-working":"status-parts");
  n.querySelector(".comment").textContent=r.comment||"Без комментария";
  n.querySelector(".meta").textContent="Создана: "+dateText(r.createdAt);
  const s=n.querySelector(".status-select");s.value=r.status||"Создана";
  s.addEventListener("change",async e=>{
   e.target.disabled=true;
   try{const res=await fetch("/api/requests/"+encodeURIComponent(r.id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:e.target.value})});if(!res.ok)throw new Error(await res.text());await loadRequests();}
   catch(err){alert("Не удалось изменить статус: "+err.message);e.target.value=r.status}
   finally{e.target.disabled=false}
  });
  root.appendChild(n);
 });
}
async function loadRequests(){
 try{
  const res=await fetch("/api/requests?ts="+Date.now(),{cache:"no-store"});if(!res.ok)throw new Error(await res.text());
  allRequests=await res.json();renderRequests();
 }catch(err){$("requests").innerHTML='<div class="card error"><b>Не удалось загрузить заявки.</b><br>'+err.message+'</div>';}
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));show("tab-"+b.dataset.tab)}));
$("status-filter").addEventListener("change",renderRequests);
$("request-form").addEventListener("submit",async e=>{
 e.preventDefault();hide("create-message");
 try{
  const body={vehicle:$("vehicle").value,type:$("type").value,comment:$("comment").value};
  const res=await fetch("/api/requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!res.ok)throw new Error(await res.text());
  const created=await res.json();allRequests=[created,...allRequests.filter(x=>x.id!==created.id)];
  $("vehicle").value="";$("comment").value="";
  $("status-filter").value="";renderRequests();
  $("create-message").textContent="Заявка создана. Статус: Создана.";show("create-message");
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab==="active"));
  document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));show("tab-active");
  setTimeout(loadRequests,200);
 }catch(err){$("create-message").textContent="Заявка не создана: "+err.message;show("create-message")}
});
function statsObj(rows,key){const o={};rows.forEach(r=>{const v=key(r);o[v]=(o[v]||0)+1});return o}
$("load-stats").addEventListener("click",()=>{
 const from=$("date-from").value,to=$("date-to").value;
 const rows=allRequests.filter(r=>{const d=new Date(r.createdAt);return(!from||d>=new Date(from+"T00:00:00"))&&(!to||d<=new Date(to+"T23:59:59"))});
 const day=statsObj(rows,r=>new Date(r.createdAt).toLocaleDateString("ru-RU")),type=statsObj(rows,r=>r.type),status=statsObj(rows,r=>r.status);
 const completed=rows.filter(r=>r.status==="Выполнена").length,active=rows.length-completed;
 const table=(title,o)=>'<div class="card"><h3>'+title+'</h3><table class="stat-table"><tbody>'+Object.keys(o).sort().map(k=>'<tr><td>'+k+'</td><td><b>'+o[k]+'</b></td></tr>').join("")+'</tbody></table></div>';
 $("stats-content").innerHTML='<div class="card"><h3>Сводка</h3><div class="summary-cards"><div><b>'+rows.length+'</b><span>всего заявок</span></div><div><b>'+active+'</b><span>активных</span></div><div><b>'+completed+'</b><span>выполнено</span></div></div></div>'+table("По дням",day)+table("По видам",type)+table("По статусам",status);
});
$("download-csv").addEventListener("click",()=>{
 const header="Госномер;Вид заявки;Статус;Комментарий;Дата\n";
 const body=allRequests.map(r=>[r.vehicle,r.type,r.status,r.comment||"",dateText(r.createdAt)].map(v=>'="'+String(v).replaceAll('"','""')+'"').join(";")).join("\n");
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+header+body],{type:"text/csv;charset=utf-8"}));a.download="zayavki_remont.csv";a.click();
});
hide("loading");show("main-screen");loadRequests();setInterval(loadRequests,5000);
