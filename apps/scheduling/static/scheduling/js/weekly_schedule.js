const weeklyGrid = document.getElementById("weekly-grid");
const weekRange = document.getElementById("week-range");
const weeklyStatus = document.getElementById("app-toast");
const scheduleStatus = document.getElementById("schedule-status");
const boardHeader = document.getElementById("weekly-board-header");
const boardFooter = document.getElementById("weekly-board-footer");
const coverageSummary = document.getElementById("coverage-summary");
const managerWorkflow = document.getElementById("manager-workflow");
const weeklyEyebrow = document.getElementById("weekly-eyebrow");
const weeklyTitle = document.getElementById("weekly-title");
const weeklyCopy = document.getElementById("weekly-copy");
const generateDraftButton = document.getElementById("generate-draft");
const copyLastWeekButton = document.getElementById("copy-last-week");
const discardDraftButton = document.getElementById("discard-draft-btn");
const publishWeekButton = document.getElementById("publish-week");
const staffingRequirementsPanel = document.getElementById("staffing-requirements-panel");
const staffingRequirementForm = document.getElementById("staffing-requirement-form");
const requirementList = document.getElementById("requirement-list");
const requirementTitle = document.getElementById("requirement-title");
const requirementRole = document.getElementById("requirement-role");
const requirementDayButtons = document.getElementById("requirement-day-buttons");
const employeeBenchPanel = document.getElementById("employee-bench-panel");
const employeeBenchList = document.getElementById("employee-bench-list");
const shiftEditModal = document.getElementById("shift-edit-modal");
const shiftEditForm = document.getElementById("shift-edit-form");
const shiftEditEmployee = document.getElementById("shift-edit-employee");
const shiftEditService = document.getElementById("shift-edit-service");
const shiftEditArrival = document.getElementById("shift-edit-arrival");
const shiftEditCancel = document.getElementById("shift-edit-cancel");
const shiftEditDelete = document.getElementById("shift-edit-delete");

const closedDaysPanel = document.getElementById("closed-days-panel");
const closedDayToggles = document.getElementById("closed-day-toggles");
const closedDayNoteRow = document.getElementById("closed-day-note-row");
const closedDayNoteInput = document.getElementById("closed-day-note-input");
const closedDayNoteSave = document.getElementById("closed-day-note-save");

const _urlWeek = new URLSearchParams(window.location.search).get("week");
const _initialWeek = _urlWeek ? new Date(_urlWeek + "T00:00:00") : startOfWeek(new Date());

const state = {
    me: null,
    weekStart: _initialWeek,
    schedule: null,
    roles: [],
    employees: [],
    staffingRequirements: [],
    requirementGroups: [],
    expandedRoleGroups: new Set(),
    operatingHours: {},
    closedDays: [],          // [{id, date, note}] for current week
    editingClosedDayId: null, // id of closed day whose note is being edited
    lastGenerationSummary: null,
    draggedAssignmentId: null,
    draggedAssignmentCard: null,
    draggedEmployeeId: null,
    dropHandled: false,
    editingAssignmentId: null,
    editingRequirementGroup: null,
    newShiftTarget: null,
    pendingForceAssign: null,
    activeDepartment: null,    // manager: null = All, "foh" | "boh" | "management"
    employeeViewDept: null,    // employee: null = My Schedule, "foh" | "boh" | "management"
    viewingSnapshot: false,
};

const dayOptions = [
    ["0", "Monday"],
    ["1", "Tuesday"],
    ["2", "Wednesday"],
    ["3", "Thursday"],
    ["4", "Friday"],
    ["5", "Saturday"],
    ["6", "Sunday"],
];

const serviceOptions = [
    "Dinner Service",
    "Opener",
    "Closer",
];

bootstrapWeeklySchedule();

function bootstrapWeeklySchedule() {
    document.getElementById("previous-week").addEventListener("click", () => {
        state.weekStart.setDate(state.weekStart.getDate() - 7);
        state.lastGenerationSummary = null;
        state.viewingSnapshot = false;
        loadSchedule();
        loadClosedDays();
    });

    document.getElementById("next-week").addEventListener("click", () => {
        state.weekStart.setDate(state.weekStart.getDate() + 7);
        state.lastGenerationSummary = null;
        state.viewingSnapshot = false;
        loadSchedule();
        loadClosedDays();
    });

    document.getElementById("current-week").addEventListener("click", () => {
        state.weekStart = startOfWeek(new Date());
        state.lastGenerationSummary = null;
        state.viewingSnapshot = false;
        loadSchedule();
        loadClosedDays();
    });

    staffingRequirementForm.addEventListener("submit", createStaffingRequirement);
    requirementList.addEventListener("click", handleRequirementCardClick);

    document.getElementById("req-edit-form").addEventListener("submit", saveRequirementEdit);
    document.getElementById("req-edit-cancel").addEventListener("click", closeRequirementEditor);
    document.getElementById("req-edit-delete").addEventListener("click", deleteRequirementGroup);
    document.getElementById("req-edit-modal").addEventListener("click", (e) => {
        if (e.target === document.getElementById("req-edit-modal")) closeRequirementEditor();
    });

    document.getElementById("req-edit-days").innerHTML = dayOptions
        .map(([value, label]) => `<button class="day-toggle" type="button" data-day="${value}">${label.slice(0, 3)}</button>`)
        .join("");
    document.getElementById("req-edit-days").addEventListener("click", (e) => {
        const btn = e.target.closest(".day-toggle");
        if (btn) btn.classList.toggle("is-selected");
    });
    document.getElementById("req-edit-weekdays").addEventListener("click", () => selectReqEditDays([0,1,2,3,4]));
    document.getElementById("req-edit-weekend").addEventListener("click", () => selectReqEditDays([5,6]));
    document.getElementById("req-edit-all").addEventListener("click", () => selectReqEditDays([0,1,2,3,4,5,6]));
    weeklyGrid.addEventListener("dragstart", startAssignmentDrag);
    weeklyGrid.addEventListener("dragend", endAssignmentDrag);
    weeklyGrid.addEventListener("dragover", allowAssignmentDrop);
    weeklyGrid.addEventListener("dragleave", clearDropTarget);
    weeklyGrid.addEventListener("drop", dropAssignment);
    weeklyGrid.addEventListener("click", openShiftEditor);
    employeeBenchList.addEventListener("dragstart", startEmployeeDrag);
    employeeBenchList.addEventListener("dragend", endEmployeeDrag);
    document.addEventListener("dragover", handleDragScroll);
    document.addEventListener("dragend", cancelDragScroll);
    document.addEventListener("drop", cancelDragScroll);
    shiftEditForm.addEventListener("submit", saveShiftEdit);
    shiftEditCancel.addEventListener("click", closeShiftEditor);
    shiftEditDelete.addEventListener("click", deleteAssignment);
    shiftEditModal.addEventListener("click", (event) => {
        if (event.target === shiftEditModal) {
            closeShiftEditor();
        }
    });
    document.getElementById("slot-fill-cancel").addEventListener("click", closeSlotFillModal);
    document.getElementById("slot-fill-delete")?.addEventListener("click", deleteOpenSlot);
    document.getElementById("slot-fill-modal").addEventListener("click", (event) => {
        if (event.target === document.getElementById("slot-fill-modal")) closeSlotFillModal();
    });
    document.getElementById("unavailability-cancel").addEventListener("click", closeUnavailabilityModal);
    document.getElementById("unavailability-force").addEventListener("click", forceAssign);
    generateDraftButton.addEventListener("click", generateDraft);
    copyLastWeekButton.addEventListener("click", copyLastWeek);
    discardDraftButton.addEventListener("click", discardDraft);
    publishWeekButton.addEventListener("click", publishWeek);
    document.getElementById("view-snapshot-btn").addEventListener("click", () => {
        state.viewingSnapshot = !state.viewingSnapshot;
        if (state.schedule) renderSchedule(state.schedule);
    });
    document.getElementById("back-to-draft-btn").addEventListener("click", () => {
        state.viewingSnapshot = false;
        if (state.schedule) renderSchedule(state.schedule);
    });
    document.getElementById("dept-tabs").addEventListener("click", (e) => {
        const btn = e.target.closest(".dept-tab");
        if (!btn) return;
        document.querySelectorAll(".dept-tab").forEach((t) => t.classList.toggle("is-active", t === btn));
        if (isManager()) {
            state.activeDepartment = btn.dataset.dept || null;
            if (state.schedule) renderSchedule(state.schedule);
            renderEmployees();
            renderStaffingRequirements();
        } else {
            state.employeeViewDept = btn.dataset.dept || null;
            loadSchedule();
        }
    });
    closedDayToggles.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-action='toggle-closed-day']");
        if (btn) toggleClosedDay(btn.dataset.date, btn.dataset.closedDayId || null);
    });
    closedDayNoteSave.addEventListener("click", saveClosedDayNote);
    const serviceHtml = serviceOptions
        .map((service) => `<option value="${service}">${service}</option>`)
        .join("");
    requirementTitle.innerHTML = serviceHtml;
    shiftEditService.innerHTML = serviceHtml;
    document.getElementById("req-edit-service").innerHTML = serviceHtml;

    requirementDayButtons.innerHTML = dayOptions
        .map(([value, label]) => `<button class="day-toggle" type="button" data-day="${value}">${label.slice(0, 3)}</button>`)
        .join("");
    requirementDayButtons.addEventListener("click", (event) => {
        const btn = event.target.closest(".day-toggle");
        if (btn) {
            btn.classList.toggle("is-selected");
        }
    });
    document.getElementById("day-shortcut-weekdays").addEventListener("click", () => selectDays([0, 1, 2, 3, 4]));
    document.getElementById("day-shortcut-weekend").addEventListener("click", () => selectDays([5, 6]));
    document.getElementById("day-shortcut-all").addEventListener("click", () => selectDays([0, 1, 2, 3, 4, 5, 6]));

    buildTimeSelects();
    loadCurrentUser();
    loadRoles();
    loadOperatingHours();
    loadSchedule();
    loadStaffingRequirements();
}

