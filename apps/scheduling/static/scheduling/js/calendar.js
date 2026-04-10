const monthLabel = document.getElementById("monthAndYear");
const monthSelect = document.getElementById("month");
const yearSelect = document.getElementById("year");
const calendarGrid = document.getElementById("calendar-grid");
const selectedDayTitle = document.getElementById("selected-day-title");
const selectedDayShifts = document.getElementById("selected-day-shifts");
const assignmentShift = document.getElementById("assignment-shift");
const assignmentEmployee = document.getElementById("assignment-employee");
const assignmentForm = document.getElementById("assignment-form");
const shiftForm = document.getElementById("shift-form");
const shiftModal = document.getElementById("shift-modal");
const employeeForm = document.getElementById("employee-form");
const employeeModal = document.getElementById("employee-modal");
const employeeRoster = document.getElementById("employee-roster");
const calendarStatus = document.getElementById("calendar-status");
const summaryLabel = document.getElementById("calendar-summary");

const state = {
    today: new Date(),
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    selectedDateKey: null,
    shifts: [],
    employees: [],
    roles: [],
    assignments: [],
};

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthLabels = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

bootstrap();

function bootstrap() {
    mountToolbar();
    mountModal();
    mountEmployeeModal();
    mountAssignmentForm();
    populateStaticSelects();
    renderCalendar();
    updateMetrics();
    updateSummary();
    hydrateData();
}

async function hydrateData() {
    setStatus("Loading schedule data...");

    const endpoints = [
        { key: "shifts", url: "/api/v1/shifts/" },
        { key: "employees", url: "/api/v1/employees/" },
        { key: "roles", url: "/api/v1/roles/" },
        { key: "assignments", url: "/api/v1/assignments/" },
    ];

    const results = await Promise.allSettled(
        endpoints.map((endpoint) => fetchJson(endpoint.url))
    );

    const failures = [];

    results.forEach((result, index) => {
        const { key } = endpoints[index];
        if (result.status === "fulfilled") {
            state[key] = result.value;
            return;
        }

        failures.push(`${key}: ${result.reason.message}`);
    });

    populateDynamicSelects();
    renderCalendar();
    updateMetrics();

    if (failures.length) {
        setStatus(
            `Loaded partial schedule data. ${failures.join(" | ")}`,
            "error"
        );
    } else {
        setStatus("Schedule loaded.", "success");
    }
}

function mountToolbar() {
    monthSelect.innerHTML = monthLabels
        .map((label, index) => `<option value="${index}">${label}</option>`)
        .join("");

    const startYear = state.currentYear - 3;
    const endYear = state.currentYear + 5;
    const years = [];
    for (let year = startYear; year <= endYear; year += 1) {
        years.push(`<option value="${year}">${year}</option>`);
    }
    yearSelect.innerHTML = years.join("");

    document.getElementById("previous").addEventListener("click", () => {
        if (state.currentMonth === 0) {
            state.currentMonth = 11;
            state.currentYear -= 1;
        } else {
            state.currentMonth -= 1;
        }
        renderCalendar();
    });

    document.getElementById("next").addEventListener("click", () => {
        if (state.currentMonth === 11) {
            state.currentMonth = 0;
            state.currentYear += 1;
        } else {
            state.currentMonth += 1;
        }
        renderCalendar();
    });

    document.getElementById("today-button").addEventListener("click", () => {
        state.currentMonth = state.today.getMonth();
        state.currentYear = state.today.getFullYear();
        state.selectedDateKey = dateKeyFromDate(state.today);
        renderCalendar();
    });

    monthSelect.addEventListener("change", () => {
        state.currentMonth = Number(monthSelect.value);
        renderCalendar();
    });

    yearSelect.addEventListener("change", () => {
        state.currentYear = Number(yearSelect.value);
        renderCalendar();
    });
}

function mountModal() {
    document.getElementById("open-shift-modal").addEventListener("click", () => {
        shiftModal.classList.add("is-open");
        shiftModal.setAttribute("aria-hidden", "false");
    });

    document.getElementById("close-shift-modal").addEventListener("click", closeShiftModal);

    shiftModal.addEventListener("click", (event) => {
        if (event.target === shiftModal) {
            closeShiftModal();
        }
    });

    shiftForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const payload = {
            title: document.getElementById("shift-title").value.trim(),
            role: document.getElementById("shift-role").value || null,
            start_time: toIsoString(document.getElementById("shift-start").value),
            end_time: toIsoString(document.getElementById("shift-end").value),
            notes: document.getElementById("shift-notes").value.trim(),
        };

        try {
            const createdShift = await fetchJson("/api/v1/shifts/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            state.shifts.push(createdShift);
            populateDynamicSelects();
            renderCalendar();
            updateMetrics();
            shiftForm.reset();
            closeShiftModal();
            setStatus("Shift created successfully.", "success");
        } catch (error) {
            setStatus(error.message || "Unable to create the shift.", "error");
        }
    });
}

