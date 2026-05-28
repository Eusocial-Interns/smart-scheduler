const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let currentRole = null;
let activeShift = null;
let myRoleNames = null; // Set of role names the current user can cover (primary + secondary)

async function api(url, options = {}) {
  const defaults = {
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrf() },
    credentials: "same-origin",
  };
  const resp = await fetch(url, { ...defaults, ...options });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || JSON.stringify(err) || `HTTP ${resp.status}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

function getCsrf() {
  return document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "";
}

function flash(msg, ok = true) {
  const el = document.getElementById("app-toast");
  if (!el) return;
  el.textContent = msg;
  el.style.background = ok ? "" : "#b4321e";
  el.classList.add("is-visible");
  setTimeout(() => el.classList.remove("is-visible"), 3200);
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtShiftStart(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtRelative(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

// ─── RENDER HELPERS ───────────────────────────────────────────────────────────

function renderShiftCard(shift, opts = {}) {
  const parts = shift.date_label?.split(",") ?? ["", ""];
  const dayPart = parts[0]?.trim() ?? "";
  const monthNum = parts[1]?.trim().split(" ") ?? [];
  const monthPart = monthNum[0] ?? "";
  const numPart = monthNum[1] ?? "";
  const isOpen = opts.isOpen;
  const isMine = opts.isMine;
  const hasPendingPickup = !!shift.has_pending_pickup;

  let actionHtml = "";
  if (isOpen && opts.onPickup) {
    if (hasPendingPickup) {
      actionHtml = `
        <div class="shift-card__action">
          <span class="shift-card__pending-label">Pending Approval</span>
          <button class="btn-pickup btn-pickup--volunteered" disabled>Volunteered</button>
        </div>`;
    } else {
      actionHtml = `
        <div class="shift-card__action">
          <button class="btn-pickup" data-id="${shift.shift_id}">Volunteer</button>
        </div>`;
    }
  }

  return `
    <div class="shift-card${isOpen ? " shift-card--open" : ""}${isMine ? " shift-card--mine" : ""}${hasPendingPickup ? " shift-card--pending" : ""}"
         ${isMine ? `data-shift-id="${shift.shift_id}" data-assignment-id="${shift.assignment_id ?? ""}" role="button" tabindex="0"` : ""}>
      <div class="shift-card__date">
        <span class="shift-card__date-day">${dayPart}</span>
        <span class="shift-card__date-num">${numPart}</span>
        <span class="shift-card__date-month">${monthPart}</span>
      </div>
      <div class="shift-card__title">${shift.title ?? "Shift"}</div>
      <div class="shift-card__meta">
        <span class="shift-card__role">${shift.role ?? ""}</span>
      </div>
      <div class="shift-card__time">${shift.start_time ?? ""} – ${shift.end_time ?? ""}</div>
      ${actionHtml}
    </div>`;
}

const DEPT_LABELS = { all: "All", foh: "Front of House", boh: "Back of House", management: "Management" };

function renderAnnouncementCard(ann) {
  const isRead = ann.is_read;
  const deptLabel = ann.department && ann.department !== "all" ? DEPT_LABELS[ann.department] ?? ann.department : null;
  const actionBtn = isRead
    ? `<button class="ann-mark-unread" data-id="${ann.id}" type="button">Mark as unread</button>`
    : `<button class="ann-mark-read" data-id="${ann.id}" type="button">Mark as read</button>`;
  return `
    <div class="announcement-card${isRead ? " announcement-card--read" : ""}" data-ann-id="${ann.id}">
      <div class="announcement-card__header">
        <span class="announcement-card__title">${ann.title}</span>
        <div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0">
          ${deptLabel ? `<span class="ann-dept-badge ann-dept-badge--${ann.department}">${deptLabel}</span>` : ""}
          <span class="announcement-card__date">${fmtRelative(ann.created_at)}</span>
        </div>
      </div>
      <p class="announcement-card__body">${ann.body}</p>
      <div class="announcement-card__footer">
        <p class="announcement-card__author">— ${ann.posted_by_name ?? "Manager"}</p>
        ${actionBtn}
      </div>
    </div>`;
}

function renderAnnouncementsSection(announcements, containerEl) {
  const unread = announcements.filter(a => !a.is_read);

  if (!unread.length) {
    containerEl.innerHTML = '<div class="empty-state">No new announcements.</div>';
    return;
  }

  containerEl.innerHTML = unread.map(a => renderAnnouncementCard(a)).join("");

  containerEl.querySelectorAll(".ann-mark-read").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/v1/announcements/${btn.dataset.id}/mark-read/`, { method: "POST" });
        loadDashboard();
      } catch (err) { flash(err.message, false); }
    });
  });
}