function buildTimeSelects() {
    const times = [];
    for (let h = 4; h < 24; h++) {
        for (const m of [0, 30]) {
            const hh = String(h).padStart(2, "0");
            const mm = String(m).padStart(2, "0");
            const suffix = h < 12 ? "AM" : "PM";
            const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            times.push({ value: `${hh}:${mm}`, label: `${h12}:${mm} ${suffix}` });
        }
    }
    times.push({ value: "00:00", label: "12:00 AM (midnight)" });

    const optionsHtml = times.map(t => `<option value="${t.value}">${t.label}</option>`).join("");
    const optionalHtml = `<option value="">Until close</option>` + optionsHtml;

    ["requirement-start", "req-edit-start"].forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = optionsHtml;
        el.value = "17:00";
    });
    ["requirement-end", "req-edit-end"].forEach(id => {
        document.getElementById(id).innerHTML = optionalHtml;
    });
}

async function loadOperatingHours() {
    try {
        const hours = await fetchJson("/api/v1/operating-hours/");
        state.operatingHours = Object.fromEntries(hours.map((h) => [h.day_of_week, h]));
    } catch {
        // non-fatal; closeTimeFor falls back to 22:00
    }
}

async function loadCurrentUser() {
    try {
        state.me = await fetchJson("/api/v1/employees/me/");
        if (state.me.account_type === "manager") {
            weeklyEyebrow.textContent = "Manager Schedule";
            weeklyTitle.textContent = "Build and publish the week";
            weeklyCopy.textContent = "Set the arrivals you need, generate a fresh draft from approved availability, fix any gaps, then publish once.";
            boardHeader.hidden = false;
            boardFooter.hidden = false;
            generateDraftButton.hidden = false;
            copyLastWeekButton.hidden = false;
            publishWeekButton.hidden = false;
            managerWorkflow.hidden = false;
            staffingRequirementsPanel.hidden = false;
            employeeBenchPanel.hidden = false;
            closedDaysPanel.hidden = false;
            document.getElementById("dept-tabs").hidden = false;
            loadEmployees();
            loadClosedDays();
        } else {
            const deptLabels = { foh: "Front of House", boh: "Back of House", management: "Management" };
            const deptOrder = ["foh", "boh", "management"];
            const myDepts = (state.me.role_departments || [])
                .filter((d) => deptOrder.includes(d))
                .sort((a, b) => deptOrder.indexOf(a) - deptOrder.indexOf(b));
            if (myDepts.length > 0) {
                const tabsEl = document.getElementById("dept-tabs");
                tabsEl.innerHTML = `
                    <button class="dept-tab is-active" type="button" data-dept="">My Schedule</button>
                    ${myDepts.map((d) => `<button class="dept-tab dept-tab--${d}" type="button" data-dept="${d}">${deptLabels[d]}</button>`).join("")}
                `;
                tabsEl.hidden = false;
            }
        }
        if (state.schedule) {
            renderSchedule(state.schedule);
        }
    } catch (error) {
        setStatus(error.message || "Unable to load current user.", "error");
    }
}

async function loadEmployees() {
    try {
        state.employees = await fetchJson("/api/v1/employees/");
        renderEmployees();
    } catch (error) {
        setStatus(error.message || "Unable to load employees.", "error");
    }
}

function renderEmployees() {
    if (!state.employees.length) {
        employeeBenchList.innerHTML = '<div class="empty-state">No employees created yet.</div>';
        return;
    }

    let employees = state.employees;
    if (state.activeDepartment) {
        employees = employees.filter((emp) => {
            const primaryRole = state.roles.find((r) => Number(r.id) === Number(emp.primary_role));
            if (primaryRole?.department === state.activeDepartment) return true;
            return (emp.roles || []).some((rid) => {
                const role = state.roles.find((r) => Number(r.id) === Number(rid));
                return role?.department === state.activeDepartment;
            });
        });
    }

    if (!employees.length) {
        employeeBenchList.innerHTML = '<div class="empty-state">No employees for this department.</div>';
        return;
    }

    employeeBenchList.innerHTML = employees.map((employee) => `
        <article class="employee-chip" draggable="true" data-employee-id="${employee.id}">
            <strong draggable="false">${escapeHtml(employee.name)}</strong>
            <small draggable="false">${escapeHtml(employee.primary_role_name || (employee.role_names && employee.role_names[0]) || "No role")}</small>
        </article>
    `).join("");
}

async function loadRoles() {
    try {
        state.roles = await fetchJson("/api/v1/roles/");
        requirementRole.innerHTML = `
            <option value="">Select a role</option>
            ${state.roles.map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join("")}
        `;
    } catch (error) {
        setStatus(error.message || "Unable to load roles.", "error");
    }
}

async function loadStaffingRequirements() {
    try {
        state.staffingRequirements = await fetchJson("/api/v1/staffing-requirements/?active=true");
        renderStaffingRequirements();
    } catch (error) {
        setStatus(error.message || "Unable to load staffing requirements.", "error");
    }
}

async function loadSchedule() {
    weeklyGrid.innerHTML = '<div class="weekly-loading">Loading weekly schedule...</div>';

    const reqEnd = new Date(state.weekStart);
    reqEnd.setDate(reqEnd.getDate() + 6);
    weekRange.textContent = `${formatDate(dateKey(state.weekStart))} – ${formatDate(dateKey(reqEnd))}`;

    try {
        let scheduleUrl = `/api/v1/schedule/week/?start=${dateKey(state.weekStart)}`;
        if (!isManager() && state.employeeViewDept) {
            scheduleUrl += `&department=${state.employeeViewDept}`;
        }
        const schedule = await fetchJson(scheduleUrl);
        state.schedule = schedule;
        renderSchedule(schedule);
    } catch (error) {
        weeklyGrid.innerHTML = '<div class="weekly-loading">Unable to load weekly schedule.</div>';
        setStatus(error.message || "Unable to load weekly schedule.", "error");
    }
}

