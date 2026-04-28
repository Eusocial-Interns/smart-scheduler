
from collections import defaultdict
from apps.scheduling.models import Assignment


def build_weekly_schedule():
    assignments = Assignment.objects.select_related("employee", "shift")

    week = defaultdict(lambda: defaultdict(list))

    for assignment in assignments:
        shift = assignment.shift
        employee = assignment.employee

        day = shift.start_time.date() if shift.start_time else "unscheduled"
        role = "General"

        week[day][role].append({
            "employee": employee.name,
            "start_time": shift.start_time,
            "end_time": shift.end_time,
        })

    result = []

    for day, roles in week.items():
        day_data = {
            "day": str(day),
            "roles": []
        }

        for role, employees in roles.items():
            day_data["roles"].append({
                "role": role,
                "employees": employees
            })

        result.append(day_data)

    return {
        "days": result
    }