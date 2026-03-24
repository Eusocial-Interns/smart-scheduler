let events = [];

function generate_year_range(start, end){
    let years = "";
    for (let year = start; year <= end; year++) {
        years += "<option value='" + year + "'>" + year + "</option>";
    }
    return years;
}

function daysInMonth(month, year) {
    return 32 - new Date(year, month, 32).getDate();
}

today = new Date();
currentMonth = today.getMonth();
currentYear = today.getFullYear();
selectYear = document.getElementById("year");
selectMonth = document.getElementById("month");

createYear = generate_year_range(1970, 2050);

document.getElementById("year").innerHTML = createYear;

let calendar = document.getElementById("calendar");

let months = [
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
    "December"
];

let days = [
    "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
];

$dataHead = "<tr>";
for (dhead in days) {
    $dataHead += "<th data-days='" + days[dhead] + "'>" + days[dhead] + "</th>";
}
$dataHead += "</tr>";

document.getElementById("thead-month").innerHTML = $dataHead;

monthAndYear = document.getElementById("monthAndYear");
showCalendar(currentMonth, currentYear);

function next() {
    currentYear = currentMonth === 11 ?
        currentYear + 1 : currentYear;
    currentMonth = (currentMonth + 1) % 12;
    showCalendar(currentMonth, currentYear);
}

function previous() {
    currentYear = currentMonth === 0 ?
        currentYear - 1 : currentYear;
    currentMonth = currentMonth === 0 ?
        11 : currentMonth - 1;
    showCalendar(currentMonth, currentYear);
}

function jump() {
    currentYear = parseInt(selectYear.value);
    currentMonth = parseInt(selectMonth.value);
    showCalendar(currentMonth, currentYear);
}

function showCalendar(month, year){
    let firstDay = new Date(year, month, 1).getDay();
    tbl = document.getElementById("calendar-body");
    tbl.innerHTML = ""
    monthAndYear.innerHTML = months[month] + " " + year;
    selectYear.value = year;
    selectMonth.value = month;

    let date = 1;
    for (let i = 0; i < 6; i++) {
        let row = document.createElement("tr");
        for (let j = 0; j < 7; j++) {
            if(i === 0 && j < firstDay){

            
            cell = document.createElement("td");
            cellText = document.createTextNode("");
            cell.appendChild(cellText);
            row.appendChild(cell);
            }else if (date > daysInMonth(month, year)) {
            break;
            }else {
            cell = document.createElement("td");
            cell.setAttribute("data-date", date);
            cell.setAttribute("data-month", month + 1);
            cell.setAttribute("data-year", year);
            cell.setAttribute("data-month_name", months[month]);
            cell.className = "date-picker";
            cell.innerHTML = "<span>" + date + "</span";

            if(
                date === today.getDate() &&
                year === today.getFullYear() &&
                month === today.getMonth()
            ){
                cell.className = "date-picker selected";
            }
            row.appendChild(cell);
            date++;
        }
        }
        tbl.appendChild(row);
    }
}

showCalendar(currentMonth, currentYear);