function typeLabel(type) {
  if (type === "timeoff") return ["Time Off", "request-summary-card__type--timeoff"];
  if (type === "availability") return ["Availability", "request-summary-card__type--availability"];
  return ["Swap", "request-summary-card__type--swap"];
}

async function cancelRequest(kind, id) {
  try {
    await api(`/api/v1/${kind}/${id}/cancel/`, { method: "POST" });
    flash("Request cancelled.");
    loadDashboard();
  } catch (err) {
    flash(err.message, false);
  }
}

function renderMyRequestCard(r, kind) {
  const [label, cls] = typeLabel(kind);
  let text = "";
  if (kind === "timeoff") text = `${r.start_date} → ${r.end_date}${r.reason ? ": " + r.reason : ""}`;
  else if (kind === "availability") text = `${r.day_name} → ${r.requested_status}`;
  else text = `${r.request_type === "swap" ? "Trade" : r.request_type === "giveaway" ? "Giveaway" : "Pickup"}: ${r.shift_title ?? ""}`;
  const endpoint = kind === "timeoff" ? "time-off-requests" : kind === "availability" ? "availability-change-requests" : "shift-swap-requests";
  return `
    <div class="request-summary-card">
      <span class="request-summary-card__type ${cls}">${label}</span>
      <span class="request-summary-card__text">${text}</span>
      <div style="display:flex;gap:.4rem;align-items:center">
        <span class="request-summary-card__status">Pending</span>
        <button class="btn-cancel-req" data-kind="${endpoint}" data-id="${r.id}">Cancel</button>
      </div>
    </div>`;
}

// ─── EMPLOYEE VIEW ────────────────────────────────────────────────────────────

