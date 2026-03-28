// -------------------------

const monthYearElement = document.getElementById('monthYear');
const datesElement = document.getElementById('dates');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

// -------------------------

let currentDate = new Date();
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

const updateCalendar = () => {
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const totalDays = lastDay.getDate();
    const firstDayIndex = firstDay.getDay();
    const lastDayIndex = lastDay.getDay();

    monthYearElement.textContent = currentDate.toLocaleString('default', {month: 'long', year: 'numeric'});

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

        if (shiftMonth === currentDate.getMonth() && shiftYear === currentDate.getFullYear()) {
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
    currentDate.setMonth(currentDate.getMonth() - 1);
    updateCalendar();
});

nextBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    updateCalendar();
});

// -------------------------

updateCalendar();
fetchEmployees();