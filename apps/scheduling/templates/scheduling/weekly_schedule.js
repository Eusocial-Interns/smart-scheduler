const USE_MOCK = true;

async function fetchData() {
    if (USE_MOCK) {
    return mockData();
  }

  const [roles, employees, assignments] = await Promise.all([
    fetch('/api/v1/roles/').then(res => res.json()),
    fetch('/api/v1/employees/').then(res => res.json()),
    fetch('/api/v1/assignments/').then(res => res.json())
  ]);

  return { roles, employees, assignments };
}

function mockData() {
  return Promise.resolve({
    week_start: "2026-04-13",
    days: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
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

function renderSchedule(data) {
  const grid = document.getElementById('scheduleGrid');

  data.roles.forEach(role => {
    // Role label
    const roleCell = document.createElement('div');
    roleCell.className = 'role-cell';
    roleCell.textContent = role.role_name;
    grid.appendChild(roleCell);

    // Days 0–6
    for (let day = 0; day < 7; day++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell';

      const assignments = (role.days[day] || [])
        .slice()
        .sort((a, b) => a.start.localeCompare(b.start));

      assignments.forEach(a => {
        const div = document.createElement('div');
        div.className = `assignment ${getShiftClass(a.start)}`;
        div.textContent = `${a.employee_name} (${a.start}-${a.end})`;
        cell.appendChild(div);
      });

      grid.appendChild(cell);
    }
  });
}

function getShiftClass(startTime) {
  const hour = parseInt(startTime.split(":")[0]);

  if (hour < 12) return "shift-morning";
  if (hour < 17) return "shift-afternoon";
  if (hour < 21) return "shift-evening";
  return "shift-night";
}

fetchData().then(data => {
  console.log("DATA LOADED:", data);
  renderSchedule(data);
});