function renderEmployeeDashboard(data) {
  document.getElementById("dash-role-label").textContent = "My Schedule";
  document.getElementById("dash-greeting").textContent = "Here's your week";
  document.getElementById("employee-view").hidden = false;

  // Upcoming shifts
  const upcomingEl = document.getElementById("upcoming-shifts-list");
  if (data.upcoming_shifts?.length) {
    upcomingEl.innerHTML = data.upcoming_shifts.map(s => renderShiftCard(s, { isMine: true })).join("");
    upcomingEl.querySelectorAll(".shift-card--mine").forEach(card => {
      const shiftId = card.dataset.shiftId;
      const shift = data.upcoming_shifts.find(s => String(s.shift_id) === String(shiftId));
      if (!shift) return;
      card.addEventListener("click", () => openShiftSheet(shift));
      card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openShiftSheet(shift); });
    });
  } else {
    upcomingEl.innerHTML = '<div class="empty-state">No shifts scheduled in the next 7 days.</div>';
  }

  // Incoming swap requests (this user is the requested party)
  const incomingSection = document.getElementById("incoming-swaps-section");
  const incomingList = document.getElementById("incoming-swaps-dash-list");
  if (incomingSection && incomingList) {
    const incoming = data.incoming_swaps ?? [];
    if (incoming.length) {
      incomingSection.hidden = false;
      incomingList.innerHTML = incoming.map(r => {
        const roleTag = r.shift_role_name ? `<span class="role-tag">${r.shift_role_name}</span>` : "";
        const isGiveaway = r.request_type === "giveaway";
        const body = isGiveaway
          ? `<span class="approval-card__title">${r.requester_name} wants to give you a shift</span>
             <span class="approval-card__sub">${roleTag} ${r.shift_title ?? ""} · ${fmtShiftStart(r.shift_start)}</span>`
          : `<span class="approval-card__title">${r.requester_name} wants to trade with you</span>
             <span class="approval-card__sub"><span style="opacity:.7">Their shift:</span> ${roleTag} ${r.shift_title ?? ""} · ${fmtShiftStart(r.shift_start)}</span>
             <span class="approval-card__sub"><span style="opacity:.7">Your shift:</span> ${r.target_shift_role_name ? `<span class="role-tag">${r.target_shift_role_name}</span>` : ""} ${r.target_shift_title ?? ""} · ${fmtShiftStart(r.target_shift_start)}</span>`;
        return `
          <div class="approval-card">
            <span class="approval-card__type">${isGiveaway ? "Shift Giveaway" : "Shift Trade Request"}</span>
            ${body}
            ${r.reason ? `<span class="approval-card__date">${r.reason}</span>` : ""}
            <div class="approval-card__actions">
              <button class="btn-approve" data-id="${r.id}">Accept</button>
              <button class="btn-deny" data-id="${r.id}">Decline</button>
            </div>
          </div>`;
      }).join("");

      incomingList.querySelectorAll(".btn-approve").forEach(btn => {
        btn.addEventListener("click", async () => {
          try {
            await api(`/api/v1/shift-swap-requests/${btn.dataset.id}/accept/`, { method: "POST" });
            flash("Accepted — waiting for manager approval.");
            loadDashboard();
          } catch (err) { flash(err.message, false); }
        });
      });
      incomingList.querySelectorAll(".btn-deny").forEach(btn => {
        btn.addEventListener("click", async () => {
          try {
            await api(`/api/v1/shift-swap-requests/${btn.dataset.id}/decline/`, { method: "POST" });
            flash("Declined.");
            loadDashboard();
          } catch (err) { flash(err.message, false); }
        });
      });
    } else {
      incomingSection.hidden = true;
    }
  }

  // Claimable giveaways
  const giveawaySection = document.getElementById("claimable-giveaways-section");
  const giveawayList = document.getElementById("claimable-giveaways-list");
  if (data.claimable_giveaways?.length && giveawaySection && giveawayList) {
    giveawaySection.hidden = false;
    giveawayList.innerHTML = data.claimable_giveaways.map(g => {
      const parts = (g.shift_start ? fmtShiftStart(g.shift_start) : "").split(" · ");
      const dayPart = parts[0]?.split(",")[0]?.trim() ?? "";
      const numPart = parts[0]?.split(" ")[2]?.trim() ?? "";
      return `
        <div class="shift-card shift-card--open">
          <div class="shift-card__date">
            <span class="shift-card__date-day">${dayPart}</span>
            <span class="shift-card__date-num">${numPart}</span>
          </div>
          <div class="shift-card__title">${g.shift_title ?? "Shift"}</div>
          <div class="shift-card__meta">
            ${g.shift_role_name ? `<span class="shift-card__role">${g.shift_role_name}</span>` : ""}
            <span style="margin-left:.4rem;color:var(--muted);font-size:.75rem">${g.requester_name ?? ""}</span>
          </div>
          <div class="shift-card__time">${parts[1] ?? ""}</div>
          <div class="shift-card__action">
            <button class="btn-pickup" data-id="${g.id}">Claim</button>
          </div>
        </div>`;
    }).join("");
    giveawayList.querySelectorAll(".btn-pickup").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await api(`/api/v1/shift-swap-requests/${btn.dataset.id}/accept/`, { method: "POST" });
          flash("Claimed — awaiting manager approval.");
          loadDashboard();
        } catch (err) {
          flash(err.message, false);
        }
      });
    });
  } else if (giveawaySection) {
    giveawaySection.hidden = true;
  }

  // Open shifts (pickup)
  const openEl = document.getElementById("open-shifts-employee-list");
  if (data.open_shifts?.length) {
    openEl.innerHTML = data.open_shifts.map(s => renderShiftCard(s, { isOpen: true, onPickup: true })).join("");
    openEl.querySelectorAll(".btn-pickup").forEach(btn => {
      btn.addEventListener("click", () => volunteerForShift(btn.dataset.id));
    });
  } else {
    openEl.innerHTML = '<div class="empty-state">No open shifts right now.</div>';
  }

  // Pending requests with cancel
  const pendingEl = document.getElementById("pending-requests-list");
  const allPending = [
    ...(data.pending_time_off ?? []).map(r => ({ kind: "timeoff", r })),
    ...(data.pending_availability ?? []).map(r => ({ kind: "availability", r })),
    ...(data.pending_swaps ?? []).map(r => ({ kind: "swap", r })),
  ];

  if (allPending.length) {
    pendingEl.innerHTML = allPending.map(({ kind, r }) => renderMyRequestCard(r, kind)).join("");
    pendingEl.querySelectorAll(".btn-cancel-req").forEach(btn => {
      btn.addEventListener("click", () => cancelRequest(btn.dataset.kind, btn.dataset.id));
    });
  } else {
    pendingEl.innerHTML = '<div class="empty-state">No pending requests.</div>';
  }

  // Announcements
  renderAnnouncementsSection(data.announcements ?? [], document.getElementById("announcements-employee-list"));
}

