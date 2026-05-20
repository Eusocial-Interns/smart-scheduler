// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function api(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrf() },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || Object.values(body).flat().join(" ") || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function getCsrf() {
  return document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "";
}

function flash(msg, ok = true) {
  const el = document.getElementById("requests-status");
  if (!el) return;
  el.textContent = msg;
  el.style.background = ok ? "" : "#b4321e";
  el.classList.add("is-visible");
  setTimeout(() => el.classList.remove("is-visible"), 3400);
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusBadge(s) {
  const cls = s === "approved" ? "approved" : s === "denied" ? "denied" : "pending";
  return `<span class="status-badge status-badge--${cls}">${s}</span>`;
}

// ─── STATE ────────────────────────────────────────────────────────────────────

let me = null;
let myShifts = [];
let allPublishedShifts = [];
let openShifts = [];
let selectedDays = new Set();

// ─── AVAILABILITY TOGGLE ──────────────────────────────────────────────────────

document.querySelectorAll(".day-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const d = chip.dataset.day;
    if (selectedDays.has(d)) {
      selectedDays.delete(d);
      chip.classList.remove("is-selected");
    } else {
      selectedDays.add(d);
      chip.classList.add("is-selected");
    }
  });
});

document.getElementById("availability-request-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!selectedDays.size) {
    flash("Select at least one day.", false);
    return;
  }
  const status = document.querySelector('input[name="avail-status"]:checked')?.value || "available";
  const effective_date = document.getElementById("availability-effective").value;
  const reason = document.getElementById("availability-reason").value.trim();

  const days = Array.from(selectedDays);
  try {
    for (const day of days) {
      await api("/api/v1/availability-change-requests/", {
        method: "POST",
        body: JSON.stringify({ day_of_week: Number(day), requested_status: status, effective_date, reason }),
      });
    }
    flash(`Availability change submitted for ${days.length} day${days.length > 1 ? "s" : ""}.`);
    e.target.reset();
    selectedDays.clear();
    document.querySelectorAll(".day-chip").forEach(c => c.classList.remove("is-selected"));
    loadMyRequests();
  } catch (err) {
    flash(err.message, false);
  }
});

// ─── TIME OFF ─────────────────────────────────────────────────────────────────

document.getElementById("time-off-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const start_date = document.getElementById("time-off-start").value;
  const end_date = document.getElementById("time-off-end").value;
  const reason = document.getElementById("time-off-reason").value.trim();
  try {
    await api("/api/v1/time-off-requests/", {
      method: "POST",
      body: JSON.stringify({ start_date, end_date, reason }),
    });
    flash("Time off request submitted.");
    e.target.reset();
    loadMyRequests();
  } catch (err) {
    flash(err.message, false);
  }
});

// ─── SWAP TABS ────────────────────────────────────────────────────────────────

const swapForms = { swap: "swap-form", giveaway: "giveaway-form", pickup: "pickup-form" };
let activeTab = "swap";

document.querySelectorAll(".swap-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".swap-tab").forEach(t => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    activeTab = tab.dataset.tab;
    Object.values(swapForms).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    const formEl = document.getElementById(swapForms[activeTab]);
    if (formEl) formEl.hidden = false;
  });
});

// ─── SWAP FORMS ───────────────────────────────────────────────────────────────

function populateSelect(selectId, options, valueFn, labelFn) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const first = el.options[0];
  el.innerHTML = "";
  if (first) el.appendChild(first.cloneNode(true));
  options.forEach(opt => {
    const o = document.createElement("option");
    o.value = valueFn(opt);
    o.textContent = labelFn(opt);
    el.appendChild(o);
  });
}