function renderSchedule(schedule) {
    weekRange.textContent = `${formatDate(schedule.week_start)} – ${formatDate(schedule.week_end)}`;

    let effectiveStatus = schedule.status;
    if (isManager() && state.activeDepartment) {
        const deptStatuses = schedule.department_statuses || {};
        effectiveStatus = deptStatuses[state.activeDepartment] || schedule.status || "draft";
    }
    const isPublished = effectiveStatus === "published";
    const hasPendingChanges = isPublished && schedule.has_unpublished_changes;
    if (isManager()) {
        if (state.viewingSnapshot) {
            scheduleStatus.textContent = "Published";
            scheduleStatus.className = "pill pill--published";
        } else if (hasPendingChanges) {
            scheduleStatus.textContent = "Changes Pending";
            scheduleStatus.className = "pill pill--pending";
        } else {
            scheduleStatus.textContent = isPublished ? "Published" : "Unpublished";
            scheduleStatus.className = `pill ${isPublished ? "pill--published" : "pill--unpublished"}`;
        }
        scheduleStatus.hidden = false;
        if (publishWeekButton) {
            if (state.viewingSnapshot) {
                publishWeekButton.textContent = "Published";
                publishWeekButton.disabled = true;
                publishWeekButton.className = "button-ghost";
            } else {
                publishWeekButton.textContent = hasPendingChanges ? "Republish" : "Publish";
                publishWeekButton.disabled = false;
                publishWeekButton.className = "button-secondary";
            }
        }
    } else {
        scheduleStatus.hidden = true;
    }

    // Reset viewingSnapshot if no snapshot is available
    if (!hasPendingChanges || !schedule.published_snapshot) {
        state.viewingSnapshot = false;
    }

    const snapshotBtn = document.getElementById("view-snapshot-btn");
    const pendingBanner = document.getElementById("pending-changes-banner");
    const snapshotBanner = document.getElementById("snapshot-banner");

    if (isManager() && hasPendingChanges && schedule.published_snapshot) {
        // Toggle button
        if (snapshotBtn) {
            snapshotBtn.hidden = false;
            snapshotBtn.textContent = state.viewingSnapshot ? "Back to current draft" : "View published version";
        }
        // Banners
        if (state.viewingSnapshot) {
            if (pendingBanner) pendingBanner.hidden = true;
            if (snapshotBanner) {
                if (schedule.published_at) {
                    const lastPub = new Date(schedule.published_at);
                    const dateStr = lastPub.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                    snapshotBanner.querySelector(".snapshot-banner__date").textContent = dateStr;
                }
                snapshotBanner.hidden = false;
            }
        } else {
            if (snapshotBanner) snapshotBanner.hidden = true;
            if (pendingBanner) {
                if (schedule.published_at) {
                    const lastPub = new Date(schedule.published_at);
                    const dateStr = lastPub.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                    pendingBanner.querySelector(".pending-banner__date").textContent = `Last published ${dateStr}`;
                }
                pendingBanner.hidden = false;
            }
        }
        // Disable editing controls in snapshot mode
        if (generateDraftButton) generateDraftButton.disabled = state.viewingSnapshot;
        if (copyLastWeekButton) copyLastWeekButton.disabled = state.viewingSnapshot;
        if (discardDraftButton) {
            discardDraftButton.hidden = state.viewingSnapshot;
            discardDraftButton.disabled = state.viewingSnapshot;
        }
        if (publishWeekButton) publishWeekButton.disabled = state.viewingSnapshot;
    } else {
        if (snapshotBtn) snapshotBtn.hidden = true;
        if (snapshotBanner) snapshotBanner.hidden = true;
        if (pendingBanner) pendingBanner.hidden = true;
        if (generateDraftButton) generateDraftButton.disabled = false;
        if (copyLastWeekButton) copyLastWeekButton.disabled = false;
        if (discardDraftButton) discardDraftButton.hidden = true;
        if (publishWeekButton) publishWeekButton.disabled = false;
    }

    weeklyGrid.style.setProperty("--day-count", String(Math.max(schedule.days.length, 1)));
    renderCoverageSummary();

    weeklyGrid.innerHTML = `
        <div class="weekly-header weekly-role">Role</div>
        ${schedule.days.map((day) => `
            <div class="weekly-header${day.closed ? " weekly-header--closed" : ""}">
                <strong>${escapeHtml(day.label)}</strong>
                <span>${formatDate(day.date)}</span>
                ${day.closed ? `<span class="weekly-header__closed-badge">Closed${day.closed_note ? " · " + escapeHtml(day.closed_note) : ""}</span>` : ""}
            </div>
        `).join("")}
    `;

    let rolesToRender = (state.viewingSnapshot && schedule.published_snapshot)
        ? schedule.published_snapshot
        : schedule.roles;

    // Department filter (manager only)
    if (isManager() && state.activeDepartment) {
        rolesToRender = rolesToRender.filter((role) => role.role_department === state.activeDepartment);
    }

    if (!isManager() && state.me && !state.employeeViewDept) {
        const myId = state.me.id;
        rolesToRender = rolesToRender
            .map((role) => {
                const filteredDays = {};
                for (const [day, assignments] of Object.entries(role.days)) {
                    filteredDays[day] = assignments.filter((a) => a.employee_id === myId);
                }
                return { ...role, days: filteredDays };
            })
            .filter((role) => Object.values(role.days).some((assignments) => assignments.length > 0));
    }

    if (!rolesToRender.length || !schedule.days.length) {
        let emptyMessage;
        if (isManager()) {
            emptyMessage = "No generated schedule yet. Set coverage presets, then generate a draft.";
        } else if (schedule.status !== "published") {
            emptyMessage = "This week's schedule hasn't been published yet.";
        } else {
            emptyMessage = "You are not scheduled for this week yet.";
        }
        weeklyGrid.innerHTML += `<div class="weekly-loading">${emptyMessage}</div>`;
        return;
    }

    const deptOrder = ["management", "boh", "foh"];
    const deptLabels = { management: "Management", boh: "Back of House", foh: "Front of House" };
    const showDividers = isManager() && !state.activeDepartment;

    if (showDividers) {
        const grouped = {};
        deptOrder.forEach((d) => { grouped[d] = []; });
        rolesToRender.forEach((role) => {
            const dept = role.role_department || "foh";
            if (grouped[dept]) grouped[dept].push(role);
            else grouped["foh"].push(role);
        });

        deptOrder.forEach((dept) => {
            if (!grouped[dept].length) return;
            weeklyGrid.insertAdjacentHTML(
                "beforeend",
                `<div class="weekly-dept-divider">${deptLabels[dept]}</div>`
            );
            grouped[dept].forEach((role) => renderRoleRow(role, schedule));
        });
    } else {
        rolesToRender.forEach((role) => renderRoleRow(role, schedule));
    }
}

function renderRoleRow(role, schedule) {
    weeklyGrid.insertAdjacentHTML(
        "beforeend",
        `<div class="weekly-role">${escapeHtml(role.role_name)}</div>`
    );
    schedule.days.forEach((day) => {
        const assignments = (role.days[String(day.index)] || [])
            .slice()
            .sort((a, b) => shiftSortOrder(a.shift_title) - shiftSortOrder(b.shift_title));
        const managerEmptyLabel = isManager() ? "Open" : "";
        const isClosed = !!day.closed;
        weeklyGrid.insertAdjacentHTML(
            "beforeend",
            `<div class="weekly-cell${!isClosed && assignments.length ? "" : " is-empty"}${isClosed ? " weekly-cell--closed" : ""}" data-role-id="${role.role_id || ""}" data-role-name="${escapeHtml(role.role_name || "")}" data-date="${escapeHtml(day.date)}">
                ${isClosed ? '<span class="weekly-cell__closed">Closed</span>' : (assignments.length ? assignments.map(renderAssignment).join("") : managerEmptyLabel)}
            </div>`
        );
    });
}

