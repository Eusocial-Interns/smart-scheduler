const USE_MOCK = true;
let currentData = null;

async function fetchData() {
    if (USE_MOCK) {
    return mockData();
  }

  const [roles, employees, assignments, schedule] = await Promise.all([
    fetch('/api/v1/roles/').then(res => res.json()),
    fetch('/api/v1/employees/').then(res => res.json()),
    fetch('/api/v1/assignments/').then(res => res.json()),
    fetch('/api/v1/schedule/').then(res => res.json())
  ]);

  return { roles, employees, assignments,schedule };
}

function mockData() {
  return Promise.resolve({
    week_start: "2026-04-13",
    days: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
    operating_hours: {
      0: { open: "08:00", close: "22:00" },
      1: { open: "08:00", close: "22:00" },
      2: { open: "08:00", close: "22:00" },
      3: { open: "08:00", close: "22:00" },
      4: { open: "08:00", close: "23:00" },
      5: { open: "09:00", close: "23:00" },
      6: { open: "09:00", close: "21:00" }
    },
    roles: [
      {
        role_name: "Manager",
        days: {
          0: [{ employee_name: "Elizabeth", start: "09:00", end: "17:00" }],
          1: [], 2: [], 3: [], 4: [], 5: [], 6: []
        }
      },
      {
        role_name: "Server",
        days: {
          0: [{ employee_name: "Stephen", start: "21:00", end: "24:00" }],
          1: [{ employee_name: "Mohammed", start: "11:00", end: "19:00" }],
          2: [{ employee_name: "Stephen", start: "17:00", end: "22:00" }],
          3: [],
          4: [
            { employee_name: "Gabriel", start: "09:00", end: "17:00" },
            { employee_name: "Elizabeth", start: "09:00", end: "17:00" },
            { employee_name: "Gabriel", start: "17:00", end: "22:00" },
            { employee_name: "Elizabeth", start: "12:00", end: "15:00" }
          ],
          5: [],
          6: []
        }
      },
      {
        role_name: "Cook",
        days: {
          0: [], 1: [], 2: [
            { employee_name: "Gabriel", start: "08:00", end: "16:00" }
          ],
          3: [], 4: [], 5: [], 6: []
        }
      },
      {
        role_name: "Host",
        days: {
          0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []
        }
      }
    ]
  });
}

//Form
fetchData().then(data => {
  currentData = data;
  initForm(data);
  renderSchedule(data);
});

function initForm(data) {
  const daySelect = document.getElementById("daySelect");
  const roleSelect = document.getElementById("roleSelect");

  
  data.days.forEach((day, index) => {
    const opt = document.createElement("option");
    opt.value = index;
    opt.textContent = day;
    daySelect.appendChild(opt);
  });

  data.roles.forEach(role => {
    const opt = document.createElement("option");
    opt.value = role.role_name;
    opt.textContent = role.role_name;
    roleSelect.appendChild(opt);
  });

  daySelect.addEventListener("change", updateHoursInfo);
  updateHoursInfo();

  document
    .getElementById("createShiftBtn")
    .addEventListener("click", createShift);
}


function updateHoursInfo() {
  const day = document.getElementById("daySelect").value;
  const info = document.getElementById("hoursInfo");

  const hours = currentData.operating_hours[day];

  if (!hours) return;

  info.textContent = `Open: ${formatTime(hours.open)} – Close: ${formatTime(hours.close)}`;

  
  const startInput = document.getElementById("startTime");
  const endInput = document.getElementById("endTime");

  startInput.min = hours.open;
  startInput.max = hours.close;
  endInput.min = hours.open;
  endInput.max = hours.close;
}

function validateShiftUI(day, start, end) {
  const hours = currentData.operating_hours[day];

  if (!start || !end) return "Start and end time required";

  if (start >= end) return "End time must be after start time";

  if (hours && (start < hours.open || end > hours.close)) {
    return `Outside operating hours (${formatTime(hours.open)}–${formatTime(hours.close)})`;
  }

  return null;
}

async function createShift() {
  const day = parseInt(document.getElementById("daySelect").value);
  const role = document.getElementById("roleSelect").value;
  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;
  const notes = document.getElementById("notes").value;
  const errorDiv = document.getElementById("errorMsg");

    const uiError = validateShiftUI(day, start, end);

  if (uiError) {
    errorDiv.textContent = uiError;
    return;
  }

  errorDiv.textContent = "";

  try {
    if (USE_MOCK) {
    
      const roleObj = currentData.roles.find(r => r.role_name === role);

      roleObj.days[day].push({
        employee_name: "Unassigned",
        start,
        end
      });

      rerender();
      return;
    }
    
    const res = await fetch('/api/v1/assignments/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, role, start, end, notes })
    });

    if (!res.ok) {
      const err = await res.json();
      errorDiv.textContent = err.message || "Invalid shift";
      return;
    }

    
    const updated = await fetchData();
    currentData = updated;

    rerender();

  } catch (err) {
    errorDiv.textContent = "Network error. Try again.";
  }
}

//Rerender schedule
function rerender() {
  const grid = document.getElementById("scheduleGrid");

  grid.innerHTML = `
    <div class="header-cell role-header">Role</div>
    <div class="header-cell">Mon</div>
    <div class="header-cell">Tue</div>
    <div class="header-cell">Wed</div>
    <div class="header-cell">Thu</div>
    <div class="header-cell">Fri</div>
    <div class="header-cell">Sat</div>
    <div class="header-cell">Sun</div>
  `;

  renderSchedule(currentData);
}


//Render Schedule
function renderSchedule(data) {
  const grid = document.getElementById('scheduleGrid');

  data.roles.forEach(role => {
    
    const roleCell = document.createElement('div');
    roleCell.className = 'role-cell';
    roleCell.textContent = role.role_name;
    grid.appendChild(roleCell);

    for (let day = 0; day < 7; day++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell';

      const assignments = (role.days[day] || [])
        .slice()
        .sort((a, b) => a.start.localeCompare(b.start));

      assignments.forEach(a => {
        const div = document.createElement('div');
        div.className = `assignment ${getShiftClass(a.start)}`;
        div.innerHTML = `
        <div style="font-weight:600">${a.employee_name}</div>
        <div>${formatTime(a.start)}–${formatTime(a.end)}</div>
  
`;
        cell.appendChild(div);
      });

      grid.appendChild(cell);
    }
  });
}

//Helpers
function getShiftClass(startTime) {
  const hour = parseInt(startTime.split(":")[0]);

  if (hour < 12) return "shift-morning";
  if (hour < 17) return "shift-afternoon";
  if (hour < 21) return "shift-evening";
  return "shift-night";
}

function formatTime(timeStr) {
  if (!timeStr) return "";

  if (timeStr === "24:00") return "12:00 AM";

  const [hourStr, minute] = timeStr.split(":");
  let hour = parseInt(hourStr);

  const period = hour >= 12 ? "PM" : "AM";

  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${hour}:${minute} ${period}`;
}

fetchData().then(data => {
  console.log("DATA LOADED:", data);
  renderSchedule(data);
});