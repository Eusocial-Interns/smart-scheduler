// -------------------------

const monthYearElement = document.getElementById('monthYear');
const datesElement = document.getElementById('dates');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const viewButtons = document.querySelectorAll('[data-view]');

// -------------------------

const calendarState = {
    currentDate: new Date(),
    view: 'month' // future-proof (month, week, day)
};
let shifts = [];
let employeeMap = {};

// -------------------------

const setLoading = (isLoading) => {
    if (isLoading) {
        datesElement.innerHTML = `<div class="loading">Loading shifts...</div>`;
    }
};

const setError = (message) => {
    datesElement.innerHTML = `<div class="error">${message}</div>`;
};

// -------------------------

const fetchEmployees = async () => {
    try {
        setLoading(true);
        const res = await fetch('/api/v1/employees/');
        const employees = await res.json();
        employees.forEach(emp => {
            employeeMap[emp.id] = emp.name;
        });
        await fetchShifts();
        setLoading(false);
    } catch (error) {
        console.error(error);
        setError('Failed to load employees.');
    }
};

// -------------------------

const fetchShifts = async () => {
    try {
        const assignmentsRes = await fetch('/api/v1/assignments/');
        const assignments = await assignmentsRes.json();

        const shiftPromises = assignments.map(async assignment => {
            const shiftRes = await fetch(`/api/v1/shifts/${assignment.shift}/`);
            const shift = await shiftRes.json();
            return {
    			employeeId: assignment.employee,
    			shiftId: assignment.shift,
    			start: new Date(shift.start_time),
    			end: new Date(shift.end_time),
    			role: 'General',      // placeholder 
    			status: 'Assigned'    // placeholder status
			};
        });

        shifts = await Promise.all(shiftPromises);
        renderShifts();
		renderUpcomingShifts();
    } catch (error) {
        console.error(error);
        setError('Failed to load shifts.');
    }
};

// -------------------------

const renderMonthView = () => {
	const currentYear = calendarState.currentDate.getFullYear();
    const currentMonth = calendarState.currentDate.getMonth();

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const totalDays = lastDay.getDate();
    const firstDayIndex = (firstDay.getDay() + 6) % 7;
    const lastDayIndex = (lastDay.getDay() + 6) % 7;

    monthYearElement.textContent = calendarState.currentDate.toLocaleString('default', {month: 'long', year: 'numeric'});

    let datesHTML = '';

    //Previous
    for (let i = firstDayIndex; i > 0; i--) {
        const prevDate = new Date(currentYear, currentMonth, 0 - i + 1);
        datesHTML += `<div class="date inactive">${prevDate.getDate()}</div>`;
    }

    //Current
    for (let i = 1; i <= totalDays; i++) {
        const date = new Date(currentYear, currentMonth, i);
        const activeClass = date.toDateString() === new Date().toDateString() ? 'active' : '';
        datesHTML += `<div class="date ${activeClass}">${i}</div>`;
    }

    //Next
    for (let i = 1; i < 7 - lastDayIndex; i++) {
        const nextDate = new Date(currentYear, currentMonth + 1, i);
        datesHTML += `<div class="date inactive">${nextDate.getDate()}</div>`;
    }

    datesElement.innerHTML = datesHTML;

	
	renderShifts();
	

}

// -------------------------

const renderWeekView = () => {
    datesElement.innerHTML = '<div class="placeholder">Week view coming soon</div>';
};

// -------------------------

const renderDayView = () => {
    datesElement.innerHTML = '<div class="placeholder">Day view coming soon</div>';
};

// -------------------------

const updateCalendar = () => {

	if(!datesElement) return;

	switch (calendarState.view) {
        case 'month':
            renderMonthView();
            break;
        case 'week':
            renderWeekView();
            break;
        case 'day':
            renderDayView();
            break;
        default:
            renderMonthView();
    }

	updateHeader();

};

// -------------------------