function renderCoverageSummary() {
    if (!isManager()) {
        coverageSummary.hidden = true;
        return;
    }
    if (state.lastGenerationSummary) {
        const summary = state.lastGenerationSummary;
        const invalidRequirements = summary.invalid_requirements || [];
        if (invalidRequirements.length || summary.open_slots.length) {
            const issueCount = invalidRequirements.length + summary.open_slots.length;
            const grouped = groupOpenSlots(summary.open_slots);
            const items = [
                ...invalidRequirements.map(formatInvalidRequirement),
                ...grouped.map(formatGroupedSlot),
            ];
            coverageSummary.hidden = false;
            coverageSummary.innerHTML = `
                <strong>${issueCount} open slot${issueCount === 1 ? "" : "s"} to fill</strong>
                <ul class="coverage-issue-list">
                    ${items.map(item => `<li>${item}</li>`).join("")}
                </ul>
            `;
            coverageSummary.classList.add("is-warning");
            return;
        }
    }
    // No issues or no summary yet — keep hidden
    coverageSummary.hidden = true;
    coverageSummary.classList.remove("is-warning");
}

function groupOpenSlots(slots) {
    const map = new Map();
    for (const slot of slots) {
        const key = `${slot.role}|${slot.title}|${slot.start_time}`;
        if (!map.has(key)) {
            map.set(key, { role: slot.role, title: slot.title, start_time: slot.start_time, open_count: slot.open_count, dates: [] });
        }
        map.get(key).dates.push(slot.date);
    }
    return Array.from(map.values());
}

function formatGroupedSlot(slot) {
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const days = slot.dates
        .map(d => dayLabels[(new Date(`${d}T00:00:00`).getDay() + 6) % 7])
        .join(", ");
    return `${slot.open_count} ${slot.role} · ${slot.title} · ${days} at ${formatTimeOnly(slot.start_time)}`;
}

function formatOpenSlot(slot) {
    return `${slot.open_count} ${slot.role} for ${slot.title} on ${formatDate(slot.date)} at ${formatTimeOnly(slot.start_time)}`;
}

function formatInvalidRequirement(requirement) {
    return `${requirement.title} ${requirement.role} on ${formatDate(requirement.date)} at ${formatTimeOnly(requirement.start_time)}: ${requirement.message}`;
}

function groupRequirements(requirements) {
    const map = new Map();
    for (const req of requirements) {
        const key = `${req.title}|${req.role}|${req.start_time}|${req.end_time ?? ""}|${req.required_count}`;
        if (!map.has(key)) {
            map.set(key, {
                ids: [],
                days: [],
                title: req.title,
                role_id: req.role,
                role_name: req.role_name,
                start_time: req.start_time,
                end_time: req.end_time ?? null,
                required_count: req.required_count,
            });
        }
        const group = map.get(key);
        group.ids.push(req.id);
        group.days.push(req.day_of_week);
    }
    return Array.from(map.values());
}

function formatDayRange(days) {
    const sorted = [...days].sort((a, b) => a - b);
    const key = sorted.join(",");
    if (key === "0,1,2,3,4,5,6") return "Every day";
    if (key === "0,1,2,3,4") return "Weekdays";
    if (key === "5,6") return "Weekend";
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return sorted.map((d) => labels[d]).join(", ");
}

function renderStaffingRequirements() {
    state.requirementGroups = groupRequirements(state.staffingRequirements);

    let groups = state.requirementGroups;
    if (state.activeDepartment) {
        groups = groups.filter((g) => {
            const role = state.roles.find((r) => Number(r.id) === Number(g.role_id));
            return role?.department === state.activeDepartment;
        });
    }

    if (!groups.length) {
        requirementList.innerHTML = '<div class="empty-state">No coverage presets saved yet.</div>';
        return;
    }

    const deptOrder = [
        { key: "foh", label: "Front of House" },
        { key: "boh", label: "Back of House" },
        { key: "management", label: "Management" },
    ];

    // Build dept → role → presets map
    const byDept = new Map();
    for (const group of groups) {
        const role = state.roles.find((r) => Number(r.id) === Number(group.role_id));
        const dept = role?.department || "foh";
        if (!byDept.has(dept)) byDept.set(dept, new Map());
        const roleMap = byDept.get(dept);
        if (!roleMap.has(group.role_name)) roleMap.set(group.role_name, []);
        roleMap.get(group.role_name).push(group);
    }

    requirementList.innerHTML = deptOrder.map(({ key, label }) => {
        const roleMap = byDept.get(key);
        if (!roleMap?.size) return "";

        const roleGroupsHtml = Array.from(roleMap.entries()).map(([role_name, presets]) => {
            const isOpen = state.expandedRoleGroups.has(role_name);
            return `
                <div class="req-role-group${isOpen ? " is-open" : ""}">
                    <button class="req-role-group__header" type="button" data-action="toggle-role-group" data-role-name="${escapeHtml(role_name)}">
                        <span class="req-role-group__name">${escapeHtml(role_name)}</span>
                        <span class="req-role-group__count">${presets.length} preset${presets.length === 1 ? "" : "s"}</span>
                        <svg class="req-role-group__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    <div class="req-role-group__body"${isOpen ? "" : " hidden"}>
                        ${presets.map((group) => {
                            const index = state.requirementGroups.indexOf(group);
                            const timeRange = group.end_time
                                ? `${formatTimeOnly(group.start_time)} – ${formatTimeOnly(group.end_time)}`
                                : `${formatTimeOnly(group.start_time)} – close`;
                            return `
                                <article class="requirement-card" data-group-index="${index}" role="button" tabindex="0">
                                    <div>
                                        <strong>${escapeHtml(group.title)}</strong>
                                        <span>${escapeHtml(formatDayRange(group.days))} · ${timeRange} · ${group.required_count} needed</span>
                                    </div>
                                    <span class="requirement-card__edit-hint">Edit</span>
                                </article>
                            `;
                        }).join("")}
                    </div>
                </div>
            `;
        }).join("");

        return `
            <div class="req-dept-group">
                <div class="req-dept-group__header req-dept-group__header--${key}">${escapeHtml(label)}</div>
                <div class="req-dept-group__body">${roleGroupsHtml}</div>
            </div>
        `;
    }).join("");
}

function renderAssignment(assignment) {
    const systemNotes = new Set([
        "Generated from staffing requirements.",
        "Manager edited assignment.",
        "Copied from last week.",
    ]);
    const notes = systemNotes.has(assignment.notes) ? "" : assignment.notes;
    const canDrag = isManager() && !state.viewingSnapshot && assignment.assignment_id && !assignment.is_open;
    const dataAttributes = [
        `data-shift-id="${assignment.shift_id}"`,
        assignment.assignment_id ? `data-assignment-id="${assignment.assignment_id}"` : "",
        assignment.employee_id ? `data-employee-id="${assignment.employee_id}"` : "",
        assignment.role_id ? `data-role-id="${assignment.role_id}"` : "",
        `data-shift-title="${escapeHtml(assignment.shift_title)}"`,
        `data-arrival-time="${normalizeTimeFromDate(assignment.start_time)}"`,
        `data-employee-name="${escapeHtml(assignment.employee_name)}"`,
        assignment.is_open ? 'data-open-slot="true"' : "",
        canDrag ? 'draggable="true"' : "",
    ].filter(Boolean).join(" ");

    if (assignment.is_open) {
        return `
            <article class="weekly-assignment weekly-assignment--open" ${dataAttributes}>
                <strong draggable="false">Open slot</strong>
                <span draggable="false" class="weekly-assignment__time">${escapeHtml(assignment.display_time)}</span>
                <small draggable="false">${escapeHtml(assignment.shift_title)}</small>
            </article>
        `;
    }

    return `
        <article class="weekly-assignment weekly-assignment--${shiftClass(assignment.shift_title)}" ${dataAttributes}>
            <strong draggable="false">${escapeHtml(assignment.employee_name)}</strong>
            <span draggable="false" class="weekly-assignment__time">${escapeHtml(assignment.display_time)}</span>
            <small draggable="false">${escapeHtml(assignment.shift_title)}</small>
            ${notes ? `<small draggable="false">${escapeHtml(notes)}</small>` : ""}
        </article>
    `;
}

