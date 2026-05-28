const teamUserPill = document.getElementById("team-user-pill");
const teamStatus = document.getElementById("app-toast");
const roleForm = document.getElementById("role-form");
const employeeForm = document.getElementById("employee-form");
const availabilityForm = document.getElementById("availability-form");
const roleList = document.getElementById("role-list");
const employeeList = document.getElementById("employee-list");
const employeeRole = document.getElementById("employee-role");
const availabilityEmployee = document.getElementById("availability-employee");
const availabilityDayButtons = document.getElementById("availability-day-buttons");

const state = {
    me: null,
    roles: [],
    employees: [],
    availability: [],
    editingEmployee: null,
    expandedAvailabilityEmployeeIds: new Set(),
    expandedRoleGroups: new Set(),
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

bootstrapTeamSetup();

async function bootstrapTeamSetup() {
    availabilityDayButtons.innerHTML = dayOptions
        .map(([value, label]) => `<button class="day-toggle" type="button" data-day="${value}">${label.slice(0, 3)}</button>`)
        .join("");
    availabilityDayButtons.addEventListener("click", (e) => {
        const btn = e.target.closest(".day-toggle");
        if (btn) btn.classList.toggle("is-selected");
    });
    document.getElementById("avail-shortcut-weekdays").addEventListener("click", () => selectAvailDays([0,1,2,3,4]));
    document.getElementById("avail-shortcut-weekend").addEventListener("click", () => selectAvailDays([5,6]));
    document.getElementById("avail-shortcut-all").addEventListener("click", () => selectAvailDays([0,1,2,3,4,5,6]));

    roleList.addEventListener("click", handleRoleListClick);
    roleForm.addEventListener("submit", createRole);
    employeeForm.addEventListener("submit", createEmployee);
    availabilityForm.addEventListener("submit", createAvailability);
    employeeList.addEventListener("click", handleEmployeeListClick);
    document.getElementById("employee-edit-form").addEventListener("submit", saveEmployeeEdit);
    document.getElementById("emp-edit-cancel").addEventListener("click", closeEmployeeEditor);
    document.getElementById("emp-edit-delete").addEventListener("click", () => {
        if (state.editingEmployee) deleteEmployee(state.editingEmployee.id);
    });
    document.getElementById("employee-edit-modal").addEventListener("click", (e) => {
        if (e.target === e.currentTarget) closeEmployeeEditor();
    });

    document.getElementById("new-emp-secondary-roles").addEventListener("click", (e) => {
        const btn = e.target.closest(".role-toggle");
        if (btn) btn.classList.toggle("is-selected");
    });
    document.getElementById("edit-emp-secondary-roles").addEventListener("click", (e) => {
        const btn = e.target.closest(".role-toggle");
        if (btn) btn.classList.toggle("is-selected");
    });
    document.getElementById("employee-role").addEventListener("change", () => {
        const primaryId = document.getElementById("employee-role").value;
        const selected = Array.from(document.querySelectorAll("#new-emp-secondary-roles .role-toggle.is-selected"))
            .map((btn) => Number(btn.dataset.roleId))
            .filter((id) => id !== Number(primaryId));
        renderSecondaryRolePicker("new-emp-secondary-roles", primaryId, selected);
    });

    try {
        state.me = await fetchJson("/api/v1/employees/me/");
        teamUserPill.textContent = `${state.me.name} · ${state.me.account_type}`;
        if (state.me.account_type !== "manager") {
            setStatus("Only managers can update team setup.", "error");
            disableForms();
            return;
        }
        await hydrateTeamSetup();
    } catch (error) {
        setStatus(error.message || "Unable to load team setup.", "error");
    }
}

async function hydrateTeamSetup() {
    const [roles, employees, availability] = await Promise.all([
        fetchJson("/api/v1/roles/"),
        fetchJson("/api/v1/employees/"),
        fetchJson("/api/v1/baseline-availability/"),
    ]);

    state.roles = roles;
    state.employees = employees;
    state.availability = availability.filter((window) => window.is_active);

    renderRoles();
    renderSelects();
    renderEmployees();
}

function renderRoles() {
    if (!state.roles.length) {
        roleList.innerHTML = '<div class="empty-state">Add roles like Server, Host, Grill, or Dishwasher.</div>';
        return;
    }

    // Group by department
    const groups = [
        { key: "foh", label: "Front of House" },
        { key: "boh", label: "Back of House" },
        { key: "management", label: "Management" },
    ];

    roleList.innerHTML = groups.map(({ key, label }) => {
        const roles = state.roles.filter((r) => (r.department || "foh") === key);
        if (!roles.length) return "";
        return `
            <div class="role-dept-group">
                <div class="role-dept-group__header role-dept-group__header--${key}">${escapeHtml(label)}</div>
                <div class="role-dept-group__chips">
                    ${roles.map((role) => `
                        <span class="role-chip dept-chip--${key}">
                            ${escapeHtml(role.name)}
                            <button class="role-chip__delete" type="button" data-action="delete-role" data-role-id="${role.id}" aria-label="Delete ${escapeHtml(role.name)}">×</button>
                        </span>`).join("")}
                </div>
            </div>`;
    }).join("");
}

function renderSelects() {
    const roleOptions = `
        <option value="">Select a role</option>
        ${state.roles.map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join("")}
    `;
    employeeRole.innerHTML = roleOptions;

    availabilityEmployee.innerHTML = `
        <option value="">Select an employee</option>
        ${state.employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`).join("")}
    `;

    // Reset secondary roles picker with current primary selection preserved
    const currentPrimaryId = employeeRole.value;
    const selected = Array.from(document.querySelectorAll("#new-emp-secondary-roles .role-toggle.is-selected"))
        .map((btn) => Number(btn.dataset.roleId));
    renderSecondaryRolePicker("new-emp-secondary-roles", currentPrimaryId, selected);
}

function renderSecondaryRolePicker(containerId, excludeRoleId, selectedRoleIds = []) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const excludeId = excludeRoleId ? Number(excludeRoleId) : null;
    const available = state.roles.filter((r) => Number(r.id) !== excludeId);
    container.innerHTML = available.length
        ? available.map((r) => `<button type="button" class="role-toggle${selectedRoleIds.includes(Number(r.id)) ? " is-selected" : ""}" data-role-id="${r.id}">${escapeHtml(r.name)}</button>`).join("")
        : '<span style="font-size:.85rem;color:var(--muted)">No other roles available.</span>';
}

function renderEmployeeCard(employee) {
    const windows = state.availability.filter((w) => Number(w.employee) === Number(employee.id));
    const primaryRoleId = employee.primary_role ? Number(employee.primary_role) : null;
    const allRoleIds = (employee.roles || []).map(Number);
    if (primaryRoleId && !allRoleIds.includes(primaryRoleId)) allRoleIds.unshift(primaryRoleId);
    const secondaryRoleIds = allRoleIds.filter((id) => id !== primaryRoleId);
    const availabilityIsOpen = state.expandedAvailabilityEmployeeIds.has(Number(employee.id));

    const primaryRole = primaryRoleId ? state.roles.find((r) => Number(r.id) === primaryRoleId) : null;

    // Header chips (display only, color-coded by department)
    let headerChipsHtml = "";
    if (primaryRole) {
        const dept = primaryRole.department || "foh";
        headerChipsHtml += `<span class="role-chip dept-chip--${dept}">${escapeHtml(primaryRole.name)}</span>`;
    }
    for (const id of secondaryRoleIds) {
        const role = state.roles.find((r) => Number(r.id) === id);
        if (role) {
            const dept = role.department || "foh";
            headerChipsHtml += `<span class="role-chip role-chip--secondary dept-chip--${dept}">${escapeHtml(role.name)}</span>`;
        }
    }
    if (!headerChipsHtml) headerChipsHtml = '<span class="employee-card__no-role">No roles</span>';

    // Primary chip — deletable
    const primaryChipHtml = primaryRole
        ? `<span class="assigned-role-chip assigned-role-chip--primary">${escapeHtml(primaryRole.name)}<button class="assigned-role-chip__remove" type="button" data-action="remove-primary-role" aria-label="Remove primary role">×</button></span>`
        : `<span class="employee-card__no-role" style="font-size:.82rem">None — set via Edit</span>`;

    // Secondary chips — each deletable
    const secondaryChipsHtml = secondaryRoleIds.length
        ? secondaryRoleIds.map((id) => {
            const role = state.roles.find((r) => Number(r.id) === id);
            return role ? `<span class="assigned-role-chip">${escapeHtml(role.name)}<button class="assigned-role-chip__remove" type="button" data-action="remove-role" data-role-id="${id}" aria-label="Remove ${escapeHtml(role.name)}">×</button></span>` : "";
          }).join("")
        : `<span class="employee-card__no-role" style="font-size:.82rem">None</span>`;

    return `
        <article class="employee-card" data-employee-id="${employee.id}">
            <div class="employee-card__header">
                <div class="employee-card__info">
                    <h3>${escapeHtml(employee.name)}${employee.account_type === "manager" ? ' <span class="account-type-badge">Manager account</span>' : ""}</h3>
                    <small>${escapeHtml(employee.email)}</small>
                    ${employee.phone_number ? `<small>${escapeHtml(employee.phone_number)}</small>` : ""}
                    ${employee.desired_days_per_week ? `<small style="color:var(--accent-deep);font-weight:600">${employee.desired_days_per_week}d/wk target</small>` : ""}
                </div>
                <div class="employee-card__header-right">
                    <div class="employee-card__role-chips">
                        ${headerChipsHtml}
                    </div>
                    <button class="button-ghost employee-card__edit-btn" type="button" data-action="edit-employee">Edit</button>
                </div>
            </div>

            <div class="employee-role-rows">
                <div class="employee-role-row">
                    <span class="employee-role-row__label">Primary</span>
                    <div class="employee-role-row__chips">${primaryChipHtml}</div>
                </div>
                <div class="employee-role-row">
                    <span class="employee-role-row__label">Secondary</span>
                    <div class="employee-role-row__chips">${secondaryChipsHtml}</div>
                </div>
            </div>

            <div class="employee-availability-card ${availabilityIsOpen ? "is-open" : ""}">
                <button
                    class="employee-availability-card__toggle"
                    type="button"
                    data-action="toggle-availability"
                    aria-expanded="${availabilityIsOpen ? "true" : "false"}"
                >
                    <span>
                        <strong>Availability</strong>
                        <small>${escapeHtml(formatAvailabilitySummary(windows))}</small>
                    </span>
                    <span class="employee-availability-card__icon">${availabilityIsOpen ? "−" : "+"}</span>
                </button>
                <div class="employee-availability-card__body" ${availabilityIsOpen ? "" : "hidden"}>
                    <div class="availability-list">
                        ${windows.length ? windows.map(renderAvailabilityRow).join("") : '<div class="empty-state">No approved weekly availability yet.</div>'}
                    </div>
                </div>
            </div>
        </article>
    `;
}

function renderEmployees() {
    if (!state.employees.length) {
        employeeList.innerHTML = '<div class="empty-state">No employees added yet.</div>';
        return;
    }

    const deptOrder = [
        { key: "foh", label: "Front of House" },
        { key: "boh", label: "Back of House" },
        { key: "management", label: "Management" },
        { key: "", label: "No role assigned" },
    ];

    // dept key → role name → [employees]
    // dept → role name → [employees]; each employee appears once per role they hold
    const byDept = new Map();
    for (const employee of state.employees) {
        const allRoleIds = (employee.roles || []).map(Number);
        const primaryRoleId = employee.primary_role ? Number(employee.primary_role) : null;
        if (primaryRoleId && !allRoleIds.includes(primaryRoleId)) allRoleIds.unshift(primaryRoleId);

        if (!allRoleIds.length) {
            // No roles at all — bucket under blank dept / blank role name
            if (!byDept.has("")) byDept.set("", new Map());
            const roleMap = byDept.get("");
            if (!roleMap.has("")) roleMap.set("", []);
            roleMap.get("").push(employee);
            continue;
        }

        for (const roleId of allRoleIds) {
            const role = state.roles.find((r) => Number(r.id) === roleId);
            if (!role) continue;
            const dept = role.department || "";
            const roleName = role.name;
            if (!byDept.has(dept)) byDept.set(dept, new Map());
            const roleMap = byDept.get(dept);
            if (!roleMap.has(roleName)) roleMap.set(roleName, []);
            // Guard against duplicates (shouldn't happen but be safe)
            if (!roleMap.get(roleName).some((e) => Number(e.id) === Number(employee.id))) {
                roleMap.get(roleName).push(employee);
            }
        }
    }

    employeeList.innerHTML = deptOrder
        .filter(({ key }) => byDept.has(key))
        .map(({ key, label }) => {
            const roleMap = byDept.get(key);
            const roleGroupsHtml = Array.from(roleMap.entries())
                .sort(([a], [b]) => (a || "").localeCompare(b || ""))
                .map(([roleName, employees]) => {
                    const groupLabel = roleName || "No role";
                    const isOpen = state.expandedRoleGroups.has(groupLabel);
                    return `
                        <div class="worker-role-group${isOpen ? " is-open" : ""}">
                            <button class="worker-role-group__header" type="button" data-action="toggle-worker-role-group" data-group-label="${escapeHtml(groupLabel)}">
                                <span class="worker-role-group__name">${escapeHtml(groupLabel)}</span>
                                <span class="worker-role-group__count">${employees.length} worker${employees.length === 1 ? "" : "s"}</span>
                                <svg class="worker-role-group__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            <div class="worker-role-group__body"${isOpen ? "" : " hidden"}>
                                ${employees.map(renderEmployeeCard).join("")}
                            </div>
                        </div>
                    `;
                }).join("");

            return `
                <div class="worker-dept-section">
                    <div class="worker-dept-section__header${key ? ` worker-dept-section__header--${key}` : ""}">${escapeHtml(label)}</div>
                    <div class="worker-dept-section__body">${roleGroupsHtml}</div>
                </div>
            `;
        }).join("");
}

function formatAvailabilitySummary(windows) {
    if (!windows.length) {
        return "No approved days";
    }

    const dayNames = windows.map((window) => window.day_name.slice(0, 3));
    return `${windows.length} day${windows.length === 1 ? "" : "s"}: ${dayNames.join(", ")}`;
}

function renderAvailabilityRow(window) {
    return `
        <div class="availability-row" data-availability-id="${window.id}">
            <div>
                <strong>${escapeHtml(window.day_name)}</strong>
                <span>${escapeHtml(window.status)}</span>
            </div>
            <button class="button-ghost" type="button" data-action="delete-availability">Remove</button>
        </div>
    `;
}

async function createRole(event) {
    event.preventDefault();
    const name = document.getElementById("role-name").value.trim();
    const department = document.getElementById("role-department").value;
    if (!name) {
        return;
    }

    try {
        await fetchJson("/api/v1/roles/", postOptions({ name, department }));
        roleForm.reset();
        await hydrateTeamSetup();
        setStatus("Role added.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to add role.", "error");
    }
}

async function handleRoleListClick(event) {
    const button = event.target.closest("button[data-action='delete-role']");
    if (!button) return;
    await deleteRole(Number(button.dataset.roleId));
}

async function deleteRole(roleId) {
    try {
        await fetchJson(`/api/v1/roles/${roleId}/`, { method: "DELETE" });
        await hydrateTeamSetup();
        setStatus("Role deleted. Workers that had this role have been updated.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to delete role.", "error");
    }
}

async function createEmployee(event) {
    event.preventDefault();
    const desiredVal = document.getElementById("employee-desired-days").value;
    const roleId = employeeRole.value ? Number(employeeRole.value) : null;
    const secondaryRoleIds = Array.from(document.querySelectorAll("#new-emp-secondary-roles .role-toggle.is-selected"))
        .map((btn) => Number(btn.dataset.roleId))
        .filter((id) => id !== roleId);
    const allRoleIds = roleId ? [roleId, ...secondaryRoleIds] : secondaryRoleIds;
    const payload = {
        name: document.getElementById("employee-name").value.trim(),
        email: document.getElementById("employee-email").value.trim(),
        phone_number: document.getElementById("employee-phone").value.trim(),
        account_type: document.getElementById("employee-account-type").value,
        primary_role: roleId,
        roles: allRoleIds,
        desired_days_per_week: desiredVal ? Number(desiredVal) : null,
    };

    try {
        await fetchJson("/api/v1/employees/", postOptions(payload));
        employeeForm.reset();
        await hydrateTeamSetup();
        setStatus("Employee added.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to add employee.", "error");
    }
}

async function createAvailability(event) {
    event.preventDefault();

    const selectedDays = Array.from(availabilityDayButtons.querySelectorAll(".day-toggle.is-selected"))
        .map((btn) => Number(btn.dataset.day));

    if (!availabilityEmployee.value) {
        setStatus("Select an employee.", "error");
        return;
    }
    if (!selectedDays.length) {
        setStatus("Select at least one day.", "error");
        return;
    }

    const employeeId = Number(availabilityEmployee.value);
    const status = document.getElementById("availability-status").value;
    const results = await Promise.allSettled(
        selectedDays.map((day) => {
            const existing = state.availability.find(
                (w) => Number(w.employee) === employeeId && Number(w.day_of_week) === day
            );
            if (existing) {
                return fetchJson(`/api/v1/baseline-availability/${existing.id}/`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status }),
                });
            }
            return fetchJson("/api/v1/baseline-availability/", postOptions({
                employee: employeeId,
                day_of_week: day,
                status,
                effective_date: dateKey(new Date()),
                is_active: true,
            }));
        })
    );

    const failures = results.filter((r) => r.status === "rejected");
    const saved = results.length - failures.length;

    availabilityForm.reset();
    selectAvailDays([]);
    state.expandedAvailabilityEmployeeIds.add(employeeId);
    await hydrateTeamSetup();

    if (failures.length) {
        setStatus(`${saved} saved, ${failures.length} failed: ${failures[0].reason?.message || "Unknown"}`, "error");
    } else {
        setStatus(`Availability saved for ${saved} day${saved === 1 ? "" : "s"}.`, "success");
    }
}

function selectAvailDays(days) {
    availabilityDayButtons.querySelectorAll(".day-toggle").forEach((btn) => {
        btn.classList.toggle("is-selected", days.includes(Number(btn.dataset.day)));
    });
}

async function handleEmployeeListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
        return;
    }

    const action = button.dataset.action;

    if (action === "toggle-worker-role-group") {
        const label = button.dataset.groupLabel;
        if (state.expandedRoleGroups.has(label)) {
            state.expandedRoleGroups.delete(label);
        } else {
            state.expandedRoleGroups.add(label);
        }
        renderEmployees();
        return;
    }

    const card = button.closest(".employee-card");

    if (action === "edit-employee") {
        const employeeId = card.dataset.employeeId;
        const employee = state.employees.find((e) => Number(e.id) === Number(employeeId));
        if (employee) openEmployeeEditor(employee);
    } else if (action === "toggle-availability") {
        toggleAvailabilityCard(card);
    } else if (action === "add-role") {
        await addEmployeeRole(card);
    } else if (action === "remove-primary-role") {
        await removePrimaryRole(card);
    } else if (action === "remove-role") {
        await removeEmployeeRole(card, Number(button.dataset.roleId));
    } else if (action === "delete-availability") {
        await deleteAvailability(button.closest(".availability-row"));
    }
}

function toggleAvailabilityCard(card) {
    const employeeId = Number(card.dataset.employeeId);
    if (state.expandedAvailabilityEmployeeIds.has(employeeId)) {
        state.expandedAvailabilityEmployeeIds.delete(employeeId);
    } else {
        state.expandedAvailabilityEmployeeIds.add(employeeId);
    }
    renderEmployees();
}

async function addEmployeeRole(card) {
    const employeeId = card.dataset.employeeId;
    const select = card.querySelector("select[data-role-adder]");
    const newRoleId = Number(select.value);

    if (!newRoleId) {
        setStatus("Select a role to add.", "error");
        return;
    }

    const employee = state.employees.find((e) => Number(e.id) === Number(employeeId));
    const currentRoleIds = (employee?.roles || []).map(Number);

    try {
        await fetchJson(`/api/v1/employees/${employeeId}/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles: [...currentRoleIds, newRoleId] }),
        });
        await hydrateTeamSetup();
        setStatus("Role added.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to add role.", "error");
    }
}