async function volunteerForShift(shiftId) {
  try {
    await api("/api/v1/shift-swap-requests/", {
      method: "POST",
      body: JSON.stringify({ shift: shiftId, request_type: "pickup", reason: "" }),
    });
    flash("Pickup request submitted — awaiting manager approval.");
    loadDashboard();
  } catch (err) {
    flash(err.message, false);
  }
}

// ─── MANAGER VIEW ─────────────────────────────────────────────────────────────

function renderManagerDashboard(data) {
  document.getElementById("dash-role-label").textContent = "Manager View";
  document.getElementById("dash-greeting").textContent = "Approvals & Team Overview";
  document.getElementById("manager-view").hidden = false;

  // Manager's own upcoming shifts
  const upcomingList = document.getElementById("manager-upcoming-list");
  if (upcomingList) {
    if (data.upcoming_shifts?.length) {
      upcomingList.innerHTML = data.upcoming_shifts.map(s => renderShiftCard(s, { isMine: true })).join("");
      upcomingList.querySelectorAll(".shift-card--mine").forEach(card => {
        const shiftId = card.dataset.shiftId;
        const shift = data.upcoming_shifts.find(s => String(s.shift_id) === String(shiftId));
        if (!shift) return;
        card.addEventListener("click", () => openShiftSheet(shift));
        card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openShiftSheet(shift); });
      });
    } else {
      upcomingList.innerHTML = '<div class="empty-state">No shifts scheduled in the next 7 days.</div>';
    }
  }

  // Pending queue
  const allPending = [
    ...(data.pending_time_off ?? []).map(r => ({
      kind: "time_off",
      id: r.id,
      typeLine: "Time Off Request",
      title: r.employee_name,
      sub: `${r.start_date} → ${r.end_date}${r.reason ? " · " + r.reason : ""}`,
    })),
    ...(data.pending_availability ?? []).map(r => ({
      kind: "availability",
      id: r.id,
      typeLine: "Availability Change",
      title: r.employee_name,
      sub: `${r.day_name} → ${r.requested_status}${r.reason ? " · " + r.reason : ""}`,
    })),
    ...(data.pending_swaps ?? []).map(r => ({
      kind: "swap",
      id: r.id,
      typeLine: r.request_type === "swap" ? "Shift Swap" : r.request_type === "giveaway" ? "Shift Giveaway" : "Shift Pickup",
      title: r.requester_name,
      role: r.shift_role_name ?? null,
      date: r.shift_start ? fmtShiftStart(r.shift_start) : null,
      sub: `${r.shift_title ?? ""}${r.coverer_name ? " · covered by " + r.coverer_name : !r.coverer_approved && r.request_type === "giveaway" ? " · awaiting coverer" : ""}${r.reason ? " · " + r.reason : ""}`,
    })),
  ];

  const queueEl = document.getElementById("manager-queue-list");
  const pillEl = document.getElementById("pending-count-pill");
  pillEl.textContent = `${allPending.length} pending`;

  if (allPending.length) {
    queueEl.innerHTML = allPending.map(item => `
      <div class="approval-card" data-kind="${item.kind}" data-id="${item.id}">
        <span class="approval-card__type">${item.typeLine}</span>
        <span class="approval-card__title">${item.title}</span>
        <span class="approval-card__sub">
          ${item.role ? `<span class="role-tag">${item.role}</span> ` : ""}${item.sub}
        </span>
        ${item.date ? `<span class="approval-card__date">${item.date}</span>` : ""}
        <div class="approval-card__actions">
          <button class="btn-approve" data-kind="${item.kind}" data-id="${item.id}">Approve</button>
          <button class="btn-deny" data-kind="${item.kind}" data-id="${item.id}">Deny</button>
        </div>
      </div>`).join("");

    queueEl.querySelectorAll(".btn-approve").forEach(btn => {
      btn.addEventListener("click", () => handleApproval(btn.dataset.kind, btn.dataset.id, "approve"));
    });
    queueEl.querySelectorAll(".btn-deny").forEach(btn => {
      btn.addEventListener("click", () => handleApproval(btn.dataset.kind, btn.dataset.id, "deny"));
    });
  } else {
    queueEl.innerHTML = '<div class="empty-state">No pending requests — all clear.</div>';
  }

  // Open shifts
  const openEl = document.getElementById("open-shifts-manager-list");
  if (data.open_shifts?.length) {
    openEl.innerHTML = data.open_shifts.map(s => renderShiftCard(s, { isOpen: true })).join("");
  } else {
    openEl.innerHTML = '<div class="empty-state">No open shifts posted.</div>';
  }

  // Manager's own pending requests
  const myReqSection = document.getElementById("manager-my-requests-section");
  const myReqList = document.getElementById("manager-my-requests-list");
  if (myReqSection && myReqList) {
    const myPending = [
      ...(data.my_time_off ?? []).map(r => ({ kind: "timeoff", r })),
      ...(data.my_availability ?? []).map(r => ({ kind: "availability", r })),
      ...(data.my_swaps ?? []).map(r => ({ kind: "swap", r })),
    ];
    if (myPending.length) {
      myReqSection.hidden = false;
      myReqList.innerHTML = myPending.map(({ kind, r }) => renderMyRequestCard(r, kind)).join("");
      myReqList.querySelectorAll(".btn-cancel-req").forEach(btn => {
        btn.addEventListener("click", () => cancelRequest(btn.dataset.kind, btn.dataset.id));
      });
    } else {
      myReqSection.hidden = true;
    }
  }

  // Today's workers
  renderTodayWorkers(data.today_workers ?? {});

  // Announcements
  renderAnnouncementsSection(data.announcements ?? [], document.getElementById("announcements-manager-list"));
}