function isManager() {
    return state.me?.account_type === "manager";
}

function startAssignmentDrag(event) {
    const card = event.target.closest(".weekly-assignment[data-assignment-id]");
    if (!isManager() || state.viewingSnapshot || !card) {
        return;
    }

    state.draggedAssignmentId = card.dataset.assignmentId;
    state.draggedAssignmentCard = card;
    state.draggedEmployeeId = null;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggedAssignmentId);
}

function endAssignmentDrag() {
    const assignmentId = state.draggedAssignmentId;
    const wasHandled = state.dropHandled;
    state.draggedAssignmentId = null;
    state.draggedAssignmentCard = null;
    state.dropHandled = false;
    clearDragClasses();

    if (!wasHandled && assignmentId) {
        deleteAssignmentById(assignmentId);
    }
}

function startEmployeeDrag(event) {
    const chip = event.target.closest(".employee-chip[data-employee-id]");
    if (!isManager() || state.viewingSnapshot || !chip) {
        return;
    }

    state.draggedEmployeeId = chip.dataset.employeeId;
    state.draggedAssignmentId = null;
    chip.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", state.draggedEmployeeId);
}

function endEmployeeDrag() {
    state.draggedEmployeeId = null;
    clearDragClasses();
}

function clearDragClasses() {
    document.querySelectorAll(".is-dragging, .is-drop-target").forEach((element) => {
        element.classList.remove("is-dragging", "is-drop-target");
    });
}

// --- Drag-edge auto-scroll ---
const DRAG_SCROLL_ZONE = 80;  // px from viewport edge to activate
const DRAG_SCROLL_MAX  = 14;  // max px scrolled per animation frame
let _dragScrollFrame = null;

function handleDragScroll(event) {
    const y = event.clientY;
    const vh = window.innerHeight;
    cancelDragScroll();

    let delta = 0;
    if (y < DRAG_SCROLL_ZONE) {
        delta = -Math.round(DRAG_SCROLL_MAX * (1 - y / DRAG_SCROLL_ZONE));
    } else if (y > vh - DRAG_SCROLL_ZONE) {
        delta = Math.round(DRAG_SCROLL_MAX * (1 - (vh - y) / DRAG_SCROLL_ZONE));
    }
    if (delta !== 0) {
        const step = () => { window.scrollBy(0, delta); _dragScrollFrame = requestAnimationFrame(step); };
        _dragScrollFrame = requestAnimationFrame(step);
    }
}

function cancelDragScroll() {
    if (_dragScrollFrame !== null) {
        cancelAnimationFrame(_dragScrollFrame);
        _dragScrollFrame = null;
    }
}

// --- Unavailability modal ---

const UNAVAILABLE_MSG = "Employee is unavailable during this shift.";
const ROLE_MISMATCH_PREFIX = "Employee does not have the required role:";
const ALREADY_SCHEDULED_SUBSTR = " is already scheduled as ";

async function tryCreateAssignment(employeeId, shiftId, employeeName) {
    try {
        await fetchJson("/api/v1/assignments/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employee: Number(employeeId), shift: Number(shiftId) }),
        });
        return true;
    } catch (error) {
        if (error.message === UNAVAILABLE_MSG) {
            await openUnavailabilityModal(employeeId, shiftId, employeeName, null, true);
            return false;
        }
        if (error.message && error.message.startsWith(ROLE_MISMATCH_PREFIX)) {
            const roleName = error.message.slice(ROLE_MISMATCH_PREFIX.length).trim().replace(/\.$/, "");
            openUnavailabilityModal(
                employeeId, shiftId, employeeName,
                `${employeeName || "This employee"} does not have role: ${roleName}.`,
                true
            );
            return false;
        }
        if (error.message && error.message.includes(ALREADY_SCHEDULED_SUBSTR)) {
            // Hard conflict — person cannot be in two places; no force option
            openUnavailabilityModal(employeeId, shiftId, employeeName, error.message, false);
            return false;
        }
        throw error;
    }
}

async function openUnavailabilityModal(employeeId, shiftId, employeeName, knownDetail, allowForce = true) {
    state.pendingForceAssign = { employeeId: Number(employeeId), shiftId: Number(shiftId) };
    document.getElementById("unavailability-employee-name").textContent = employeeName || "This employee";
    const detailEl = document.getElementById("unavailability-detail");
    detailEl.textContent = knownDetail != null ? knownDetail : "Checking…";
    document.getElementById("unavailability-force").hidden = !allowForce;
    document.getElementById("unavailability-modal").hidden = false;

    if (knownDetail != null) return;

    try {
        const result = await fetchJson(`/api/v1/assignments/unavailability-reason/?employee=${employeeId}&shift=${shiftId}`);
        detailEl.textContent = result.detail || "Unavailable for this shift.";
    } catch {
        detailEl.textContent = "Could not load reason.";
    }
}

function closeUnavailabilityModal() {
    state.pendingForceAssign = null;
    document.getElementById("unavailability-modal").hidden = true;
    document.getElementById("unavailability-force").hidden = false; // reset for next open
}

async function forceAssign() {
    const { employeeId, shiftId } = state.pendingForceAssign || {};
    if (!employeeId || !shiftId) return;
    closeUnavailabilityModal();
    try {
        await fetchJson("/api/v1/assignments/force-create/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employee: employeeId, shift: shiftId }),
        });
        state.lastGenerationSummary = null;
        await loadSchedule();
        setStatus("Employee added to schedule.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to add employee.", "error");
    }
}

function allowAssignmentDrop(event) {
    const targetCard = dragTargetFor(event);
    if (!targetCard) {
        return;
    }

    event.preventDefault();
    targetCard.classList.add("is-drop-target");
    event.dataTransfer.dropEffect = state.draggedEmployeeId ? "copy" : "move";
}

function clearDropTarget(event) {
    const target = event.target.closest(".weekly-assignment[data-shift-id], .weekly-cell");
    if (target) {
        target.classList.remove("is-drop-target");
    }
}

async function dropAssignment(event) {
    const target = dragTargetFor(event);
    if (!target) {
        return;
    }

    event.preventDefault();
    state.dropHandled = true;
    const isCell = target.classList.contains("weekly-cell");

    if (state.draggedEmployeeId) {
        if (isCell) {
            const existingCard = target.querySelector(".weekly-assignment[data-shift-id]");
            if (existingCard) {
                await assignEmployeeToShift(existingCard);
            } else {
                openNewShiftModal(target);
            }
        } else {
            await assignEmployeeToShift(target);
        }
        return;
    }

    const assignmentId = state.draggedAssignmentId || event.dataTransfer.getData("text/plain");

    if (isCell) {
        await moveAssignmentToNewShift(target, assignmentId);
        return;
    }

    const swapAssignment = target.dataset.assignmentId;
    if (!assignmentId || assignmentId === swapAssignment) {
        endAssignmentDrag();
        return;
    }

    try {
        await fetchJson(`/api/v1/assignments/${assignmentId}/move/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                target_shift: target.dataset.shiftId,
                ...(swapAssignment ? { swap_assignment: swapAssignment } : {}),
            }),
        });
        state.lastGenerationSummary = null;
        await loadSchedule();
        setStatus(swapAssignment ? "Assignments swapped." : "Assignment moved.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to move assignment.", "error");
    } finally {
        endAssignmentDrag();
    }
}

async function moveAssignmentToNewShift(targetCell, assignmentId) {
    const roleId = targetCell.dataset.roleId;
    const date = targetCell.dataset.date;

    if (!roleId) {
        setStatus("Cannot create a shift without a specific role.", "error");
        endAssignmentDrag();
        return;
    }

    const sourceCard = state.draggedAssignmentCard;
    const title = sourceCard?.dataset.shiftTitle || "Shift";
    const arrivalTime = sourceCard?.dataset.arrivalTime || "12:00";
    const closeTime = closeTimeFor(date);

    try {
        const shift = await fetchJson("/api/v1/shifts/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title,
                role: roleId,
                start_time: `${date}T${arrivalTime}:00Z`,
                end_time: `${date}T${closeTime.slice(0, 5)}:00Z`,
            }),
        });
        await fetchJson(`/api/v1/assignments/${assignmentId}/move/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target_shift: shift.id }),
        });
        state.lastGenerationSummary = null;
        await loadSchedule();
        setStatus("Assignment moved to new shift.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to move assignment.", "error");
    } finally {
        endAssignmentDrag();
    }
}