async function removePrimaryRole(card) {
    const employeeId = card.dataset.employeeId;
    const employee = state.employees.find((e) => Number(e.id) === Number(employeeId));
    const primaryRoleId = employee?.primary_role ? Number(employee.primary_role) : null;
    const remainingRoleIds = (employee?.roles || []).map(Number).filter((id) => id !== primaryRoleId);

    try {
        await fetchJson(`/api/v1/employees/${employeeId}/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ primary_role: null, roles: remainingRoleIds }),
        });
        await hydrateTeamSetup();
        setStatus("Primary role removed.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to remove primary role.", "error");
    }
}

async function removeEmployeeRole(card, roleId) {
    const employeeId = card.dataset.employeeId;
    const employee = state.employees.find((e) => Number(e.id) === Number(employeeId));
    const newRoleIds = (employee?.roles || []).map(Number).filter((id) => id !== roleId);

    try {
        await fetchJson(`/api/v1/employees/${employeeId}/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles: newRoleIds }),
        });
        await hydrateTeamSetup();
        setStatus("Role removed.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to remove role.", "error");
    }
}

function openEmployeeEditor(employee) {
    state.editingEmployee = employee;
    document.getElementById("edit-emp-name").value = employee.name;
    document.getElementById("edit-emp-email").value = employee.email;
    document.getElementById("edit-emp-phone").value = employee.phone_number || "";
    document.getElementById("edit-emp-account-type").value = employee.account_type || "employee";
    document.getElementById("edit-emp-desired-days").value = employee.desired_days_per_week ?? "";

    const roleSelect = document.getElementById("edit-emp-primary-role");
    roleSelect.innerHTML = `<option value="">No role</option>${state.roles.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("")}`;
    roleSelect.value = employee.primary_role ?? "";

    const primaryId = employee.primary_role ? Number(employee.primary_role) : null;
    const currentSecondaryIds = (employee.roles || []).map(Number).filter((id) => id !== primaryId);
    renderSecondaryRolePicker("edit-emp-secondary-roles", employee.primary_role, currentSecondaryIds);

    roleSelect.onchange = () => {
        const newPrimaryId = roleSelect.value;
        const stillSelected = Array.from(document.querySelectorAll("#edit-emp-secondary-roles .role-toggle.is-selected"))
            .map((btn) => Number(btn.dataset.roleId))
            .filter((id) => id !== Number(newPrimaryId));
        renderSecondaryRolePicker("edit-emp-secondary-roles", newPrimaryId, stillSelected);
    };

    document.getElementById("employee-edit-modal").removeAttribute("hidden");
}

