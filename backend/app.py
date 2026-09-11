
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from pathlib import Path
from datetime import datetime, date, timedelta
import sqlite3, json, random, string, os
from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent
load_dotenv(BASE.parent / ".env")
DB = BASE / "aapurtikar.db"

app = FastAPI(title="Aapurtikar API", version="1.1.0", docs_url="/api/docs", redoc_url="/api/redoc")

# Same-origin is the default. Extra origins can be supplied for separate frontend hosting.
_extra_origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_extra_origins or ["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c

def init_db():
    c = conn()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS farmers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mobile TEXT UNIQUE NOT NULL,
      aadhaar TEXT DEFAULT '',
      state TEXT DEFAULT '',
      centre TEXT DEFAULT '',
      token TEXT UNIQUE,
      crops TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
      aadhaar TEXT DEFAULT '', state TEXT NOT NULL, centre TEXT NOT NULL,
      worker_token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id INTEGER NOT NULL, crop TEXT NOT NULL, quantity REAL NOT NULL,
      unit TEXT NOT NULL, centre TEXT NOT NULL, requested_date TEXT NOT NULL,
      requested_time TEXT NOT NULL, worker TEXT NOT NULL, note TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      FOREIGN KEY(farmer_id) REFERENCES farmers(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id INTEGER NOT NULL, farmer_token TEXT NOT NULL,
      centre TEXT NOT NULL, submitted_date TEXT NOT NULL, crops TEXT NOT NULL,
      FOREIGN KEY(farmer_id) REFERENCES farmers(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT, farmer_token TEXT NOT NULL,
      crop TEXT NOT NULL, grade TEXT NOT NULL, remarks TEXT DEFAULT '',
      graded_date TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, farmer_id INTEGER NOT NULL,
      farmer_name TEXT NOT NULL, farmer_token TEXT NOT NULL,
      appointment_date TEXT NOT NULL, appointment_time TEXT NOT NULL,
      visit_token TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'Scheduled',
      sms_sent INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(farmer_id) REFERENCES farmers(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, farmer_id INTEGER NOT NULL,
      farmer_name TEXT NOT NULL, farmer_token TEXT NOT NULL,
      amount REAL NOT NULL, weight REAL NOT NULL, ifsc TEXT NOT NULL,
      account_masked TEXT NOT NULL, status TEXT NOT NULL, payment_date TEXT NOT NULL,
      FOREIGN KEY(farmer_id) REFERENCES farmers(id) ON DELETE CASCADE
    );
    """)
    # Seed the same demo farmers used by the original worker app.
    demos = [
      ("9876543210","XXXXXXXXXXXX","Punjab","Ludhiana Procurement Centre","FARMER-PB-1001",
       [{"name":"Wheat","quantity":25,"unit":"Quintal"}]),
      ("9876543211","XXXXXXXXXXXX","Bihar","Patna Procurement Centre","FARMER-BR-1002",
       [{"name":"Rice","quantity":18,"unit":"Quintal"}]),
      ("9876543212","XXXXXXXXXXXX","Maharashtra","Nashik Procurement Centre","FARMER-MH-1003",
       [{"name":"Soybean","quantity":30,"unit":"Quintal"}]),
      ("9876543213","XXXXXXXXXXXX","West Bengal","Kolkata Procurement Centre","FARMER-WB-1004",
       [{"name":"Rice","quantity":22,"unit":"Quintal"}]),
    ]
    for m,a,s,ce,t,crops in demos:
        c.execute("""INSERT OR IGNORE INTO farmers(mobile,aadhaar,state,centre,token,crops,created_at)
                     VALUES(?,?,?,?,?,?,?)""",
                  (m,a,s,ce,t,json.dumps(crops),datetime.now().isoformat()))
    c.commit(); c.close()

init_db()

class Crop(BaseModel):
    name: str = Field(min_length=1)
    quantity: float = Field(gt=0)
    unit: str = Field(min_length=1)

class FarmerProfile(BaseModel):
    mobile: str = Field(min_length=10, max_length=10)
    aadhaar: str = ""
    state: str = ""
    centre: str = ""
    crops: List[Crop] = []

class Shipment(BaseModel):
    mobile: str
    centre: str
    crops: List[Crop]

class RequestResponse(BaseModel):
    status: str

class WorkerIn(BaseModel):
    name: str
    email: str
    phone: str
    aadhaar: str
    state: str
    centre: str

class AppointmentIn(BaseModel):
    farmer_id: int
    appointment_date: str
    appointment_time: str

class GradeIn(BaseModel):
    farmer_token: str
    crop: str
    grade: str
    remarks: str = ""

class PaymentIn(BaseModel):
    farmer_id: int
    farmer_token: str
    farmer_name: str
    amount: float
    weight: float
    ifsc: str
    account: str

def farmer_dict(r):
    return {
      "id": r["id"], "mobile": r["mobile"], "aadhaar": r["aadhaar"],
      "state": r["state"], "centre": r["centre"], "farmerToken": r["token"],
      "crops": json.loads(r["crops"] or "[]")
    }

def ensure_request(c, farmer_id, state, centre, crops):
    if not crops: return
    exists = c.execute("SELECT id FROM requests WHERE farmer_id=? AND status='Pending'", (farmer_id,)).fetchone()
    if exists: return
    crop = crops[0]
    d = (date.today() + timedelta(days=1)).strftime("%d %b %Y")
    c.execute("""INSERT INTO requests(farmer_id,crop,quantity,unit,centre,requested_date,
                 requested_time,worker,note,status) VALUES(?,?,?,?,?,?,?,?,?,?)""",
              (farmer_id,crop["name"],crop["quantity"],crop["unit"],centre,d,"9:00 AM – 12:00 PM",
               "Procurement Centre Officer","Please bring clean and dry crops for procurement.","Pending"))

def seed_requests():
    c=conn()
    rows=c.execute("SELECT id,state,centre,crops FROM farmers").fetchall()
    for r in rows:
        ensure_request(c,r["id"],r["state"],r["centre"],json.loads(r["crops"] or "[]"))
    c.commit(); c.close()

seed_requests()

@app.get("/")
def root():
    return FileResponse(BASE.parent / "index.html")

@app.get("/api/config")
def public_config():
    # Only browser-safe/public configuration belongs here. Never expose secret API keys.
    return {
        "app": "Aapurtikar",
        "version": "1.1.0",
        "features": {"sms": bool(os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN") and os.getenv("TWILIO_FROM_NUMBER")),
                     "maps": bool(os.getenv("GOOGLE_MAPS_API_KEY"))}
    }

@app.get("/api/health")
def health(): return {"status":"ok","database":"sqlite","app":"Aapurtikar"}

@app.post("/api/farmers/profile")
def save_farmer(p: FarmerProfile):
    p.state = p.state.strip()
    p.centre = p.centre.strip()
    if not p.state:
        raise HTTPException(400, "Please select a state.")
    if not p.centre:
        raise HTTPException(400, "Please enter a procurement centre number.")
    c=conn()
    existing=c.execute("SELECT * FROM farmers WHERE mobile=?", (p.mobile,)).fetchone()
    token = existing["token"] if existing and existing["token"] else None
    if not token:
        token = f"FT-{random.randint(1000,9999)}-{random.randint(1000,9999)}"
        while c.execute("SELECT 1 FROM farmers WHERE token=?", (token,)).fetchone():
            token = f"FT-{random.randint(1000,9999)}-{random.randint(1000,9999)}"
    if existing:
        c.execute("""UPDATE farmers SET aadhaar=?,state=?,centre=?,crops=?,token=? WHERE mobile=?""",
                  (p.aadhaar,p.state,p.centre,json.dumps([x.model_dump() for x in p.crops]),token,p.mobile))
        fid=existing["id"]
    else:
        cur=c.execute("""INSERT INTO farmers(mobile,aadhaar,state,centre,token,crops,created_at)
                         VALUES(?,?,?,?,?,?,?)""",
                      (p.mobile,p.aadhaar,p.state,p.centre,token,
                       json.dumps([x.model_dump() for x in p.crops]),datetime.now().isoformat()))
        fid=cur.lastrowid
    ensure_request(c,fid,p.state,p.centre,[x.model_dump() for x in p.crops])
    c.commit(); r=c.execute("SELECT * FROM farmers WHERE id=?", (fid,)).fetchone(); c.close()
    return farmer_dict(r)

@app.get("/api/farmers/by-mobile/{mobile}")
def farmer_by_mobile(mobile:str):
    c=conn(); r=c.execute("SELECT * FROM farmers WHERE mobile=?", (mobile,)).fetchone(); c.close()
    if not r: raise HTTPException(404,"Farmer not found")
    return farmer_dict(r)

@app.get("/api/farmers")
def all_farmers():
    c=conn(); rows=c.execute("SELECT * FROM farmers ORDER BY id").fetchall(); c.close()
    result=[]
    for r in rows:
        crops=json.loads(r["crops"] or "[]")
        for crop in crops or [{"name":"-","quantity":0,"unit":"Quintal"}]:
            result.append({"id":r["id"],"name":"Farmer "+r["mobile"][-4:],
              "farmerToken":r["token"],"state":r["state"],"centre":r["centre"],
              "crop":crop["name"],"quantity":crop["quantity"],"grade":"Pending","phone":r["mobile"]})
    return result

@app.post("/api/shipments")
def add_shipment(s: Shipment):
    c=conn(); r=c.execute("SELECT * FROM farmers WHERE mobile=?", (s.mobile,)).fetchone()
    if not r: raise HTTPException(404,"Farmer profile not found")
    crops=[x.model_dump() for x in s.crops]
    c.execute("UPDATE farmers SET centre=?,crops=? WHERE id=?",(s.centre,json.dumps(crops),r["id"]))
    ensure_request(c,r["id"],r["state"],s.centre,crops)
    now=datetime.now().strftime("%d %b %Y")
    cur=c.execute("""INSERT INTO shipments(farmer_id,farmer_token,centre,submitted_date,crops)
                     VALUES(?,?,?,?,?)""",(r["id"],r["token"],s.centre,now,json.dumps(crops)))
    # Keep one pending payment record represented by absence; worker creates final payment.
    c.commit(); sid=cur.lastrowid; c.close()
    return {"id":sid,"token":r["token"],"message":"Crop submission saved"}

@app.get("/api/farmers/{token}/history")
def history(token:str):
    c=conn(); rows=c.execute("SELECT * FROM shipments WHERE farmer_token=? ORDER BY id DESC",(token,)).fetchall(); c.close()
    return {"shipments":[{"id":r["id"],"token":r["farmer_token"],"centre":r["centre"],
             "date":r["submitted_date"],"crops":json.loads(r["crops"])} for r in rows]}

@app.post("/api/grades")
def add_grade(g: GradeIn):
    if g.grade not in {"A","B","C"}: raise HTTPException(400,"Grade must be A, B or C")
    c=conn(); d=datetime.now().strftime("%d %b %Y")
    cur=c.execute("""INSERT INTO grades(farmer_token,crop,grade,remarks,graded_date)
                     VALUES(?,?,?,?,?)""",(g.farmer_token,g.crop,g.grade,g.remarks,d))
    c.commit(); i=cur.lastrowid; c.close()
    return {"id":i,"message":"Crop grade saved"}

@app.get("/api/farmers/{token}/grades")
def grades(token:str):
    c=conn(); rows=c.execute("""SELECT farmer_token,crop,grade,remarks,graded_date AS date
                                FROM grades WHERE farmer_token=? ORDER BY id DESC""",(token,)).fetchall(); c.close()
    return {"grades":[dict(r) for r in rows]}

@app.get("/api/farmers/{mobile}/requests")
def requests(mobile:str):
    c=conn(); rows=c.execute("""SELECT q.* FROM requests q JOIN farmers f ON f.id=q.farmer_id
                                WHERE f.mobile=? ORDER BY q.id DESC""",(mobile,)).fetchall(); c.close()
    return {"requests":[{"id":r["id"],"crop":r["crop"],"quantity":r["quantity"],"unit":r["unit"],
      "centre":r["centre"],"date":r["requested_date"],"time":r["requested_time"],"worker":r["worker"],
      "note":r["note"],"status":r["status"]} for r in rows]}

@app.patch("/api/requests/{request_id}")
def update_request(request_id:int, body:RequestResponse):
    if body.status not in {"Accepted","Declined","Pending"}: raise HTTPException(400,"Invalid request status")
    c=conn(); c.execute("UPDATE requests SET status=? WHERE id=?",(body.status,request_id)); c.commit(); c.close()
    return {"message":"Request updated","status":body.status}

def worker_token(state):
    letters="".join(x[0] for x in state.split())[:2].upper()
    return f"WORKER-{letters}-{random.randint(100000,999999)}"

@app.post("/api/workers")
def register_worker(w:WorkerIn):
    c=conn(); existing=c.execute("SELECT * FROM workers WHERE phone=?", (w.phone,)).fetchone()
    if existing: token=existing["worker_token"]; wid=existing["id"]
    else:
        token=worker_token(w.state); 
        cur=c.execute("""INSERT INTO workers(name,email,phone,aadhaar,state,centre,worker_token,created_at)
                         VALUES(?,?,?,?,?,?,?,?)""",(w.name,w.email,w.phone,"XXXXXXXX"+w.aadhaar[-4:],w.state,w.centre,token,datetime.now().isoformat()))
        wid=cur.lastrowid
    if existing:
        c.execute("""UPDATE workers SET name=?,email=?,aadhaar=?,state=?,centre=? WHERE id=?""",
                  (w.name,w.email,"XXXXXXXX"+w.aadhaar[-4:],w.state,w.centre,wid))
    c.commit(); r=c.execute("SELECT * FROM workers WHERE id=?",(wid,)).fetchone(); c.close()
    return {"id":r["id"],"name":r["name"],"email":r["email"],"phone":r["phone"],"aadhaar":r["aadhaar"],
            "state":r["state"],"centre":r["centre"],"workerToken":r["worker_token"]}

@app.get("/api/workers/by-phone/{phone}")
def worker_by_phone(phone: str):
    c=conn(); r=c.execute("SELECT * FROM workers WHERE phone=?", (phone,)).fetchone(); c.close()
    if not r: raise HTTPException(404,"Worker not found")
    return {"id":r["id"],"name":r["name"],"email":r["email"],"phone":r["phone"],"aadhaar":r["aadhaar"],
            "state":r["state"],"centre":r["centre"],"workerToken":r["worker_token"]}

@app.get("/api/worker/state")
def worker_state():
    c=conn()
    apps=c.execute("SELECT * FROM appointments ORDER BY id DESC").fetchall()
    pays=c.execute("SELECT * FROM payments ORDER BY id DESC").fetchall()
    subs=c.execute("""SELECT s.*, f.mobile FROM shipments s JOIN farmers f ON f.id=s.farmer_id
                     ORDER BY s.id DESC""").fetchall()
    request_rows=c.execute("""SELECT q.*, f.mobile, f.token AS farmer_token FROM requests q JOIN farmers f ON f.id=q.farmer_id
                            ORDER BY q.id DESC""").fetchall()
    latest_request={}
    for q in request_rows:
        if q["farmer_id"] not in latest_request:
            latest_request[q["farmer_id"]]=dict(q)
    grade_rows=c.execute("SELECT farmer_token,crop,grade,remarks,graded_date FROM grades ORDER BY id DESC").fetchall()
    latest_grade={(g["farmer_token"],g["crop"]):dict(g) for g in grade_rows}
    c.close()
    return {
      "requests":[{"id":q["id"],"farmerId":q["farmer_id"],"farmerName":"Farmer "+q["mobile"][-4:],
        "farmerToken":q["farmer_token"],
        "crop":q["crop"],"quantity":q["quantity"],"unit":q["unit"],"centre":q["centre"],
        "date":q["requested_date"],"time":q["requested_time"],"worker":q["worker"],
        "note":q["note"],"status":q["status"]} for q in request_rows],
      "appointments":[{"id":r["id"],"farmerId":r["farmer_id"],"farmerName":r["farmer_name"],
        "farmerToken":r["farmer_token"],"date":r["appointment_date"],"time":r["appointment_time"],
        "visitToken":r["visit_token"],"status":r["status"],"smsSent":bool(r["sms_sent"])} for r in apps],
      "payments":[{"id":r["id"],"farmerName":r["farmer_name"],"farmerToken":r["farmer_token"],
        "amount":r["amount"],"weight":r["weight"],"ifsc":r["ifsc"],"account":r["account_masked"],
        "status":r["status"],"date":r["payment_date"]} for r in pays],
      "submissionHistory":[
        {"id":r["id"],"farmerName":r["farmerToken"],"farmerToken":r["farmer_token"],
         "visitToken":"-", "crop":(json.loads(r["crops"])[0]["name"] if json.loads(r["crops"]) else "-"),
         "quantity":(json.loads(r["crops"])[0]["quantity"] if json.loads(r["crops"]) else 0),
         "grade":(latest_grade.get((r["farmer_token"], json.loads(r["crops"])[0]["name"]),{}).get("grade","Pending")
                    if json.loads(r["crops"]) else "Pending"),
         "date":r["submitted_date"]} for r in subs
      ]
    }

@app.post("/api/appointments")
def create_appointment(a:AppointmentIn):
    c=conn(); f=c.execute("SELECT * FROM farmers WHERE id=?",(a.farmer_id,)).fetchone()
    if not f: raise HTTPException(404,"Farmer not found")
    count=c.execute("SELECT COUNT(*) n FROM appointments").fetchone()["n"]+1
    visit=f"VISIT-{f['id']}-{datetime.now().strftime('%d%b')}-{count:03d}"
    cur=c.execute("""INSERT INTO appointments(farmer_id,farmer_name,farmer_token,appointment_date,
                     appointment_time,visit_token,status,sms_sent) VALUES(?,?,?,?,?,?,?,1)""",
                  (f["id"],"Farmer "+f["mobile"][-4:],f["token"],a.appointment_date,a.appointment_time,visit,"Scheduled"))
    c.commit(); c.close()
    return {"id":cur.lastrowid,"visitToken":visit,"status":"Scheduled"}

@app.patch("/api/appointments/farmer/{farmer_id}/complete")
def complete_appointments(farmer_id:int):
    c=conn(); c.execute("UPDATE appointments SET status='Completed' WHERE farmer_id=?",(farmer_id,)); c.commit(); c.close()
    return {"message":"Appointments completed"}

@app.post("/api/payments")
def create_payment(p:PaymentIn):
    if not 9 <= len(p.account) <= 18 or not p.account.isdigit(): raise HTTPException(400,"Invalid account")
    if not __import__("re").match(r"^[A-Z]{4}0[A-Z0-9]{6}$",p.ifsc.upper()): raise HTTPException(400,"Invalid IFSC")
    masked="XXXXXX"+p.account[-4:]
    c=conn(); cur=c.execute("""INSERT INTO payments(farmer_id,farmer_name,farmer_token,amount,weight,ifsc,
                              account_masked,status,payment_date) VALUES(?,?,?,?,?,?,?,?,?)""",
                            (p.farmer_id,p.farmer_name,p.farmer_token,p.amount,p.weight,p.ifsc.upper(),
                             masked,"Success",datetime.now().strftime("%d %b %Y, %I:%M %p")))
    c.commit(); c.close()
    return {"id":cur.lastrowid,"status":"Success","account":masked}

@app.get("/api/farmers/{token}/payments")
def farmer_payments(token:str):
    c=conn(); rows=c.execute("""SELECT id,amount,weight,ifsc,account_masked,status,payment_date
                                FROM payments WHERE farmer_token=? ORDER BY id DESC""",(token,)).fetchall(); c.close()
    return {"payments":[{"id":r["id"],"amount":r["amount"],"weight":r["weight"],"ifsc":r["ifsc"],
      "account":r["account_masked"],"status":r["status"],"date":r["payment_date"]} for r in rows]}

# Serve the two original UIs from the same FastAPI server.
app.mount("/farmer", StaticFiles(directory=str(BASE.parent / "farmer"), html=True), name="farmer")
app.mount("/worker", StaticFiles(directory=str(BASE.parent / "worker"), html=True), name="worker")
