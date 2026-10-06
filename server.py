import os, json, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

FIREBASE_API_KEY=os.environ["FIREBASE_API_KEY"]
FIREBASE_PROJECT_ID=os.environ["FIREBASE_PROJECT_ID"]
BASE=f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents/repairRequests"

app=FastAPI()
app.mount("/static", StaticFiles(directory="."), name="static")

class NewRequest(BaseModel):
    vehicle:str
    type:str
    comment:str=""

class StatusUpdate(BaseModel):
    status:str

def firestore_request(url, method="GET", body=None):
    data=None
    headers={}
    if body is not None:
        data=json.dumps(body,ensure_ascii=False).encode()
        headers["Content-Type"]="application/json"
    try:
        req=urllib.request.Request(url,data=data,headers=headers,method=method)
        with urllib.request.urlopen(req,timeout=15) as r:
            raw=r.read()
            return json.loads(raw.decode()) if raw else {}
    except urllib.error.HTTPError as e:
        detail=e.read().decode(errors="replace")
        raise HTTPException(status_code=e.code,detail=detail)
    except Exception as e:
        raise HTTPException(status_code=502,detail=str(e))

def sval(v):
    if "stringValue" in v:return v["stringValue"]
    if "timestampValue" in v:return v["timestampValue"]
    if "integerValue" in v:return int(v["integerValue"])
    if "doubleValue" in v:return v["doubleValue"]
    if "booleanValue" in v:return v["booleanValue"]
    return None

def parse_doc(d):
    f=d.get("fields",{})
    return {
        "id":d["name"].split("/")[-1],
        "vehicle":sval(f.get("vehicle",{})),
        "type":sval(f.get("type",{})),
        "comment":sval(f.get("comment",{})) or "",
        "status":sval(f.get("status",{})) or "Создана",
        "createdAt":sval(f.get("createdAt",{})),
        "updatedAt":sval(f.get("updatedAt",{})),
    }

def string_field(v): return {"stringValue":v}
def timestamp_field(dt): return {"timestampValue":dt.astimezone(timezone.utc).isoformat().replace("+00:00","Z")}

@app.get("/")
def index():
    return FileResponse("index.html")

@app.get("/api/requests")
def requests():
    url=BASE+"?key="+urllib.parse.quote(FIREBASE_API_KEY,safe="")
    result=firestore_request(url)
    return [parse_doc(d) for d in result.get("documents",[])]

@app.post("/api/requests")
def create_request(item:NewRequest):
    now=datetime.now(timezone.utc)
    body={"fields":{
        "vehicle":string_field(item.vehicle.strip().upper()),
        "type":string_field(item.type),
        "comment":string_field(item.comment.strip()),
        "status":string_field("Создана"),
        "createdAt":timestamp_field(now),
        "updatedAt":timestamp_field(now)
    }}
    url=BASE+"?key="+urllib.parse.quote(FIREBASE_API_KEY,safe="")
    result=firestore_request(url,method="POST",body=body)
    return parse_doc(result)

@app.patch("/api/requests/{request_id}")
def update_request(request_id:str,item:StatusUpdate):
    if item.status not in {"Создана","В работе","Ожидаются запчасти","Выполнена"}:
        raise HTTPException(status_code=400,detail="Недопустимый статус")
    now=datetime.now(timezone.utc)
    url=BASE+"/"+urllib.parse.quote(request_id,safe="")+"?key="+urllib.parse.quote(FIREBASE_API_KEY,safe="")+"&updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt"
    body={"fields":{"status":string_field(item.status),"updatedAt":timestamp_field(now)}}
    result=firestore_request(url,method="PATCH",body=body)
    return parse_doc(result)

@app.get("/api/health")
def health():
    return {"ok":True}