function openNewShiftModal(cell) {
    const roleId = cell.dataset.roleId;
    const date = cell.dataset.date;

    if (!roleId) {
        setStatus("Cannot create a shift without a specific role.", "error");
        state.draggedEmployeeId = null;
        clearDragClasses();
        return;
    }

    state.newShiftTarget = { roleId, date, employeeId: state.draggedEmployeeId };
    state.draggedEmployeeId = null;
    clearDragClasses();

    const dayLabel = new Date(`${date}T00:00:00`).toLocaleDateString([], {
        weekday: "long",
        month: "short",
        day: "numeric",
    });
    shiftEditEmployee.textContent = `New shift — ${dayLabel}`;
    shiftEditService.value = serviceOptions[0];
    shiftEditArrival.value = "";
    shiftEditDelete.hidden = true;
    shiftEditModal.hidden = false;
}

async function createShiftAndAssign() {
    const { roleId, date, employeeId } = state.newShiftTarget;
    const title = shiftEditService.value;
    const arrivalTime = shiftEditArrival.value;

    if (!arrivalTime) {
        setStatus("Choose an arrival time.", "error");
        return;
    }

    const closeTime = closeTimeFor(date);

    try {
        const shift = await fetchJson("/api/v1/shifts/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title,
                role: roleId,
                start_time: `${date}T${arrivalTime}:00Z`,
                end_time: `${date}T${closeTime.slice(0, 5)}:00Z`,
            }),
        });
        const emp = state.employees.find((e) => String(e.id) === String(employeeId));
        const ok = await tryCreateAssignment(employeeId, shift.id, emp?.name || "");
        if (ok) {
            closeShiftEditor();
            state.lastGenerationSummary = null;
            await loadSchedule();
            setStatus("Employee assigned to new shift.", "success");
        } else {
            closeShiftEditor();
        }
    } catch (error) {
        setStatus(error.message || "Unable to create shift.", "error");
    }
}

async function deleteAssignment() {
    if (!state.editingAssignmentId) {
        return;
    }
    const id = state.editingAssignmentId;
    closeShiftEditor();
    await deleteAssignmentById(id);
}

async function deleteAssignmentById(id) {
    try {
        await fetchJson(`/api/v1/assignments/${id}/`, { method: "DELETE" });
        state.lastGenerationSummary = null;
        await loadSchedule();
        setStatus("Assignment removed.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to remove assignment.", "error");
    }
}

function closeTimeFor(date) {
    const d = new Date(`${date}T00:00:00`);
    const apiDayOfWeek = (d.getDay() + 6) % 7; // JS Sun=0 → API Mon=0
    const hours = state.operatingHours[apiDayOfWeek];
    if (hours && !hours.is_closed && hours.close_time) {
        return hours.close_time; // "HH:MM:SS"
    }
    return "22:00:00";
}

async function assignEmployeeToShift(targetCard) {
    const employeeId = state.draggedEmployeeId;
    const shiftId = targetCard.dataset.shiftId;
    const emp = state.employees.find((e) => String(e.id) === String(employeeId));
    const employeeName = emp?.name || "";
    state.draggedEmployeeId = null;
    clearDragClasses();
    try {
        const ok = await tryCreateAssignment(employeeId, shiftId, employeeName);
        if (ok) {
            state.lastGenerationSummary = null;
            await loadSchedule();
            setStatus("Employee added to shift.", "success");
        }
    } catch (error) {
        setStatus(error.message || "Unable to add employee to shift.", "error");
    }
}

function dragTargetFor(event) {
    if (!isManager() || (!state.draggedAssignmentId && !state.draggedEmployeeId)) {
        return null;
    }

    const targetCard = event.target.closest(".weekly-assignment[data-shift-id]");
    if (targetCard) {
        if (state.draggedAssignmentId && targetCard.dataset.assignmentId === state.draggedAssignmentId) {
            return null;
        }
        return targetCard;
    }

    // Employee drags can land on any cell (empty or occupied — add to existing shift)
    if (state.draggedEmployeeId) {
        return event.target.closest(".weekly-cell[data-role-id][data-date]") || null;
    }

    // Assignment drags land only on empty cells (move to new slot)
    return event.target.closest(".weekly-cell.is-empty[data-role-id][data-date]") || null;
}

function openShiftEditor(event) {
    if (!isManager() || state.viewingSnapshot || state.draggedAssignmentId || state.draggedEmployeeId) return;

    const openCard = event.target.closest(".weekly-assignment[data-open-slot='true']");
    if (openCard) {
        openSlotFillModal(openCard);
        return;
    }

    const card = event.target.closest(".weekly-assignment[data-assignment-id]");
    if (!card) return;

    state.editingAssignmentId = card.dataset.assignmentId;
    state.newShiftTarget = null;
    shiftEditEmployee.textContent = card.dataset.employeeName || "Employee shift";
    shiftEditService.value = card.dataset.shiftTitle || serviceOptions[0];
    shiftEditArrival.value = card.dataset.arrivalTime || "";
    shiftEditDelete.hidden = false;
    shiftEditModal.hidden = false;
}

async function openSlotFillModal(card) {
    const shiftId = card.dataset.shiftId;
    const shiftTitle = card.dataset.shiftTitle || "Shift";
    const cell = card.closest(".weekly-cell");
    const date = cell?.dataset.date || "";
    const roleName = cell?.dataset.roleName || "";

    const heading = document.getElementById("slot-fill-heading");
    const meta = document.getElementById("slot-fill-shift-meta");
    const list = document.getElementById("slot-fill-list");
    const modal = document.getElementById("slot-fill-modal");

    heading.textContent = shiftTitle;
    meta.textContent = `${roleName ? roleName + " · " : ""}${date ? formatDate(date) : ""}`;
    list.innerHTML = '<div class="empty-state">Loading available employees…</div>';
    modal.dataset.shiftId = shiftId;
    modal.hidden = false;

    try {
        const employees = await fetchJson(`/api/v1/employees/eligible_for_open_slot/?shift=${shiftId}`);
        if (!employees.length) {
            list.innerHTML = '<div class="empty-state">No available employees for this slot.</div>';
            return;
        }
        list.innerHTML = employees.map(emp => `
            <button class="slot-fill-option" data-employee-id="${emp.id}" data-shift-id="${shiftId}" type="button">
                <strong>${escapeHtml(emp.name)}</strong>
                <small>${escapeHtml(emp.primary_role_name || (emp.role_names && emp.role_names[0]) || "")}</small>
            </button>
        `).join("");
        list.querySelectorAll(".slot-fill-option").forEach(btn => {
            const emp = employees.find((e) => String(e.id) === btn.dataset.employeeId);
            btn.addEventListener("click", () => assignToOpenSlot(btn.dataset.employeeId, btn.dataset.shiftId, emp?.name || ""));
        });
    } catch (err) {
        list.innerHTML = `<div class="empty-state">Could not load employees: ${escapeHtml(err.message)}</div>`;
    }
}

function closeSlotFillModal() {
    document.getElementById("slot-fill-modal").hidden = true;
}

async function deleteOpenSlot() {
    const modal = document.getElementById("slot-fill-modal");
    const shiftId = modal.dataset.shiftId;
    if (!shiftId) return;
    closeSlotFillModal();
    try {
        await fetchJson(`/api/v1/shifts/${shiftId}/close-slot/`, { method: "POST" });
        state.lastGenerationSummary = null;
        await loadSchedule();
        setStatus("Slot deleted.", "success");
    } catch (err) {
        setStatus(err.message || "Unable to delete slot.", "error");
    }
}

