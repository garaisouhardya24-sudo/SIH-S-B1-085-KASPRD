/*
  Aapurtikar
  ------------------------------------------------
  Beginner-friendly version:
  - Only HTML + CSS + JavaScript
  - No React
  - No Tailwind
  - No backend
  - Data is stored in localStorage
*/

// ---------- DATA ----------

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const UNION_TERRITORIES = [
  "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

const ALL_REGIONS = STATES.concat(UNION_TERRITORIES);

const DEFAULT_FARMERS = [
  {
    id: 1,
    name: "Ramesh Kumar",
    farmerToken: "FARMER-PB-1001",
    state: "Punjab",
    centre: "Ludhiana Procurement Centre",
    crop: "Wheat",
    quantity: 25,
    grade: "A",
    phone: "9876543210"
  },
  {
    id: 2,
    name: "Sunita Devi",
    farmerToken: "FARMER-BR-1002",
    state: "Bihar",
    centre: "Patna Procurement Centre",
    crop: "Rice",
    quantity: 18,
    grade: "A",
    phone: "9876543211"
  },
  {
    id: 3,
    name: "Mohan Singh",
    farmerToken: "FARMER-MH-1003",
    state: "Maharashtra",
    centre: "Nashik Procurement Centre",
    crop: "Soybean",
    quantity: 30,
    grade: "B",
    phone: "9876543212"
  },
  {
    id: 4,
    name: "Priya Das",
    farmerToken: "FARMER-WB-1004",
    state: "West Bengal",
    centre: "Kolkata Procurement Centre",
    crop: "Rice",
    quantity: 22,
    grade: "A",
    phone: "9876543213"
  }
];

// ---------- APP STATE ----------

let currentPage = "dashboard";
let selectedFarmerId = null;

const API_BASE = (() => {
  const host = window.location.hostname;
  const port = window.location.port;
  if (!host || window.location.protocol === "file:") return "http://127.0.0.1:8000/api";
  if (port && port !== "8000") return "http://127.0.0.1:8000/api";
  return "/api";
})();
let worker = null;
let appointments = [];
let payments = [];
let submissionHistory = [];
let requests = [];
let farmers = [];
let serverReady = false;

// ---------- SMALL HELPER FUNCTIONS ----------

async function api(url, options={}) {
  try {
  const r = await fetch(API_BASE + url, {headers: {"Content-Type":"application/json", ...(options.headers||{})}, ...options});
  if (!r.ok) { let msg=`Request failed (${r.status})`; try { msg=(await r.json()).detail||msg; } catch(e){} throw new Error(msg); }
  return r.json();
  } catch (e) {
    if (e instanceof TypeError) throw new Error("Cannot connect to Aapurtikar server. Start the FastAPI backend with: python run.py");
    throw e;
  }
}
async function saveData() {
  try {
    if (worker) await api("/workers", {method:"POST", body:JSON.stringify({
      name:worker.name,email:worker.email,phone:worker.phone,aadhaar:worker.aadhaar.replace(/\D/g,""),
      state:worker.state,centre:worker.centre
    })});
    await refreshServerState();
  } catch(e) { console.error(e); }
}
async function refreshServerState() {
  try {
    farmers = await api("/farmers");
    const s = await api("/worker/state");
    requests=s.requests||[]; appointments=s.appointments||[]; payments=s.payments||[]; submissionHistory=s.submissionHistory||[];
    serverReady=true;
  } catch(e) { console.error(e); }
}
async function registerWorker() {
  const payload={name:worker.name,email:worker.email,phone:worker.phone,
    aadhaar:worker.aadhaar.replace(/\D/g,""),state:worker.state,centre:worker.centre};
  worker=await api("/workers",{method:"POST",body:JSON.stringify(payload)});
  localStorage.setItem("aapurtikar_worker_phone",worker.phone);
  await refreshServerState();
}

function createWorkerToken(state) {
  // Example: Punjab -> WORKER-PU-483921
  const letters = state
    .split(" ")
    .map(word => word[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const number = Math.floor(100000 + Math.random() * 900000);
  return "WORKER-" + letters + "-" + number;
}

function createVisitToken(farmerId) {
  const date = new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en", { month: "short" });
  const count = appointments.length + 1;

  return "VISIT-" + farmerId + "-" + day + month + "-" +
    String(count).padStart(3, "0");
}

function maskAccount(account) {
  return "XXXXXX" + account.slice(-4);
}

function showPage(page) {
  currentPage = page;
  render();
}

function getFarmer(id) {
  return farmers.find(farmer => farmer.id === Number(id));
}

function getTodayAppointments() {
  const today = new Date().toISOString().slice(0, 10);
  return appointments.filter(a => a.date === today);
}

// ---------- LOGIN ----------

function renderLogin() {
  return `
    <div class="login">
      <div class="login-box">
        <div class="logo">Aapurtikar</div>
        <p>Procurement Worker Portal</p>

        <div class="notice">
          Demo application only. Aadhaar, SMS and banking are simulated.
        </div>

        <h2>Worker Login / Registration</h2>

        <div id="loginError"></div>

        <form id="loginForm">
          <label>Worker Name</label>
          <input id="workerName" type="text" placeholder="Enter your name" required>

          <label>Email</label>
          <input id="workerEmail" type="email" placeholder="officer@example.com" required>

          <label>Phone Number</label>
          <input id="workerPhone" type="text" maxlength="10"
                 placeholder="10 digit phone number" required>

          <label>Aadhaar Number</label>
          <input id="workerAadhaar" type="text" maxlength="12"
                 placeholder="12 digit dummy Aadhaar" required>

          <label>State / Union Territory</label>
          <select id="workerState" required>
            <option value="">Select region</option>
            ${ALL_REGIONS.map(state =>
              `<option value="${state}">${state}</option>`
            ).join("")}
          </select>

          <label>Procurement Centre</label>
          <input id="workerCentre" type="text"
                 placeholder="Example: Ludhiana Procurement Centre" required>

          <button class="btn" type="submit">Login / Register</button>
        </form>

        <p class="small">
          Use dummy data. This project does not connect to real Aadhaar or banking systems.
        </p>
      </div>
    </div>
  `;
}

async function handleLogin(event) {
  event.preventDefault();

  const name = document.getElementById("workerName").value.trim();
  const email = document.getElementById("workerEmail").value.trim();
  const phone = document.getElementById("workerPhone").value.trim();
  const aadhaar = document.getElementById("workerAadhaar").value.trim();
  const state = document.getElementById("workerState").value;
  const centre = document.getElementById("workerCentre").value.trim();

  const error = document.getElementById("loginError");

  if (!/^\d{10}$/.test(phone)) {
    error.innerHTML = `<p class="error">Phone must contain exactly 10 digits.</p>`;
    return;
  }

  if (!/^\d{12}$/.test(aadhaar)) {
    error.innerHTML = `<p class="error">Aadhaar demo value must contain exactly 12 digits.</p>`;
    return;
  }

  worker = {
    name,
    email,
    phone,
    aadhaar: "XXXXXXXX" + aadhaar.slice(-4),
    state,
    centre,
    workerToken: createWorkerToken(state)
  };

  try {
    await registerWorker();
    showPage("dashboard");
  } catch (err) {
    error.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ---------- MAIN LAYOUT ----------

function renderLayout(content) {
  return `
    <header class="header">
      <div>
        <h1>Aapurtikar</h1>
        <small>Procurement Worker Portal</small>
      </div>
      <div>
        <strong>${worker.name}</strong><br>
        <small>${worker.workerToken}</small>
      </div>
      <button onclick="logout()">Logout</button>
    </header>

    <nav class="nav">
      <button class="${currentPage === "dashboard" ? "active" : ""}"
              onclick="showPage('dashboard')">Dashboard</button>
      <button class="${currentPage === "submissions" ? "active" : ""}"
              onclick="showPage('submissions')">Crop Submissions</button>
      <button class="${currentPage === "appointments" ? "active" : ""}"
              onclick="showPage('appointments')">Appointments</button>
      <button class="${currentPage === "payments" ? "active" : ""}"
              onclick="showPage('payments')">Payments</button>
      <button class="${currentPage === "submissionHistory" ? "active" : ""}"
              onclick="showPage('submissionHistory')">Crop History</button>
      <button class="${currentPage === "profile" ? "active" : ""}"
              onclick="showPage('profile')">Profile</button>
    </nav>

    <main class="container">
      ${content}
    </main>
  `;
}

function logout() {
  worker = null;
  localStorage.removeItem("aapurtikar_worker_phone");
  currentPage = "dashboard";
  render();
}

// ---------- DASHBOARD ----------

function renderDashboard() {
  const todayAppointments = getTodayAppointments();

  return `
    <div class="card">
      <h2>Welcome, ${worker.name}</h2>
      <p>Manage farmer crop submissions, appointments and payments.</p>

      <p>
        <strong>Your Worker Token:</strong><br>
        <span class="token">${worker.workerToken}</span>
      </p>
    </div>

    <div class="grid">
      <div class="stat">
        Farmers
        <strong>${farmers.length}</strong>
      </div>
      <div class="stat">
        Today's Appointments
        <strong>${todayAppointments.length}</strong>
      </div>
      <div class="stat">
        Payments
        <strong>${payments.length}</strong>
      </div>
    </div>

    <div class="card">
      <h3>Quick Actions</h3>
      <div class="actions">
        <button class="btn" onclick="showPage('submissions')">View Crop Submissions</button>
        <button class="btn secondary" onclick="showPage('appointments')">Today's Appointments</button>
        <button class="btn secondary" onclick="showPage('payments')">Payment History</button>
        <button class="btn secondary" onclick="showPage('submissionHistory')">Crop History</button>
      </div>
    </div>
  `;
}

// ---------- SUBMISSIONS ----------

function renderSubmissions() {
  return `
    <div class="card">
      <h2>Farmer Crop Submissions</h2>

      <div class="form-grid">
        <div>
          <label>Search Farmer</label>
          <input id="farmerSearch" type="text"
                 placeholder="Name or farmer token"
                 oninput="filterFarmers()">
        </div>

        <div>
          <label>Filter by State</label>
          <select id="stateFilter" onchange="filterFarmers()">
            <option value="">All States / UTs</option>
            ${ALL_REGIONS.map(state =>
              `<option value="${state}">${state}</option>`
            ).join("")}
          </select>
        </div>
      </div>

      <div id="farmerTable"></div>
    </div>
  `;
}

function filterFarmers() {
  const search = document.getElementById("farmerSearch").value.toLowerCase();
  const state = document.getElementById("stateFilter").value;

  const results = farmers.filter(farmer => {
    const matchesSearch =
      farmer.name.toLowerCase().includes(search) ||
      farmer.farmerToken.toLowerCase().includes(search);

    const matchesState = !state || farmer.state === state;

    return matchesSearch && matchesState;
  });

  document.getElementById("farmerTable").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Farmer</th>
            <th>Token</th>
            <th>State</th>
            <th>Crop</th>
            <th>Quantity</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${results.length ? results.map(farmer => `
            <tr>
              <td>${farmer.name}</td>
              <td>${farmer.farmerToken}</td>
              <td>${farmer.state}</td>
              <td>${farmer.crop}</td>
              <td>${farmer.quantity} quintal</td>
              <td><span class="badge ${((requests.find(r => r.farmerId === farmer.id && r.crop === farmer.crop) || {}).status || "Pending").toLowerCase()}">${(requests.find(r => r.farmerId === farmer.id && r.crop === farmer.crop) || {}).status || "Pending"}</span></td>
              <td>
                <button class="btn"
                  onclick="openFarmer(${farmer.id})">View</button>
              </td>
            </tr>
          `).join("") : `
            <tr><td colspan="7">No farmers found.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}

function openFarmer(id) {
  selectedFarmerId = id;
  showPage("farmer");
}

// ---------- FARMER DETAILS ----------

function renderFarmer() {
  const farmer = getFarmer(selectedFarmerId);

  if (!farmer) {
    return `<div class="card"><p>Farmer not found.</p></div>`;
  }

  const farmerRequest = requests.find(r => r.farmerId === farmer.id && r.crop === farmer.crop);
  return `
    <div class="card">
      <button class="btn secondary" onclick="showPage('submissions')">← Back</button>
      <h2>Farmer Details</h2>

      <p><strong>Name:</strong> ${farmer.name}</p>
      <p><strong>Farmer Token:</strong> <span class="token">${farmer.farmerToken}</span></p>
      <p><strong>State:</strong> ${farmer.state}</p>
      <p><strong>Centre:</strong> ${farmer.centre}</p>
      <p><strong>Crop:</strong> ${farmer.crop}</p>
      <p><strong>Submitted Quantity:</strong> ${farmer.quantity} quintal</p>
      <p><strong>Request Status:</strong> <span class="badge ${(farmerRequest?.status || "Pending").toLowerCase()}">${farmerRequest?.status || "Pending"}</span></p>
      <p><strong>Grade:</strong> ${farmer.grade}</p>

      <div class="actions">
        <button class="btn" onclick="showPage('appointment')">
          Schedule Appointment
        </button>
        <button class="btn secondary" onclick="showPage('verification')">
          Verify & Payment
        </button>
      </div>
    </div>
  `;
}

// ---------- APPOINTMENT ----------

function getAutomaticAppointment() {
  const date = new Date();
  date.setDate(date.getDate() + 1 + Math.floor(appointments.length / 5));

  const dateText = date.toISOString().slice(0, 10);
  const timeSlots = ["09:00", "10:00", "11:00", "12:00", "13:00"];
  const time = timeSlots[appointments.length % timeSlots.length];

  return { date: dateText, time };
}

function renderAppointment() {
  const farmer = getFarmer(selectedFarmerId);
  const automaticAppointment = getAutomaticAppointment();

  return `
    <div class="card">
      <h2>Schedule Farmer Appointment</h2>
      <p><strong>Farmer:</strong> ${farmer.name}</p>
      <p><strong>Farmer Token:</strong> ${farmer.farmerToken}</p>
      <p class="small">The system will automatically allot the next available date and time.</p>

      <form id="appointmentForm">
        <label>Appointment Date</label>
        <input id="appointmentDate" type="date" value="${automaticAppointment.date}" readonly required>

        <label>Appointment Time</label>
        <input id="appointmentTime" type="time" value="${automaticAppointment.time}" readonly required>

        <button class="btn" type="submit">Create Appointment</button>
      </form>

      <div id="appointmentResult"></div>
    </div>
  `;
}

async function handleAppointment(event) {
  event.preventDefault();

  const farmer = getFarmer(selectedFarmerId);
  const automaticAppointment = getAutomaticAppointment();
  const date = automaticAppointment.date;
  const time = automaticAppointment.time;
  const visitToken = createVisitToken(farmer.id);

  const appointment = {
    id: Date.now(),
    farmerId: farmer.id,
    farmerName: farmer.name,
    farmerToken: farmer.farmerToken,
    date,
    time,
    visitToken,
    status: "Scheduled",
    smsSent: true
  };

  try {
    const result = await api("/appointments", {method:"POST", body:JSON.stringify({
      farmer_id: farmer.id, appointment_date: date, appointment_time: time
    })});
    appointment.id=result.id; appointment.visitToken=result.visitToken;
    appointments.unshift(appointment);
    document.getElementById("appointmentResult").innerHTML = `
    <div class="success-box">
      <h3>Appointment Created</h3>
      <p><strong>Visit Token:</strong></p>
      <span class="token">${result.visitToken}</span>
      <p>Demo SMS notification sent to ${farmer.phone}.</p>
    </div>
  `;
  } catch(err) {
    document.getElementById("appointmentResult").innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ---------- APPOINTMENTS ----------

function renderAppointments() {
  return `
    <div class="card">
      <h2>Appointments</h2>

      ${appointments.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Farmer</th>
                <th>Farmer Token</th>
                <th>Date</th>
                <th>Time</th>
                <th>Visit Token</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${appointments.map(a => `
                <tr>
                  <td>${a.farmerName}</td>
                  <td>${a.farmerToken}</td>
                  <td>${a.date}</td>
                  <td>${a.time}</td>
                  <td>${a.visitToken}</td>
                  <td><span class="badge">${a.status}</span></td>
                  <td>
                    <button class="btn"
                      onclick="startVerification(${a.farmerId})">
                      Verify
                    </button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<p>No appointments yet.</p>`}
    </div>
  `;
}

function startVerification(farmerId) {
  selectedFarmerId = farmerId;
  showPage("verification");
}

// ---------- VERIFICATION + PAYMENT ----------

function renderVerification() {
  const farmer = getFarmer(selectedFarmerId);

  return `
    <div class="card">
      <h2>Farmer Verification & Payment</h2>

      <div class="notice">
        First verify the farmer token. Then enter crop and bank details.
        All payment processing is simulated.
      </div>

      <form id="paymentForm">

        <h3>1. Farmer Token</h3>

        <label>Valid Farmer Token</label>
        <input id="farmerTokenInput"
               placeholder="Example: FARMER-PB-1001" required>

        <button class="btn secondary" type="button"
                onclick="verifyFarmerToken()">
          Verify Farmer Token
        </button>

        <p id="tokenStatus"></p>

        <div id="paymentFields" style="display:none;">

          <h3>2. Crop Verification</h3>

          <p><strong>Farmer:</strong> ${farmer.name}</p>
          <p><strong>Crop:</strong> ${farmer.crop}</p>
          <p><strong>Submitted Quantity:</strong> ${farmer.quantity} quintal</p>

          <div class="form-grid">
            <div>
              <label>Actual Weight (quintal)</label>
              <input id="actualWeight" type="number" min="0.01" step="0.01"
                     value="${farmer.quantity}" required>
            </div>

            <div>
              <label>Grade</label>
              <select id="cropGrade">
                <option>A</option>
                <option>B</option>
                <option>C</option>
              </select>
            </div>
          </div>

          <label>Remarks</label>
          <textarea id="remarks" placeholder="Optional remarks"></textarea>

          <label class="checkbox">
            <input id="cropAccepted" type="checkbox" required>
            I confirm that the crop has been verified and accepted.
          </label>

          <h3>3. Farmer Bank Details</h3>

          <label>Bank Account Number</label>
          <input id="accountNumber" type="text"
                 inputmode="numeric" maxlength="18"
                 placeholder="Enter 9-18 digit account number" required>

          <label>Confirm Bank Account Number</label>
          <input id="confirmAccountNumber" type="text"
                 inputmode="numeric" maxlength="18"
                 placeholder="Re-enter account number" required>

          <label>IFSC Code</label>
          <input id="ifsc" type="text" maxlength="11"
                 placeholder="Example: SBIN0001234" required>

          <h3>4. Payment Amount</h3>

          <p>Demo procurement rate: <strong>₹2,275 / quintal</strong></p>

          <label>Payment Amount (₹)</label>
          <input id="paymentAmount" type="number" readonly>

          <button class="btn" type="submit">Send Payment</button>
        </div>
      </form>

      <div id="paymentResult"></div>
    </div>
  `;
}

function verifyFarmerToken() {
  const input = document.getElementById("farmerTokenInput").value.trim();
  const farmer = getFarmer(selectedFarmerId);
  const status = document.getElementById("tokenStatus");

  if (input === farmer.farmerToken) {
    status.innerHTML = `<span class="badge success">Farmer Token Verified</span>`;
    document.getElementById("paymentFields").style.display = "block";
    updatePaymentAmount();
  } else {
    status.innerHTML = `<span class="badge pending">Invalid Farmer Token</span>`;
    document.getElementById("paymentFields").style.display = "none";
  }
}

function updatePaymentAmount() {
  const weight = Number(document.getElementById("actualWeight").value) || 0;
  document.getElementById("paymentAmount").value = (weight * 2275).toFixed(2);
}

async function handlePayment(event) {
  event.preventDefault();

  const farmer = getFarmer(selectedFarmerId);
  const token = document.getElementById("farmerTokenInput").value.trim();
  const account = document.getElementById("accountNumber").value.trim();
  const confirmAccount = document.getElementById("confirmAccountNumber").value.trim();
  const ifsc = document.getElementById("ifsc").value.trim().toUpperCase();
  const weight = Number(document.getElementById("actualWeight").value);
  const amount = Number(document.getElementById("paymentAmount").value);

  if (token !== farmer.farmerToken) {
    alert("Please verify the correct farmer token first.");
    return;
  }

  if (!/^\d{9,18}$/.test(account)) {
    alert("Account number must contain 9 to 18 digits.");
    return;
  }

  if (account !== confirmAccount) {
    alert("Account numbers do not match.");
    return;
  }

  // Demo IFSC validation.
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    alert("Enter a valid demo IFSC format, for example SBIN0001234.");
    return;
  }

  if (!weight || weight <= 0) {
    alert("Enter a valid crop weight.");
    return;
  }

  if (!document.getElementById("cropAccepted").checked) {
    alert("Please confirm crop verification.");
    return;
  }

  // Show processing first.
  document.getElementById("paymentResult").innerHTML = `
    <div class="notice">
      Payment processing... Please wait.
    </div>
  `;

  document.getElementById("paymentResult").innerHTML = `<div class="notice">Payment processing... Please wait.</div>`;
  try {
    const grade = document.getElementById("cropGrade").value;
    const remarks = document.getElementById("remarks").value.trim();
    await api("/grades", {method:"POST", body:JSON.stringify({
      farmer_token:farmer.farmerToken, crop:farmer.crop, grade, remarks
    })});
    const pay = await api("/payments", {method:"POST", body:JSON.stringify({
      farmer_id:farmer.id, farmer_token:farmer.farmerToken, farmer_name:farmer.name,
      amount, weight, ifsc, account
    })});
    await api("/appointments/farmer/"+farmer.id+"/complete",{method:"PATCH"});
    await refreshServerState();
    document.getElementById("paymentResult").innerHTML = `
      <div class="success-box">
        <h3>Payment Successful</h3>
        <p><strong>Status:</strong> Success</p>
        <p><strong>Farmer:</strong> ${farmer.name}</p>
        <p><strong>Farmer Token:</strong> ${farmer.farmerToken}</p>
        <p><strong>Amount:</strong> ₹${amount.toFixed(2)}</p>
        <p><strong>Bank Account:</strong> ${maskAccount(account)}</p>
        <p><strong>IFSC:</strong> ${ifsc}</p>
        <p>This is a simulated bank-to-bank payment.</p>
        <div class="actions">
          <button class="btn" onclick="showPage('payments')">View Payment History</button>
          <button class="btn secondary" onclick="showPage('dashboard')">Back to Dashboard</button>
        </div>
      </div>`;
  } catch(err) {
    document.getElementById("paymentResult").innerHTML = `<div class="notice"><strong>Payment failed:</strong> ${err.message}</div>`;
  }
}
// ---------- PAYMENT HISTORY ----------

function renderPayments() {
  return `
    <div class="card">
      <h2>Payment History</h2>

      <label>Search by Farmer Token</label>
      <input id="paymentSearch" type="text"
             placeholder="Enter farmer token"
             oninput="filterPayments()">

      <div id="paymentTable"></div>
    </div>
  `;
}

function filterPayments() {
  const search = document.getElementById("paymentSearch").value.toLowerCase().trim();

  const results = payments.filter(payment =>
    payment.farmerToken.toLowerCase().includes(search)
  );

  document.getElementById("paymentTable").innerHTML = results.length ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Farmer</th>
            <th>Token</th>
            <th>Amount</th>
            <th>Account</th>
            <th>IFSC</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(p => `
            <tr>
              <td>${p.farmerName}</td>
              <td>${p.farmerToken}</td>
              <td>₹${Number(p.amount).toFixed(2)}</td>
              <td>${p.account}</td>
              <td>${p.ifsc}</td>
              <td><span class="badge success">${p.status}</span></td>
              <td>${p.date}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : `<p>No payment history found.</p>`;
}

// ---------- CROP SUBMISSION HISTORY ----------

function renderSubmissionHistory() {
  return `
    <div class="card">
      <h2>Crop Submission History</h2>

      <label>Search by Farmer Token</label>
      <input id="submissionSearch" type="text"
             placeholder="Enter farmer token"
             oninput="filterSubmissionHistory()">

      <div id="submissionHistoryTable"></div>
    </div>
  `;
}

function filterSubmissionHistory() {
  const search = document.getElementById("submissionSearch").value.toLowerCase().trim();

  const results = submissionHistory.filter(submission =>
    submission.farmerToken.toLowerCase().includes(search)
  );

  document.getElementById("submissionHistoryTable").innerHTML = results.length ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Farmer</th>
            <th>Farmer Token</th>
            <th>Visit Token</th>
            <th>Crop</th>
            <th>Quantity</th>
            <th>Grade</th>
            <th>Submission Date</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(s => `
            <tr>
              <td>${s.farmerName}</td>
              <td>${s.farmerToken}</td>
              <td>${s.visitToken}</td>
              <td>${s.crop}</td>
              <td>${s.quantity} quintal</td>
              <td>${s.grade}</td>
              <td>${s.date}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : `<p>No crop submission history found.</p>`;
}

// ---------- PROFILE ----------

function renderProfile() {
  return `
    <div class="card">
      <h2>Worker Profile</h2>

      <p><strong>Name:</strong> ${worker.name}</p>
      <p><strong>Email:</strong> ${worker.email}</p>
      <p><strong>Phone:</strong> ${worker.phone}</p>
      <p><strong>Aadhaar:</strong> ${worker.aadhaar}</p>
      <p><strong>State / UT:</strong> ${worker.state}</p>
      <p><strong>Centre:</strong> ${worker.centre}</p>

      <p>
        <strong>Worker Token:</strong><br>
        <span class="token">${worker.workerToken}</span>
      </p>

      <div class="notice">
        Your Worker Token is different from the farmer's permanent token
        and the farmer's visit token.
      </div>
    </div>
  `;
}

// ---------- RENDER ----------

function render() {
  const app = document.getElementById("app");

  if (!worker) {
    app.innerHTML = renderLogin();
    document.getElementById("loginForm").addEventListener("submit", handleLogin);
    return;
  }

  let content = "";

  if (currentPage === "dashboard") {
    content = renderDashboard();
  } else if (currentPage === "submissions") {
    content = renderSubmissions();
  } else if (currentPage === "farmer") {
    content = renderFarmer();
  } else if (currentPage === "appointment") {
    content = renderAppointment();
  } else if (currentPage === "appointments") {
    content = renderAppointments();
  } else if (currentPage === "verification") {
    content = renderVerification();
  } else if (currentPage === "payments") {
    content = renderPayments();
  } else if (currentPage === "submissionHistory") {
    content = renderSubmissionHistory();
  } else if (currentPage === "profile") {
    content = renderProfile();
  }

  app.innerHTML = renderLayout(content);

  // Extra event listeners for pages that have forms.
  if (currentPage === "submissions") {
    filterFarmers();
  }

  if (currentPage === "payments") {
    filterPayments();
  }

  if (currentPage === "submissionHistory") {
    filterSubmissionHistory();
  }

  if (currentPage === "appointment") {
    document.getElementById("appointmentForm")
      .addEventListener("submit", handleAppointment);
  }

  if (currentPage === "verification") {
    document.getElementById("paymentForm")
      .addEventListener("submit", handlePayment);

    document.getElementById("actualWeight")
      .addEventListener("input", updatePaymentAmount);
  }
}

// Start the application. Data is loaded from the shared FastAPI/SQLite backend.
async function boot() {
  const phone = localStorage.getItem("aapurtikar_worker_phone");
  await refreshServerState();
  if (phone) {
    try {
      worker = await api("/workers/by-phone/"+encodeURIComponent(phone));
    } catch(e) {}
  }
  render();
}
boot();