function shiftLabel(s) {
  const start = new Date(s.start_time);
  const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${s.title} · ${day} ${time}`;
}

async function loadGiveawayTargets(shiftId) {
  const select = document.getElementById("giveaway-target-employee");
  if (!select) return;
  select.innerHTML = '<option value="">Anyone</option>';
  if (!shiftId) return;
  const resp = await api(`/api/v1/employees/eligible_for_giveaway/?shift=${shiftId}`).catch(() => []);
  const emps = resp.results ?? resp;
  emps.forEach(emp => {
    const o = document.createElement("option");
    o.value = emp.id;
    o.textContent = emp.name;
    select.appendChild(o);
  });
}

async function loadTradeTargets(myShiftId) {
  const url = myShiftId
    ? `/api/v1/shifts/?for_trade=true&my_shift=${myShiftId}&limit=200`
    : `/api/v1/shifts/?for_trade=true&limit=200`;
  const resp = await api(url).catch(() => ({ results: [] }));
  allPublishedShifts = resp.results ?? resp;
  populateSelect("swap-target-shift", allPublishedShifts, s => s.id, shiftLabel);
}

async function loadShiftsForForms() {
  // My published shifts (for swap/giveaway)
  const resp = await api("/api/v1/assignments/?limit=200").catch(() => ({ results: [] }));
  const assignments = resp.results ?? resp;
  myShifts = await Promise.all(
    assignments
      .filter(a => a.shift)
      .map(a => api(`/api/v1/shifts/${a.shift}/`).catch(() => null))
  ).then(arr => arr.filter(Boolean));

  // Open shifts (for pickup)
  const openResp = await api("/api/v1/shifts/?is_open=true").catch(() => ({ results: [] }));
  openShifts = openResp.results ?? openResp;

  populateSelect("swap-my-shift", myShifts, s => s.id, shiftLabel);
  populateSelect("giveaway-shift", myShifts, s => s.id, shiftLabel);
  populateSelect("pickup-shift", openShifts, s => s.id, shiftLabel);

  await loadTradeTargets(myShifts[0]?.id ?? null);
  await loadGiveawayTargets(myShifts[0]?.id ?? null);

  document.getElementById("swap-my-shift")?.addEventListener("change", e => {
    loadTradeTargets(e.target.value || null);
  });

  document.getElementById("giveaway-shift")?.addEventListener("change", e => {
    loadGiveawayTargets(e.target.value || null);
  });
}

// Trade form
document.getElementById("swap-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const shift = document.getElementById("swap-my-shift").value;
  const target_shift = document.getElementById("swap-target-shift").value;
  const reason = document.getElementById("swap-reason").value.trim();
  if (!shift || !target_shift) { flash("Select both shifts.", false); return; }

  // Derive requested_employee from target_shift
  const targetShift = allPublishedShifts.find(s => String(s.id) === String(target_shift));
  const requestedEmpId = targetShift?.assignments?.[0]?.employee;

  try {
    await api("/api/v1/shift-swap-requests/", {
      method: "POST",
      body: JSON.stringify({
        request_type: "swap",
        shift: Number(shift),
        target_shift: Number(target_shift),
        requested_employee: requestedEmpId ?? null,
        reason,
      }),
    });
    flash("Trade request submitted — your teammate will be notified.");
    e.target.reset();
    loadMyRequests();
  } catch (err) {
    flash(err.message, false);
  }
});

// Giveaway form
document.getElementById("giveaway-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const shift = document.getElementById("giveaway-shift").value;
  const reason = document.getElementById("giveaway-reason").value.trim();
  const targetVal = document.getElementById("giveaway-target-employee")?.value;
  const requested_employee = targetVal ? Number(targetVal) : null;
  if (!shift) { flash("Select a shift.", false); return; }
  try {
    await api("/api/v1/shift-swap-requests/", {
      method: "POST",
      body: JSON.stringify({
        request_type: "giveaway",
        shift: Number(shift),
        reason,
        ...(requested_employee ? { requested_employee } : {}),
      }),
    });
    flash(requested_employee
      ? "Giveaway sent — they'll need to accept before manager review."
      : "Giveaway posted — your teammates can now claim it.");
    e.target.reset();
    document.getElementById("giveaway-target-employee").innerHTML = '<option value="">Anyone</option>';
    loadMyRequests();
  } catch (err) {
    flash(err.message, false);
  }
});

// Pickup form
document.getElementById("pickup-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const shift = document.getElementById("pickup-shift").value;
  const reason = document.getElementById("pickup-reason").value.trim();
  if (!shift) { flash("Select a shift.", false); return; }
  try {
    await api("/api/v1/shift-swap-requests/", {
      method: "POST",
      body: JSON.stringify({ request_type: "pickup", shift: Number(shift), reason }),
    });
    flash("Pickup request submitted — awaiting manager approval.");
    e.target.reset();
    loadMyRequests();
  } catch (err) {
    flash(err.message, false);
  }
});

// ─── REQUEST HISTORY ──────────────────────────────────────────────────────────

function typeLabel(item) {
  if (item.start_date) return "Time Off";
  if (item.day_of_week !== undefined) return "Availability";
  if (item.request_type === "swap") return "Trade";
  if (item.request_type === "giveaway") return "Giveaway";
  if (item.request_type === "pickup") return "Pickup";
  return "Request";
}

function reqDescription(item) {
  if (item.start_date) return `${fmtDate(item.start_date)} → ${fmtDate(item.end_date)}`;
  if (item.day_of_week !== undefined) return `${item.day_name} → ${item.requested_status}`;
  if (item.request_type) return `${item.shift_title ?? "Shift"}${item.coverer_name ? " → " + item.coverer_name : ""}`;
  return "";
}

async function loadMyRequests() {
  const [timeOff, avail, swaps] = await Promise.all([
    api("/api/v1/time-off-requests/").catch(() => []),
    api("/api/v1/availability-change-requests/").catch(() => []),
    api("/api/v1/shift-swap-requests/").catch(() => []),
  ]);

  const mySwaps = (swaps.results ?? swaps).filter(s => s.requester === me?.id);
  const all = [
    ...(timeOff.results ?? timeOff),
    ...(avail.results ?? avail),
    ...mySwaps,
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const el = document.getElementById("my-request-list");
  if (!el) return;

  if (!all.length) {
    el.innerHTML = '<div class="empty-state">No requests yet.</div>';
    return;
  }

  el.innerHTML = all.map(item => {
    const isPending = item.status === "pending";
    const kind = item.start_date !== undefined
      ? "time-off-requests"
      : item.day_of_week !== undefined
        ? "availability-change-requests"
        : "shift-swap-requests";
    return `
      <div class="req-card">
        <span class="req-card__type">${typeLabel(item)}</span>
        <span class="req-card__title">${reqDescription(item)}</span>
        ${item.reason ? `<span class="req-card__sub">${item.reason}</span>` : ""}
        <div class="req-card__status">
          ${statusBadge(item.status)}
          ${isPending ? `<button class="btn-cancel-req" data-kind="${kind}" data-id="${item.id}">Cancel</button>` : ""}
        </div>
      </div>`;
  }).join("");

  el.querySelectorAll(".btn-cancel-req").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/v1/${btn.dataset.kind}/${btn.dataset.id}/cancel/`, { method: "POST" });
        flash("Request cancelled.");
        loadMyRequests();
      } catch (err) {
        flash(err.message, false);
      }
    });
  });

  // Incoming swap requests (requests where I am requested_employee or giveaways I can claim)
  const incoming = (swaps.results ?? swaps).filter(s =>
    (s.requested_employee === me?.id || (s.request_type === "giveaway" && !s.coverer && s.requester !== me?.id))
    && s.status === "pending"
    && !s.coverer_approved
  );

  const incomingSection = document.getElementById("incoming-swaps-section");
  const incomingList = document.getElementById("incoming-swaps-list");
  if (!incomingSection || !incomingList) return;

  if (incoming.length) {
    incomingSection.hidden = false;
    incomingList.innerHTML = incoming.map(s => `
      <div class="req-card" data-id="${s.id}">
        <span class="req-card__type">${s.request_type === "swap" ? "Trade Request" : "Shift Giveaway"}</span>
        <span class="req-card__title">${s.requester_name} → ${s.shift_title ?? "Shift"}</span>
        ${s.reason ? `<span class="req-card__sub">${s.reason}</span>` : ""}
        <div class="req-card__status">
          <button class="btn-accept" data-id="${s.id}">Accept</button>
        </div>
      </div>`).join("");

    incomingList.querySelectorAll(".btn-accept").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await api(`/api/v1/shift-swap-requests/${btn.dataset.id}/accept/`, { method: "POST" });
          flash("Accepted — awaiting manager approval.");
          loadMyRequests();
        } catch (err) {
          flash(err.message, false);
        }
      });
    });
  } else {
    incomingSection.hidden = true;
  }
}