async function assignToOpenSlot(employeeId, shiftId, employeeName) {
    closeSlotFillModal();
    try {
        const ok = await tryCreateAssignment(employeeId, shiftId, employeeName);
        if (ok) {
            state.lastGenerationSummary = null;
            await loadSchedule();
            setStatus("Employee assigned to open slot.", "success");
        }
    } catch (err) {
        setStatus(err.message || "Unable to assign employee.", "error");
    }
}

function closeShiftEditor() {
    state.editingAssignmentId = null;
    state.newShiftTarget = null;
    shiftEditForm.reset();
    shiftEditModal.hidden = true;
}

async function saveShiftEdit(event) {
    event.preventDefault();

    if (state.newShiftTarget) {
        await createShiftAndAssign();
        return;
    }

    if (!state.editingAssignmentId) {
        return;
    }

    try {
        await fetchJson(`/api/v1/assignments/${state.editingAssignmentId}/reschedule/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: shiftEditService.value,
                arrival_time: shiftEditArrival.value,
            }),
        });
        closeShiftEditor();
        state.lastGenerationSummary = null;
        await loadSchedule();
        setStatus("Shift updated.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to update shift.", "error");
    }
}

async function createStaffingRequirement(event) {
    event.preventDefault();

    const selectedDays = Array.from(requirementDayButtons.querySelectorAll(".day-toggle.is-selected"))
        .map((btn) => Number(btn.dataset.day));
    const endTimeValue = document.getElementById("requirement-end").value;
    const basePayload = {
        title: requirementTitle.value,
        role: requirementRole.value,
        start_time: document.getElementById("requirement-start").value,
        end_time: endTimeValue || null,
        required_count: Number(document.getElementById("requirement-count").value),
        is_active: true,
    };

    if (!basePayload.role || !basePayload.start_time) {
        setStatus("Choose a role and arrival time for this slot.", "error");
        return;
    }
    if (!selectedDays.length) {
        setStatus("Select at least one day.", "error");
        return;
    }

    const results = await Promise.allSettled(
        selectedDays.map((day) =>
            fetchJson("/api/v1/staffing-requirements/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...basePayload, day_of_week: day }),
            })
        )
    );

    const failures = results.filter((r) => r.status === "rejected");
    const saved = results.length - failures.length;

    staffingRequirementForm.reset();
    requirementTitle.value = serviceOptions[0];
    document.getElementById("requirement-count").value = "1";
    selectDays([]);
    state.lastGenerationSummary = null;
    await loadStaffingRequirements();
    renderCoverageSummary();

    if (failures.length) {
        const firstError = failures[0].reason?.message || "Unknown error";
        setStatus(`${saved} slot${saved === 1 ? "" : "s"} saved, ${failures.length} failed: ${firstError}`, "error");
    } else {
        setStatus(`${saved} arrival slot${saved === 1 ? "" : "s"} saved.`, "success");
    }
}

function selectDays(days) {
    requirementDayButtons.querySelectorAll(".day-toggle").forEach((btn) => {
        btn.classList.toggle("is-selected", days.includes(Number(btn.dataset.day)));
    });
}

function handleRequirementCardClick(event) {
    const toggleBtn = event.target.closest("[data-action='toggle-role-group']");
    if (toggleBtn) {
        const roleName = toggleBtn.dataset.roleName;
        if (state.expandedRoleGroups.has(roleName)) {
            state.expandedRoleGroups.delete(roleName);
        } else {
            state.expandedRoleGroups.add(roleName);
        }
        renderStaffingRequirements();
        return;
    }

    const card = event.target.closest(".requirement-card[data-group-index]");
    if (!card) return;
    const group = state.requirementGroups[Number(card.dataset.groupIndex)];
    if (group) openRequirementEditor(group);
}

function openRequirementEditor(group) {
    state.editingRequirementGroup = group;

    document.getElementById("req-edit-heading").textContent = `${group.title} · ${group.role_name}`;

    const roleSelect = document.getElementById("req-edit-role");
    roleSelect.innerHTML = `<option value="">Select a role</option>` +
        state.roles.map((r) => `<option value="${r.id}"${r.id === group.role_id ? " selected" : ""}>${escapeHtml(r.name)}</option>`).join("");

    document.getElementById("req-edit-service").value = group.title;
    document.getElementById("req-edit-start").value = normalizeTime(group.start_time);
    document.getElementById("req-edit-end").value = group.end_time ? normalizeTime(group.end_time) : "";
    document.getElementById("req-edit-count").value = group.required_count;
    selectReqEditDays(group.days);

    document.getElementById("req-edit-modal").hidden = false;
}

function closeRequirementEditor() {
    state.editingRequirementGroup = null;
    document.getElementById("req-edit-form").reset();
    document.getElementById("req-edit-modal").hidden = true;
}

async function saveRequirementEdit(event) {
    event.preventDefault();
    const group = state.editingRequirementGroup;
    if (!group) return;

    const selectedDays = Array.from(
        document.getElementById("req-edit-days").querySelectorAll(".day-toggle.is-selected")
    ).map((btn) => Number(btn.dataset.day));

    if (!selectedDays.length) {
        setStatus("Select at least one day.", "error");
        return;
    }

    const endVal = document.getElementById("req-edit-end").value;
    const newPayload = {
        title: document.getElementById("req-edit-service").value,
        role: document.getElementById("req-edit-role").value,
        start_time: document.getElementById("req-edit-start").value,
        end_time: endVal || null,
        required_count: Number(document.getElementById("req-edit-count").value),
        is_active: true,
    };

    closeRequirementEditor();

    await Promise.allSettled(
        group.ids.map((id) => fetchJson(`/api/v1/staffing-requirements/${id}/`, { method: "DELETE" }))
    );

    const results = await Promise.allSettled(
        selectedDays.map((day) =>
            fetchJson("/api/v1/staffing-requirements/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...newPayload, day_of_week: day }),
            })
        )
    );

    const failures = results.filter((r) => r.status === "rejected");
    state.lastGenerationSummary = null;
    await loadStaffingRequirements();
    renderCoverageSummary();

    if (failures.length) {
        setStatus(`Saved with ${failures.length} error(s): ${failures[0].reason?.message || "Unknown"}`, "error");
    } else {
        setStatus("Coverage preset updated.", "success");
    }
}

async function deleteRequirementGroup() {
    const group = state.editingRequirementGroup;
    if (!group) return;
    closeRequirementEditor();

    await Promise.allSettled(
        group.ids.map((id) => fetchJson(`/api/v1/staffing-requirements/${id}/`, { method: "DELETE" }))
    );

    state.lastGenerationSummary = null;
    await loadStaffingRequirements();
    renderCoverageSummary();
    setStatus("Coverage preset removed.", "success");
}

function selectReqEditDays(days) {
    document.getElementById("req-edit-days").querySelectorAll(".day-toggle").forEach((btn) => {
        btn.classList.toggle("is-selected", days.includes(Number(btn.dataset.day)));
    });
}

async function generateDraft() {
    generateDraftButton.disabled = true;
    const deptLabel = state.activeDepartment
        ? { foh: "Front of House", boh: "Back of House", management: "Management" }[state.activeDepartment]
        : "all departments";
    setStatus(`Generating draft for ${deptLabel}...`, "");

    try {
        const body = { week_start: dateKey(state.weekStart) };
        if (state.activeDepartment) body.department = state.activeDepartment;
        const result = await fetchJson("/api/v1/schedule-weeks/generate-draft/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        state.lastGenerationSummary = result.summary;
        await loadSchedule();
        const openSlots = result.summary.open_slots.length;
        const invalidRequirements = (result.summary.invalid_requirements || []).length;
        const issueCount = openSlots + invalidRequirements;
        setStatus(
            issueCount
                ? `Draft generated with ${issueCount} coverage issue${issueCount === 1 ? "" : "s"} to fix.`
                : "Draft generated with all staffing requirements filled.",
            issueCount ? "error" : "success"
        );
    } catch (error) {
        setStatus(error.message || "Unable to generate draft.", "error");
    } finally {
        generateDraftButton.disabled = false;
    }
}

async function publishWeek() {
    try {
        const body = { week_start: dateKey(state.weekStart) };
        if (state.activeDepartment) body.department = state.activeDepartment;
        await fetchJson("/api/v1/schedule-weeks/publish-week/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        state.lastGenerationSummary = null;
        await loadSchedule();
        const deptLabel = state.activeDepartment
            ? { foh: "Front of House", boh: "Back of House", management: "Management" }[state.activeDepartment]
            : null;
        setStatus(
            deptLabel
                ? `${deptLabel} schedule published. Employees can now see this week.`
                : "Schedule published. Employees can now see this week.",
            "success"
        );

        let xlsxUrl = `/api/v1/schedule-weeks/schedule-excel/?week_start=${dateKey(state.weekStart)}`;
        if (state.activeDepartment) xlsxUrl += `&department=${state.activeDepartment}`;
        const resp = await fetch(xlsxUrl, { credentials: "same-origin" });
        if (resp.ok) {
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = `schedule-${dateKey(state.weekStart)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        }
    } catch (error) {
        setStatus(error.message || "Unable to publish schedule.", "error");
    }
}

async function copyLastWeek() {
    copyLastWeekButton.disabled = true;
    setStatus("Copying last week's schedule...", "");
    try {
        const result = await fetchJson("/api/v1/schedule-weeks/copy-last-week/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ week_start: dateKey(state.weekStart) }),
        });
        state.lastGenerationSummary = null;
        await loadSchedule();
        const s = result.summary;
        const parts = [`${s.assignments_copied} assignment${s.assignments_copied === 1 ? "" : "s"} copied`];
        if (s.skipped_time_off) parts.push(`${s.skipped_time_off} skipped (time off)`);
        if (s.skipped_closed) parts.push(`${s.skipped_closed} skipped (closed day)`);
        setStatus(parts.join(" · ") + ".", "success");
    } catch (error) {
        setStatus(error.message || "Unable to copy last week.", "error");
    } finally {
        copyLastWeekButton.disabled = false;
    }
}