function mountEmployeeModal() {
    const openButtons = [
        document.getElementById("open-employee-modal"),
        document.getElementById("open-employee-modal-inline"),
    ].filter(Boolean);

    openButtons.forEach((button) => {
        button.addEventListener("click", () => {
            employeeModal.classList.add("is-open");
            employeeModal.setAttribute("aria-hidden", "false");
        });
    });

    document.getElementById("close-employee-modal").addEventListener("click", closeEmployeeModal);

    employeeModal.addEventListener("click", (event) => {
        if (event.target === employeeModal) {
            closeEmployeeModal();
        }
    });

    employeeForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const payload = {
            name: document.getElementById("employee-name").value.trim(),
            email: document.getElementById("employee-email").value.trim(),
        };

        try {
            const createdEmployee = await fetchJson("/api/v1/employees/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            state.employees.push(createdEmployee);
            state.employees.sort((left, right) => left.name.localeCompare(right.name));
            populateDynamicSelects();
            renderEmployeeRoster();
            updateMetrics();
            employeeForm.reset();
            closeEmployeeModal();
            setStatus("Employee created successfully.", "success");
        } catch (error) {
            setStatus(error.message || "Unable to create employee.", "error");
        }
    });
}

function mountAssignmentForm() {
    assignmentForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const payload = {
            shift: assignmentShift.value,
            employee: assignmentEmployee.value,
        };

        try {
            const createdAssignment = await fetchJson("/api/v1/assignments/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            state.assignments.push(createdAssignment);
            await hydrateShiftsOnly();
            setStatus("Employee assigned to shift.", "success");
        } catch (error) {
            setStatus(error.message || "Unable to assign employee to shift.", "error");
        }
    });
}

function populateStaticSelects() {
    state.selectedDateKey = dateKeyFromDate(state.today);
    monthSelect.value = String(state.currentMonth);
    yearSelect.value = String(state.currentYear);
}

function populateDynamicSelects() {
    state.employees.sort((left, right) => left.name.localeCompare(right.name));

    assignmentEmployee.innerHTML = `
        <option value="">Select an employee</option>
        ${state.employees.map((employee) => `<option value="${employee.id}">${employee.name}</option>`).join("")}
    `;

    document.getElementById("shift-role").innerHTML = `
        <option value="">Select a role</option>
        ${state.roles.map((role) => `<option value="${role.id}">${role.name}</option>`).join("")}
    `;

    assignmentShift.innerHTML = `
        <option value="">Select a shift</option>
        ${state.shifts
            .map(
                (shift) => `<option value="${shift.id}">${shift.title} · ${formatDateTimeRange(
                    shift.start_time,
                    shift.end_time
                )}</option>`
            )
            .join("")}
    `;

    renderEmployeeRoster();
}

function renderCalendar() {
    monthLabel.textContent = `${monthLabels[state.currentMonth]} ${state.currentYear}`;
    monthSelect.value = String(state.currentMonth);
    yearSelect.value = String(state.currentYear);

    calendarGrid.innerHTML = "";
    dayLabels.forEach((label) => {
        const cell = document.createElement("div");
        cell.className = "calendar-day--label";
        cell.textContent = label;
        calendarGrid.appendChild(cell);
    });

    const firstOfMonth = new Date(state.currentYear, state.currentMonth, 1);
    const startOfGrid = new Date(firstOfMonth);
    startOfGrid.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

    for (let offset = 0; offset < 42; offset += 1) {
        const currentDate = new Date(startOfGrid);
        currentDate.setDate(startOfGrid.getDate() + offset);
        const currentDateKey = dateKeyFromDate(currentDate);
        const shifts = shiftsForDateKey(currentDateKey);

        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "calendar-day";
        if (currentDate.getMonth() !== state.currentMonth) {
            cell.classList.add("is-outside-month");
        }
        if (currentDateKey === dateKeyFromDate(state.today)) {
            cell.classList.add("is-today");
        }
        if (currentDateKey === state.selectedDateKey) {
            cell.classList.add("is-selected");
        }
        cell.addEventListener("click", () => {
            state.selectedDateKey = currentDateKey;
            renderCalendar();
        });

        const shiftPreview = shifts
            .slice(0, 2)
            .map((shift) => {
                return `
                    <div class="calendar-day__mini-shift">
                        <strong>${escapeHtml(shift.title)}</strong>
                        <span>${formatTime(shift.start_time)} - ${formatTime(shift.end_time)}</span>
                    </div>
                `;
            })
            .join("");

        cell.innerHTML = `
            <div class="calendar-day__head">
                <span class="calendar-day__date">${currentDate.getDate()}</span>
                <span class="calendar-day__count">${shifts.length ? `${shifts.length} shift${shifts.length > 1 ? "s" : ""}` : ""}</span>
            </div>
            <div class="calendar-day__shifts">
                ${shiftPreview || '<div class="empty-state">No shifts</div>'}
            </div>
        `;

        calendarGrid.appendChild(cell);
    }

    renderSelectedDay();
    updateMetrics();
    updateSummary();
}

