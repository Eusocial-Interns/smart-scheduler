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
    roles: [
      { id: 1, name: "Manager" },
      { id: 2, name: "Server" },
      { id: 3, name: "Cook" },
      { id: 4, name: "Host"}
    ],
    employees: [
      { id: 1, name: "Elizabeth" },
      { id: 2, name: "Stephen" },
      { id: 3, name: "Mohammed" },
      { id: 4, name: "Gabriel" }
    ],
    assignments: [
      { employee_id: 1, role_id: 1, date: "2026-04-13", shift_start: "09:00", shift_end: "17:00" },
      { employee_id: 2, role_id: 2, date: "2026-04-13", shift_start: "10:00", shift_end: "18:00" },
      { employee_id: 3, role_id: 2, date: "2026-04-14", shift_start: "11:00", shift_end: "19:00" },
      { employee_id: 4, role_id: 3, date: "2026-04-15", shift_start: "08:00", shift_end: "16:00" },
      { employee_id: 2, role_id: 2, date: "2026-04-15", shift_start: "17:00", shift_end: "22:00" },
      { employee_id: 4, role_id: 2, date: "2026-04-17", shift_start: "09:00", shift_end: "17:00" },
      { employee_id: 1, role_id: 2, date: "2026-04-17", shift_start: "09:00", shift_end: "17:00" },
    ]
  });
}

function groupAssignments(assignments) {
  const grouped = {};

  assignments.forEach(a => {
    const day = new Date(a.date).getDay(); // 0–6
    if (!grouped[a.role_id]) grouped[a.role_id] = {};
    if (!grouped[a.role_id][day]) grouped[a.role_id][day] = [];

    grouped[a.role_id][day].push(a);
  });

  return grouped;
}

function renderSchedule({ roles, employees, assignments }) {
  const grid = document.getElementById('scheduleGrid');
  const grouped = groupAssignments(assignments);

  roles.forEach(role => {
    // Role label
    const roleCell = document.createElement('div');
    roleCell.className = 'role-cell';
    roleCell.textContent = role.name;
    grid.appendChild(roleCell);

    // 7 days
    for (let day = 0; day < 7; day++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell';

      const dayAssignments = grouped[role.id]?.[day] || [];

      dayAssignments.forEach(a => {
        const emp = employees.find(e => e.id === a.employee_id);

        const div = document.createElement('div');
        div.className = 'assignment';
        div.textContent = `${emp?.name || 'Unknown'} (${a.shift_start}-${a.shift_end})`;

        cell.appendChild(div);
      });

      grid.appendChild(cell);
    }
  });
}

fetchData().then(data => {
  console.log("DATA LOADED:", data);
  renderSchedule(data);
});