function closeEmployeeEditor() {
    state.editingEmployee = null;
    document.getElementById("employee-edit-modal").setAttribute("hidden", "");
}

async function saveEmployeeEdit(event) {
    event.preventDefault();
    if (!state.editingEmployee) return;

    const desiredVal = document.getElementById("edit-emp-desired-days").value;
    const newRoleId = document.getElementById("edit-emp-primary-role").value;
    const newRoleIdNum = newRoleId ? Number(newRoleId) : null;
    const secondaryRoleIds = Array.from(document.querySelectorAll("#edit-emp-secondary-roles .role-toggle.is-selected"))
        .map((btn) => Number(btn.dataset.roleId))
        .filter((id) => id !== newRoleIdNum);
    const allRoleIds = newRoleIdNum ? [newRoleIdNum, ...secondaryRoleIds] : secondaryRoleIds;

    const payload = {
        name: document.getElementById("edit-emp-name").value.trim(),
        email: document.getElementById("edit-emp-email").value.trim(),
        phone_number: document.getElementById("edit-emp-phone").value.trim(),
        account_type: document.getElementById("edit-emp-account-type").value,
        desired_days_per_week: desiredVal ? Number(desiredVal) : null,
        primary_role: newRoleIdNum,
        roles: allRoleIds,
    };

    try {
        await fetchJson(`/api/v1/employees/${state.editingEmployee.id}/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        closeEmployeeEditor();
        await hydrateTeamSetup();
        setStatus("Employee updated.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to update employee.", "error");
    }
}

async function deleteEmployee(employeeId) {
    if (!confirm("Delete this employee? This will remove all their assignments and cannot be undone.")) return;
    closeEmployeeEditor();
    try {
        await fetchJson(`/api/v1/employees/${employeeId}/`, { method: "DELETE" });
        await hydrateTeamSetup();
        setStatus("Employee deleted.", "success");
    } catch (err) {
        setStatus(err.message || "Unable to delete employee.", "error");
    }
}

async function deleteAvailability(row) {
    try {
        const card = row.closest(".employee-card");
        const employeeId = Number(card?.dataset.employeeId);
        await fetchJson(`/api/v1/baseline-availability/${row.dataset.availabilityId}/`, {
            method: "DELETE",
        });
        if (employeeId) {
            state.expandedAvailabilityEmployeeIds.add(employeeId);
        }
        await hydrateTeamSetup();
        setStatus("Availability removed.", "success");
    } catch (error) {
        setStatus(error.message || "Unable to remove availability.", "error");
    }
}

function disableForms() {
    document.querySelectorAll("form input, form select, form textarea, form button").forEach((node) => {
        node.disabled = true;
    });
}

function postOptions(payload) {
    return {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    };
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

    const firstValue = Object.values(data)[0];
    if (Array.isArray(firstValue)) {
        return firstValue.join(" ");
    }

    if (typeof firstValue === "string") {
        return firstValue;
    }

    return "The server rejected the request.";
}

function setStatus(message, variant = "") {
    teamStatus.textContent = message;
    teamStatus.className = "status-banner is-visible";
    if (variant) {
        teamStatus.classList.add(`is-${variant}`);
    }
    clearTimeout(teamStatus._hideTimer);
    teamStatus._hideTimer = setTimeout(() => teamStatus.classList.remove("is-visible"), 3200);
}

function dateKey(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