function renderSelectedDay() {
    if (!state.selectedDateKey) {
        selectedDayTitle.textContent = "Choose a day";
        selectedDayShifts.innerHTML = '<div class="empty-state">Pick a date on the calendar to review the scheduled shifts.</div>';
        return;
    }

    const shifts = shiftsForDateKey(state.selectedDateKey);
    const date = new Date(`${state.selectedDateKey}T00:00:00`);
    selectedDayTitle.textContent = date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });

    if (!shifts.length) {
        selectedDayShifts.innerHTML = '<div class="empty-state">No shifts are scheduled for this day yet.</div>';
        return;
    }

    selectedDayShifts.innerHTML = "";
    shifts.forEach((shift) => {
        selectedDayShifts.appendChild(renderShiftCard(shift));
    });
}

function renderShiftCard(shift) {
    const template = document.getElementById("shift-card-template");
    const fragment = template.content.cloneNode(true);
    const root = fragment.querySelector(".shift-card");

    root.querySelector(".shift-card__role").textContent = shift.role_name || "General role";
    root.querySelector(".shift-card__title").textContent = shift.title;
    root.querySelector(".shift-card__time").textContent = formatDateTimeRange(
        shift.start_time,
        shift.end_time
    );
    root.querySelector(".shift-card__notes").textContent = shift.notes || "No notes added.";

    const employeesNode = root.querySelector(".shift-card__employees");
    const assignedEmployees = (shift.assignments || []).map((assignment) => assignment.employee_name);
    if (assignedEmployees.length) {
        employeesNode.innerHTML = assignedEmployees.map((employeeName) => `<span>${escapeHtml(employeeName)}</span>`).join("");
    } else {
        employeesNode.innerHTML = '<span>Unassigned</span>';
    }

    root.querySelector(".shift-card__assign").addEventListener("click", () => {
        assignmentShift.value = String(shift.id);
        assignmentEmployee.focus();
    });

    return fragment;
}

function shiftsForDateKey(dateKey) {
    return state.shifts.filter((shift) => dateKeyFromIso(shift.start_time) === dateKey);
}

function updateMetrics() {
    document.getElementById("employee-count").textContent = String(state.employees.length);
    document.getElementById("role-count").textContent = String(state.roles.length);

    const monthlyShiftCount = state.shifts.filter((shift) => {
        const date = new Date(shift.start_time);
        return date.getMonth() === state.currentMonth && date.getFullYear() === state.currentYear;
    }).length;

    document.getElementById("shift-count").textContent = String(monthlyShiftCount);
    document.getElementById("assignment-count").textContent = String(state.assignments.length);
}

function updateSummary() {
    const monthShiftCount = state.shifts.filter((shift) => {
        const date = new Date(shift.start_time);
        return date.getMonth() === state.currentMonth && date.getFullYear() === state.currentYear;
    }).length;

    summaryLabel.textContent = `${monthShiftCount} scheduled shift${monthShiftCount === 1 ? "" : "s"} in ${monthLabels[state.currentMonth]}`;
}

function renderEmployeeRoster() {
    if (!state.employees.length) {
        employeeRoster.innerHTML = '<div class="empty-state">No employees added yet.</div>';
        return;
    }

    employeeRoster.innerHTML = state.employees
        .slice(0, 8)
        .map((employee) => {
            const initials = employee.name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0].toUpperCase())
                .join("");

            return `
                <div class="employee-roster__item">
                    <div>
                        <strong>${escapeHtml(employee.name)}</strong>
                        <span>${escapeHtml(employee.email)}</span>
                    </div>
                    <span class="employee-roster__badge">${initials || "TM"}</span>
                </div>
            `;
        })
        .join("");
}

async function hydrateShiftsOnly() {
    const [shiftResponse, assignmentResponse] = await Promise.all([
        fetchJson("/api/v1/shifts/"),
        fetchJson("/api/v1/assignments/"),
    ]);

    state.shifts = shiftResponse;
    state.assignments = assignmentResponse;
    populateDynamicSelects();
    renderCalendar();
    updateMetrics();
}

function closeShiftModal() {
    shiftModal.classList.remove("is-open");
    shiftModal.setAttribute("aria-hidden", "true");
}

function closeEmployeeModal() {
    employeeModal.classList.remove("is-open");
    employeeModal.setAttribute("aria-hidden", "true");
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        throw new Error(formatApiError(data));
    }

    return data;
}

function formatApiError(data) {
    if (!data) {
        return "Something went wrong while talking to the server.";
    }

    if (typeof data === "string") {
        return data;
    }

    const firstField = Object.values(data)[0];
    if (Array.isArray(firstField)) {
        return firstField.join(" ");
    }

    return "The server rejected the request.";
}

function setStatus(message, variant = "") {
    calendarStatus.textContent = message;
    calendarStatus.className = "status-banner";
    if (!message) {
        return;
    }
    calendarStatus.classList.add("is-visible");
    if (variant) {
        calendarStatus.classList.add(`is-${variant}`);
    }
}

function toIsoString(value) {
    return new Date(value).toISOString();
}

function dateKeyFromDate(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

function dateKeyFromIso(value) {
    return dateKeyFromDate(new Date(value));
}

function formatTime(value) {
    return new Date(value).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatDateTimeRange(start, end) {
    return `${new Date(start).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    })} - ${new Date(end).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    })}`;
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