async function discardDraft() {
    if (!confirm("Delete the current draft and revert to the last published schedule? This cannot be undone.")) return;
    discardDraftButton.disabled = true;
    setStatus("Reverting to published schedule...", "");
    try {
        await fetchJson("/api/v1/schedule-weeks/discard-draft/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ week_start: dateKey(state.weekStart) }),
        });
        state.lastGenerationSummary = null;
        state.viewingSnapshot = false;
        await loadSchedule();
        setStatus("Reverted to published schedule.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to discard draft.", "error");
        discardDraftButton.disabled = false;
    }
}

async function loadClosedDays() {
    const weekEnd = new Date(state.weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    try {
        state.closedDays = await fetchJson(
            `/api/v1/closed-days/?start=${dateKey(state.weekStart)}&end=${dateKey(weekEnd)}`
        );
        renderClosedDays();
    } catch {
        // non-fatal
    }
}

function renderClosedDays() {
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(state.weekStart);
        d.setDate(d.getDate() + i);
        days.push(d);
    }

    const closedMap = new Map(state.closedDays.map(cd => [cd.date, cd]));

    closedDayToggles.innerHTML = days.map(d => {
        const key = dateKey(d);
        const cd = closedMap.get(key);
        const isClosed = !!cd;
        return `
            <button
                class="closed-day-toggle${isClosed ? " is-closed" : ""}"
                type="button"
                data-action="toggle-closed-day"
                data-date="${key}"
                data-closed-day-id="${cd ? cd.id : ""}"
            >
                <span class="closed-day-toggle__label">${d.toLocaleDateString([], { weekday: "short" })}</span>
                <span class="closed-day-toggle__date">${d.toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                ${isClosed ? '<span class="closed-day-toggle__badge">Closed</span>' : ""}
            </button>
        `;
    }).join("");

    if (state.editingClosedDayId !== null) {
        const cd = state.closedDays.find(c => c.id === state.editingClosedDayId);
        if (cd) {
            closedDayNoteInput.value = cd.note || "";
            closedDayNoteRow.hidden = false;
        } else {
            state.editingClosedDayId = null;
            closedDayNoteRow.hidden = true;
        }
    }
}

async function toggleClosedDay(date, closedDayId) {
    if (closedDayId) {
        try {
            await fetchJson(`/api/v1/closed-days/${closedDayId}/`, { method: "DELETE" });
            state.editingClosedDayId = null;
            closedDayNoteRow.hidden = true;
            await Promise.all([loadClosedDays(), loadSchedule()]);
        } catch (err) {
            setStatus(err.message || "Unable to remove closed day.", "error");
        }
    } else {
        try {
            const cd = await fetchJson("/api/v1/closed-days/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date, note: "" }),
            });
            state.editingClosedDayId = cd.id;
            closedDayNoteInput.value = "";
            closedDayNoteRow.hidden = false;
            await Promise.all([loadClosedDays(), loadSchedule()]);
        } catch (err) {
            setStatus(err.message || "Unable to mark day as closed.", "error");
        }
    }
}

async function saveClosedDayNote() {
    if (!state.editingClosedDayId) return;
    try {
        await fetchJson(`/api/v1/closed-days/${state.editingClosedDayId}/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note: closedDayNoteInput.value }),
        });
        await loadClosedDays();
        setStatus("Note saved.", "success");
    } catch (err) {
        setStatus(err.message || "Unable to save note.", "error");
    }
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, withCsrf(options));
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

function withCsrf(options) {
    const method = (options.method || "GET").toUpperCase();
    if (["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
        return options;
    }

    return {
        ...options,
        headers: {
            ...(options.headers || {}),
            "X-CSRFToken": getCookie("csrftoken"),
        },
    };
}

function getCookie(name) {
    return document.cookie
        .split(";")
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(`${name}=`))
        ?.slice(name.length + 1) || "";
}

function formatApiError(data) {
    if (!data) {
        return "The server rejected the request.";
    }

    if (typeof data === "string") {
        return data;
    }

    if (Array.isArray(data)) {
        return data.join(" ");
    }

    if (data.detail) {
        return Array.isArray(data.detail) ? data.detail.join(" ") : data.detail;
    }

    const firstValue = Object.values(data)[0];
    if (Array.isArray(firstValue)) {
        return firstValue.join(" ");
    }

    return "The server rejected the request.";
}

function setStatus(message, variant = "") {
    weeklyStatus.textContent = message;
    weeklyStatus.className = "status-banner is-visible";
    if (variant) {
        weeklyStatus.classList.add(`is-${variant}`);
    }
    clearTimeout(weeklyStatus._hideTimer);
    weeklyStatus._hideTimer = setTimeout(() => weeklyStatus.classList.remove("is-visible"), 3200);
}

function startOfWeek(date) {
    const copy = new Date(date);
    const day = copy.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + mondayOffset);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function dateKey(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

function formatDate(value) {
    return new Date(`${value}T00:00:00`).toLocaleDateString([], {
        month: "short",
        day: "numeric",
    });
}

function shiftClass(title) {
    const t = (title || "").toLowerCase();
    if (t.includes("opener")) return "morning";
    if (t.includes("closer")) return "closer";
    return "afternoon";
}

function shiftSortOrder(title) {
    const t = (title || "").toLowerCase();
    if (t.includes("opener")) return 0;
    if (t.includes("closer")) return 2;
    return 1;
}

function formatTimeOnly(value) {
    const [hourValue, minuteValue] = normalizeTime(value).split(":");
    const date = new Date();
    date.setHours(Number(hourValue), Number(minuteValue), 0, 0);
    return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });
}

function normalizeTime(value) {
    return value.slice(0, 5);
}

function normalizeTimeFromDate(value) {
    return value.slice(11, 16);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