const updateHeader = () => {
    const date = calendarState.currentDate;

    if (calendarState.view === 'month') {
        monthYearElement.textContent = date.toLocaleString('default', {
            month: 'long',
            year: 'numeric'
        });
    } else if (calendarState.view === 'week') {
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - startOfWeek.getDay());

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        monthYearElement.textContent =
            `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
    } else {
        monthYearElement.textContent = date.toDateString();
    }
};

// -------------------------

const changeDate = (direction) => {
    const date = calendarState.currentDate;

    switch (calendarState.view) {
        case 'month':
            date.setMonth(date.getMonth() + direction);
            break;
        case 'week':
            date.setDate(date.getDate() + (7 * direction));
            break;
        case 'day':
            date.setDate(date.getDate() + direction);
            break;
    }

    updateCalendar();
};

// -------------------------

viewButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        calendarState.view = btn.dataset.view;
        updateCalendar();
    });
});

// -------------------------

const createShiftCard = (shift) => {
    const shiftDiv = document.createElement('div');
    shiftDiv.className = 'shift-card';

    const employeeName = employeeMap[shift.employeeId] || `Employee ${shift.employeeId}`;

    const start = shift.start;
    const end = shift.end;

    const startHours = String(start.getHours()).padStart(2, '0');
    const startMinutes = String(start.getMinutes()).padStart(2, '0');
    const endHours = String(end.getHours()).padStart(2, '0');
    const endMinutes = String(end.getMinutes()).padStart(2, '0');

    const timeRange = `${startHours}:${startMinutes} - ${endHours}:${endMinutes}`;

    // Placeholder role + status (until backend supports it)
    const role = shift.role || 'General';
    const status = shift.status || 'Assigned';

    shiftDiv.innerHTML = `
        <div class="shift-role">${role}</div>
        <div class="shift-employee">${employeeName}</div>
        <div class="shift-time">${timeRange}</div>
        <div class="shift-status ${status.toLowerCase()}">${status}</div>
    `;

    return shiftDiv;
};

// -------------------------

const renderShifts = () => {
    const dateElements = document.querySelectorAll('#dates .date');

    //Clear Card
    dateElements.forEach(el => {
        el.querySelectorAll('.shift-card, .no-shifts').forEach(card => card.remove());
    });

    
    shifts.forEach(shift => {
        const shiftDate = shift.start;
        const shiftDay = shiftDate.getDate();
        const shiftMonth = shiftDate.getMonth();
        const shiftYear = shiftDate.getFullYear();

        if (shiftMonth === calendarState.currentDate.getMonth() && shiftYear === calendarState.currentDate.getFullYear()) {
            dateElements.forEach(el => {
                if (+el.textContent === shiftDay && !el.classList.contains('inactive')) {
                    const shiftDiv = createShiftCard(shift);
					el.appendChild(shiftDiv);
                }
            });
        }
    });

    //Placeholder
    dateElements.forEach(el => {
        if (!el.classList.contains('inactive') && el.querySelectorAll('.shift-card').length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'no-shifts';
            placeholder.textContent = 'No shifts';
            el.appendChild(placeholder);
        }
    });
};

// -------------------------

const shiftListElement = document.getElementById('shiftList');

const renderUpcomingShifts = () => {
    // Clear existing list
    shiftListElement.innerHTML = '';

    // Sort shifts by start date
    const upcomingShifts = shifts
        .filter(shift => shift.start >= new Date()) // future shifts only
        .sort((a, b) => a.start - b.start);

    if (upcomingShifts.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No upcoming shifts';
        shiftListElement.appendChild(li);
        return;
    }

    upcomingShifts.forEach(shift => {
        const li = document.createElement('li');

        const employeeName = employeeMap[shift.employeeId] || `Employee ${shift.employeeId}`;
        const role = shift.role || 'General';

        const start = shift.start;
        const end = shift.end;

        const startHours = String(start.getHours()).padStart(2, '0');
        const startMinutes = String(start.getMinutes()).padStart(2, '0');
        const endHours = String(end.getHours()).padStart(2, '0');
        const endMinutes = String(end.getMinutes()).padStart(2, '0');

        const dateStr = `${start.getMonth() + 1}/${start.getDate()}/${start.getFullYear()}`;
        const timeStr = `${startHours}:${startMinutes} - ${endHours}:${endMinutes}`;

        li.innerHTML = `
            <strong>${role}</strong> - ${employeeName} ${dateStr} (${timeStr})
            <button class="delete-shift">Delete</button>
        `;

        // Add delete functionality
        li.querySelector('.delete-shift').addEventListener('click', () => {
            // Remove shift from array
            shifts = shifts.filter(s => s.shiftId !== shift.shiftId);
            renderUpcomingShifts();
            renderShifts(); // update calendar view
        });

        shiftListElement.appendChild(li);
    });
};

// -------------------------

prevBtn.addEventListener('click', () => {
    changeDate(-1);
});

nextBtn.addEventListener('click', () => {
    changeDate(1);
});

// -------------------------

fetchEmployees();
updateCalendar();

// -------------------------

// -------------------------
// Existing fetchEmployees + calendar init
fetchEmployees();
updateCalendar();

// -------------------------
// Add Shift button handler
document.getElementById('addShift').addEventListener('click', async e => {
    e.preventDefault();

    const dateInput = document.getElementById('shiftDate').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const employeeId = parseInt(document.getElementById('employee').value);
    const role = document.getElementById('position').value;

    // Basic validation
    if (!dateInput || !startTime || !endTime || isNaN(employeeId) || !role) {
        alert('Please fill in all required fields.');
        return;
    }

    const start = `${dateInput}T${startTime}`;
    const end = `${dateInput}T${endTime}`;

    try {
        const res = await fetch('/api/v1/shifts/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                employee: employeeId,
                role,
                start_time: start,
                end_time: end
            })
        });

        if (!res.ok) throw new Error('Failed to create shift');

        const newShift = await res.json();

        shifts.push({
            shiftId: newShift.id,
            employeeId: newShift.employee,
            role: newShift.role,
            start: new Date(newShift.start_time),
            end: new Date(newShift.end_time)
        });

        renderUpcomingShifts();
        updateCalendar();

        const addShiftModal = document.getElementById('addShiftModal');
        if (addShiftModal) addShiftModal.style.display = 'none';

        document.getElementById('shiftDate').value = '';
        document.getElementById('startTime').value = '';
        document.getElementById('endTime').value = '';
        document.getElementById('employee').value = '';
        document.getElementById('position').value = '';

        alert('Shift added successfully!');
    } catch (error) {
        console.error(error);
        alert('Error creating shift. Please try again.');
    }
});