function renderTodayWorkers(workers) {
  const body = document.getElementById("today-workers-body");
  const mgmt = workers.management ?? [];
  const foh  = workers.foh ?? [];
  const boh  = workers.boh ?? [];

  if (!mgmt.length && !foh.length && !boh.length) {
    body.innerHTML = '<div class="empty-state">No scheduled workers today.</div>';
    return;
  }

  const renderWorkerCard = (w, role) => {
    const initials = w.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
    return `
      <div class="worker-card" data-assignment-id="${w.assignment_id}">
        <div class="worker-card__avatar">${initials}</div>
        <div class="worker-card__info">
          <span class="worker-card__name">${w.name}</span>
          <span class="worker-card__role-chip">${role}</span>
        </div>
        <div class="worker-card__right">
          <span class="worker-card__time">${w.start_time} – ${w.end_time}</span>
          <button class="worker-card__night-off btn-night-off" data-id="${w.assignment_id}">Give night off</button>
        </div>
      </div>`;
  };

  const renderDept = (label, roleGroups, deptClass) => {
    if (!roleGroups.length) return "";
    const rolesHtml = roleGroups.map(rg => `
      <div class="today-role-group">
        <div class="today-role-group__label">${rg.role}</div>
        <div class="today-role-group__cards">
          ${rg.workers.map(w => renderWorkerCard(w, rg.role)).join("")}
        </div>
      </div>`).join("");
    return `
      <div class="today-dept-section">
        <div class="today-dept-section__header today-dept-section__header--${deptClass}">${label}</div>
        <div class="today-dept-section__body">${rolesHtml}</div>
      </div>`;
  };

  body.innerHTML = renderDept("Management", mgmt, "mgmt")
    + renderDept("Front of House", foh, "foh")
    + renderDept("Back of House", boh, "boh");

  body.querySelectorAll(".btn-night-off").forEach(btn => {
    btn.addEventListener("click", () => giveNightOff(btn.dataset.id, btn));
  });
}

