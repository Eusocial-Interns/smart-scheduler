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
                end: new Date(shift.end_time)
            };
        });

        shifts = await Promise.all(shiftPromises);
        renderShifts();
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

	if (shifts.length > 0){
		renderShifts();
	}

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
                    const shiftDiv = document.createElement('div');
                    shiftDiv.className = 'shift-card';

                    const startHours = String(shiftDate.getHours()).padStart(2, '0');
                    const startMinutes = String(shiftDate.getMinutes()).padStart(2, '0');
                    const endHours = String(shift.end.getHours()).padStart(2, '0');
                    const endMinutes = String(shift.end.getMinutes()).padStart(2, '0');

                    const employeeName = employeeMap[shift.employeeId] || `Employee ${shift.employeeId}`;

                    shiftDiv.textContent = `${employeeName} (${startHours}:${startMinutes}-${endHours}:${endMinutes})`;
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

prevBtn.addEventListener('click', () => {
    changeDate(-1);
});

nextBtn.addEventListener('click', () => {
    changeDate(1);
});

// -------------------------

fetchEmployees();
updateCalendar();