// ─── MANAGER QUEUE ────────────────────────────────────────────────────────────

function fmtSwapDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function renderSwapCard(item) {
  const isSwap = item.request_type === "swap";
  const label = isSwap ? "Shift Trade" : item.request_type === "giveaway" ? "Shift Giveaway" : "Shift Pickup";
  const roleTag = item.shift_role_name ? `<span class="req-role-tag">${item.shift_role_name}</span>` : "";

  if (isSwap) {
    const targetRoleTag = item.target_shift_role_name ? `<span class="req-role-tag">${item.target_shift_role_name}</span>` : "";
    return `
      <div class="req-card req-card--swap">
        <span class="req-card__type">${label}</span>
        <div class="req-card__swap-parties">
          <div class="req-card__party">
            <span class="req-card__party-name">${item.requester_name ?? ""}</span>
            <span class="req-card__party-shift">${roleTag} ${item.shift_title ?? ""}</span>
            <span class="req-card__party-date">${fmtSwapDate(item.shift_start)}</span>
          </div>
          <span class="req-card__swap-arrow">⇄</span>
          <div class="req-card__party">
            <span class="req-card__party-name">${item.coverer_name ?? item.requested_employee_name ?? ""}</span>
            <span class="req-card__party-shift">${targetRoleTag} ${item.target_shift_title ?? ""}</span>
            <span class="req-card__party-date">${fmtSwapDate(item.target_shift_start)}</span>
          </div>
        </div>
        ${item.reason ? `<span class="req-card__sub">${item.reason}</span>` : ""}
        <div class="req-card__status">
          <button class="btn-approve" data-kind="shift-swap-requests" data-id="${item.id}">Approve</button>
          <button class="btn-deny" data-kind="shift-swap-requests" data-id="${item.id}">Deny</button>
        </div>
      </div>`;
  }

  return `
    <div class="req-card">
      <span class="req-card__type">${label} — ${item.requester_name ?? ""}</span>
      <span class="req-card__title">${roleTag} ${item.shift_title ?? ""}</span>
      <span class="req-card__sub">${fmtSwapDate(item.shift_start)}${item.reason ? " · " + item.reason : ""}</span>
      <div class="req-card__status">
        <button class="btn-approve" data-kind="shift-swap-requests" data-id="${item.id}">Approve</button>
        <button class="btn-deny" data-kind="shift-swap-requests" data-id="${item.id}">Deny</button>
      </div>
    </div>`;
}