async function giveNightOff(assignmentId, btn) {
  if (!confirm("Remove this worker from tonight's shift?")) return;
  btn.disabled = true;
  btn.textContent = "Removing…";
  try {
    await api(`/api/v1/assignments/${assignmentId}/`, { method: "DELETE" });
    const card = btn.closest(".worker-card");
    card.style.opacity = "0.4";
    card.style.pointerEvents = "none";
    btn.textContent = "Removed";
  } catch {
    btn.disabled = false;
    btn.textContent = "Give night off";
    flash("Failed to remove worker.");
  }
}

const kindToEndpoint = {
  time_off: "time-off-requests",
  availability: "availability-change-requests",
  swap: "shift-swap-requests",
};

async function handleApproval(kind, id, action) {
  const endpoint = kindToEndpoint[kind];
  if (!endpoint) return;
  try {
    await api(`/api/v1/${endpoint}/${id}/${action}/`, { method: "POST" });
    flash(action === "approve" ? "Approved." : "Denied.");
    loadDashboard();
  } catch (err) {
    flash(err.message, false);
  }
}

// ─── SHIFT ACTION SHEET ───────────────────────────────────────────────────────

function openShiftSheet(shift) {
  activeShift = shift;
  document.getElementById("sheet-shift-title").textContent = shift.title ?? "Shift";
  document.getElementById("sheet-shift-meta").textContent =
    `${shift.date_label ?? shift.date ?? ""} · ${shift.start_time ?? ""} – ${shift.end_time ?? ""}`;
  document.getElementById("sheet-giveaway-reason").value = "";
  document.getElementById("sheet-trade-reason").value = "";

  const giveawayTarget = document.getElementById("sheet-giveaway-target");
  giveawayTarget.innerHTML = '<option value="">Anyone (open giveaway)</option>';
  api(`/api/v1/employees/eligible_for_giveaway/?shift=${shift.shift_id}`).then(resp => {
    const emps = resp.results ?? resp;
    emps.forEach(emp => {
      const o = document.createElement("option");
      o.value = emp.id;
      o.textContent = emp.name;
      giveawayTarget.appendChild(o);
    });
  }).catch(() => {});

  const select = document.getElementById("sheet-trade-target");
  select.innerHTML = '<option value="">Loading teammates\' shifts…</option>';
  api(`/api/v1/shifts/?for_trade=true&my_shift=${shift.shift_id}&limit=100`).then(resp => {
    const allShifts = resp.results ?? resp;
    // Filter to shifts the current user is qualified to cover (primary + secondary roles)
    const shifts = myRoleNames?.size
      ? allShifts.filter(s => myRoleNames.has(s.role_name))
      : allShifts;
    select.innerHTML = '<option value="">Select a shift to trade for</option>';
    shifts.forEach(s => {
      const emp = s.assignments?.[0]?.employee_name ?? "Teammate";
      const role = s.role_name || s.title || "Shift";
      const label = `${role} · ${emp} · ${s.date_label} ${s.start_display}`;
      const o = document.createElement("option");
      o.value = s.id;
      o.dataset.employeeId = s.assignments?.[0]?.employee ?? "";
      o.textContent = label;
      select.appendChild(o);
    });
    if (!shifts.length) select.innerHTML = '<option value="">No tradeable shifts available</option>';
  }).catch(() => {
    select.innerHTML = '<option value="">Could not load shifts</option>';
  });

  document.getElementById("shift-sheet-overlay").hidden = false;
}

function closeShiftSheet() {
  document.getElementById("shift-sheet-overlay").hidden = true;
  activeShift = null;
}

document.getElementById("shift-sheet-close")?.addEventListener("click", closeShiftSheet);
document.getElementById("shift-sheet-overlay")?.addEventListener("click", e => {
  if (e.target === e.currentTarget) closeShiftSheet();
});

document.getElementById("sheet-giveaway-btn")?.addEventListener("click", async () => {
  if (!activeShift) return;
  const reason = document.getElementById("sheet-giveaway-reason").value.trim();
  const targetVal = document.getElementById("sheet-giveaway-target")?.value;
  const requested_employee = targetVal ? Number(targetVal) : null;
  try {
    await api("/api/v1/shift-swap-requests/", {
      method: "POST",
      body: JSON.stringify({
        request_type: "giveaway",
        shift: activeShift.shift_id,
        reason,
        ...(requested_employee ? { requested_employee } : {}),
      }),
    });
    flash(requested_employee
      ? "Giveaway sent — they'll need to accept before manager review."
      : "Giveaway posted — teammates can now claim it.");
    closeShiftSheet();
    loadDashboard();
  } catch (err) {
    flash(err.message, false);
  }
});

document.getElementById("sheet-trade-btn")?.addEventListener("click", async () => {
  if (!activeShift) return;
  const select = document.getElementById("sheet-trade-target");
  const targetShiftId = select.value;
  if (!targetShiftId) { flash("Pick a shift to trade for.", false); return; }
  const selectedOption = select.options[select.selectedIndex];
  const requestedEmployeeId = selectedOption?.dataset?.employeeId || null;
  const reason = document.getElementById("sheet-trade-reason").value.trim();
  try {
    await api("/api/v1/shift-swap-requests/", {
      method: "POST",
      body: JSON.stringify({
        request_type: "swap",
        shift: activeShift.shift_id,
        target_shift: Number(targetShiftId),
        requested_employee: requestedEmployeeId ? Number(requestedEmployeeId) : null,
        reason,
      }),
    });
    flash("Trade request sent — waiting for your teammate to accept.");
    closeShiftSheet();
    loadDashboard();
  } catch (err) {
    flash(err.message, false);
  }
});

// ─── ANNOUNCEMENTS FORM ────────────────────────────────────────────────────────

function initAnnouncementForm() {
  const openBtn = document.getElementById("open-announcement-form");
  const cancelBtn = document.getElementById("cancel-announcement");
  const wrap = document.getElementById("announcement-form-wrap");
  const form = document.getElementById("announcement-form");
  if (!form) return;

  openBtn?.addEventListener("click", () => {
    wrap.hidden = false;
    openBtn.hidden = true;
  });

  cancelBtn?.addEventListener("click", () => {
    wrap.hidden = true;
    openBtn.hidden = false;
    form.reset();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("ann-title").value.trim();
    const department = document.getElementById("ann-dept")?.value ?? "all";
    const body = document.getElementById("ann-body").value.trim();
    if (!title || !body) return;
    try {
      await api("/api/v1/announcements/", {
        method: "POST",
        body: JSON.stringify({ title, body, department }),
      });
      flash("Announcement posted.");
      form.reset();
      wrap.hidden = true;
      openBtn.hidden = false;
      loadDashboard();
    } catch (err) {
      flash(err.message, false);
    }
  });
}

// ─── BOOT ──────────────────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const [data, me] = await Promise.all([
      api("/api/v1/dashboard/"),
      api("/api/v1/employees/me/").catch(() => null),
    ]);
    currentRole = data.role;
    if (me?.role_names?.length) {
      myRoleNames = new Set(me.role_names);
    }
    if (data.role === "manager") {
      renderManagerDashboard(data);
    } else {
      renderEmployeeDashboard(data);
    }
  } catch (err) {
    flash(err.message, false);
  }
}

loadDashboard();
initAnnouncementForm();