async function loadManagerQueue() {
  const [timeOff, avail, swaps] = await Promise.all([
    api("/api/v1/time-off-requests/?status=pending").catch(() => []),
    api("/api/v1/availability-change-requests/?status=pending").catch(() => []),
    api("/api/v1/shift-swap-requests/?status=pending").catch(() => []),
  ]);

  const pendingSwaps = (swaps.results ?? swaps).filter(r =>
    r.request_type !== "swap" || r.coverer_approved
  );

  const all = [
    ...(timeOff.results ?? timeOff).map(r => ({ ...r, _kind: "time-off-requests", _label: "Time Off" })),
    ...(avail.results ?? avail).map(r => ({ ...r, _kind: "availability-change-requests", _label: "Availability" })),
    ...pendingSwaps,
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const el = document.getElementById("manager-request-list");
  const pill = document.getElementById("pending-count");
  if (pill) pill.textContent = `${all.length} pending`;
  if (!el) return;

  if (!all.length) {
    el.innerHTML = '<div class="empty-state">No pending requests.</div>';
    return;
  }

  el.innerHTML = all.map(item => {
    if (item.request_type) return renderSwapCard(item);
    return `
      <div class="req-card">
        <span class="req-card__type">${item._label} — ${item.employee_name ?? ""}</span>
        <span class="req-card__title">${reqDescription(item)}</span>
        ${item.reason ? `<span class="req-card__sub">${item.reason}</span>` : ""}
        <div class="req-card__status">
          <button class="btn-approve" data-kind="${item._kind}" data-id="${item.id}">Approve</button>
          <button class="btn-deny" data-kind="${item._kind}" data-id="${item.id}">Deny</button>
        </div>
      </div>`;
  }).join("");

  el.querySelectorAll(".btn-approve").forEach(btn => {
    btn.addEventListener("click", () => handleManagerAction(btn.dataset.kind, btn.dataset.id, "approve"));
  });
  el.querySelectorAll(".btn-deny").forEach(btn => {
    btn.addEventListener("click", () => handleManagerAction(btn.dataset.kind, btn.dataset.id, "deny"));
  });
}

async function handleManagerAction(kind, id, action) {
  try {
    await api(`/api/v1/${kind}/${id}/${action}/`, { method: "POST" });
    flash(action === "approve" ? "Approved." : "Denied.");
    loadManagerQueue();
  } catch (err) {
    flash(err.message, false);
  }
}

// ─── BOOT ──────────────────────────────────────────────────────────────────────

async function init() {
  const meResp = await api("/api/v1/employees/me/").catch(() => null);
  me = meResp;

  const pill = document.getElementById("current-user-pill");
  if (pill && me) pill.textContent = me.name;

  const isManager = me?.account_type === "manager";
  const managerSection = document.getElementById("manager-workspace");
  if (managerSection) managerSection.hidden = !isManager;

  await Promise.all([
    loadMyRequests(),
    loadShiftsForForms(),
    isManager ? loadManagerQueue() : Promise.resolve(),
  ]);
}

init();
