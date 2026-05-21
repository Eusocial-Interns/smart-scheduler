import random
from collections import defaultdict
from datetime import datetime, time, timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db.models import Count, Q
from django.utils import timezone

from apps.scheduling.models import (
    Assignment,
    BaselineAvailability,
    ClosedDay,
    Employee,
    ScheduleWeek,
    Shift,
    StaffingRequirement,
    TimeOffRequest,
    REQUEST_STATUS_APPROVED,
)

OPENER_KEYWORD = "opener"
CLOSER_KEYWORD = "closer"


def generate_schedule_from_requirements(week_start, department=None):
    schedule_week, _ = ScheduleWeek.objects.get_or_create(week_start=week_start)

    # When filtering by department, only delete that department's shifts so
    # other departments' existing assignments are preserved.
    shifts_qs = schedule_week.shifts.all()
    if department:
        shifts_qs = shifts_qs.filter(role__department=department)
    shifts_qs.delete()

    schedule_week.status = ScheduleWeek.STATUS_DRAFT
    schedule_week.published_at = None
    schedule_week.published_by = None
    schedule_week.save()

    summary = {
        "week_start": week_start.isoformat(),
        "department": department,
        "requirements": 0,
        "shifts_created": 0,
        "assignments_created": 0,
        "open_slots": [],
        "invalid_requirements": [],
    }

    week_end = week_start + timedelta(days=6)
    closed_dates = set(
        ClosedDay.objects.filter(date__gte=week_start, date__lte=week_end)
        .values_list("date", flat=True)
    )

    requirements = StaffingRequirement.objects.select_related("role").filter(is_active=True)
    if department:
        requirements = requirements.filter(role__department=department)
    requirements = requirements.order_by("day_of_week", "start_time")

    # Tracks opener/closer/total shifts assigned per employee this generation run.
    # Used to distribute opener and closer shifts fairly across the team.
    week_counts = defaultdict(lambda: {"opener": 0, "closer": 0, "total": 0})

    for requirement in requirements:
        summary["requirements"] += 1
        shift_date = week_start + timedelta(days=requirement.day_of_week)
        if shift_date in closed_dates:
            continue
        shift_start = aware_datetime(shift_date, requirement.start_time)
        shift_end_time = generated_end_time_for(requirement)
        shift_end = aware_datetime(shift_date, shift_end_time)

        try:
            shift, created = Shift.objects.get_or_create(
                schedule_week=schedule_week,
                role=requirement.role,
                title=requirement.title,
                start_time=shift_start,
                end_time=shift_end,
                defaults={
                    "notes": "Generated from staffing requirements.",
                },
            )
        except ValidationError as error:
            summary["invalid_requirements"].append(
                {
                    "role": requirement.role.name,
                    "title": requirement.title,
                    "date": shift_date.isoformat(),
                    "start_time": requirement.start_time.isoformat(timespec="minutes"),
                    "end_time": shift_end_time.isoformat(timespec="minutes"),
                    "message": "; ".join(error.messages),
                }
            )
            continue

        if created:
            summary["shifts_created"] += 1

        assigned_count = shift.assignments.count()
        slots_to_fill = max(requirement.required_count - assigned_count, 0)

        if slots_to_fill:
            created_count = fill_shift_assignments(
                shift=shift,
                requirement=requirement,
                shift_date=shift_date,
                shift_start=shift_start,
                shift_end=shift_end,
                slots_to_fill=slots_to_fill,
                week_counts=week_counts,
            )
            summary["assignments_created"] += created_count
            assigned_count += created_count

        open_count = max(requirement.required_count - assigned_count, 0)
        if open_count:
            shift.__class__.objects.filter(pk=shift.pk).update(is_open=True)
            summary["open_slots"].append(
                {
                    "role": requirement.role.name,
                    "title": requirement.title,
                    "date": shift_date.isoformat(),
                    "start_time": requirement.start_time.isoformat(timespec="minutes"),
                    "end_time": shift_end_time.isoformat(timespec="minutes"),
                    "required_count": requirement.required_count,
                    "assigned_count": assigned_count,
                    "open_count": open_count,
                }
            )
        else:
            shift.__class__.objects.filter(pk=shift.pk).update(is_open=False)

    return summary


def generated_end_time_for(requirement):
    return requirement.end_time or time(23, 59)


def shift_type_for(requirement):
    title = requirement.title.lower()
    if OPENER_KEYWORD in title:
        return "opener"
    if CLOSER_KEYWORD in title:
        return "closer"
    return "regular"


def sorted_by_score(candidates, stype, week_counts, availability_map, day_counts=None):
    """
    Score every candidate and sort descending so high scorers are tried first.

    Score = random base (0–1) + bonuses/penalties:
      +0.8  under desired_days_per_week target     — primary fairness driver
      +0.25 preferred availability for this day    — nudge, not a guarantee
      −0.6  per shift already worked today         — strongly prefer fresh employees
      −0.5  per day over desired_days target        — deprioritise over-scheduled workers
      −0.7  over same-type (opener/closer) cap     — soft cap: max(1, total // 2)
      −0.3  already carries both opener+closer     — discourages mixed heavy weeks

    Requirements are processed Monday→Sunday, opener→dinner→closer within each
    day, so week_counts naturally reflects who has worked most recently and the
    fairness bonus propagates correctly across the whole week.
    """
    if day_counts is None:
        day_counts = {}
    scored = []
    for emp in candidates:
        counts = week_counts[emp.id]
        total = counts["total"]
        score = random.random()

        # Desired-days target: bonus while under, penalty for each day over
        desired = emp.desired_days_per_week
        if desired is None or total < desired:
            score += 0.8
        elif total >= desired:
            score -= 0.5 * (total - desired + 1)

        # Preferred availability nudge
        if availability_map.get(emp.id) == "preferred":
            score += 0.25

        # Penalise employees who already have a shift today so later service
        # slots strongly prefer workers not yet scheduled on this calendar day.
        shifts_today = day_counts.get(emp.id, 0)
        if shifts_today > 0:
            score -= 0.6 * shifts_today

        # Opener / closer concentration constraints
        if stype in ("opener", "closer"):
            same_type_cap = max(1, total // 2)
            if counts[stype] >= same_type_cap:
                score -= 0.7
            if counts["opener"] > 0 and counts["closer"] > 0:
                score -= 0.3

        scored.append((score, emp))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [emp for _, emp in scored]


def fill_shift_assignments(shift, requirement, shift_date, shift_start, shift_end, slots_to_fill, week_counts):
    created_count = 0
    stype = shift_type_for(requirement)

    base_qs = (
        Employee.objects.filter(account_type=Employee.ACCOUNT_TYPE_EMPLOYEE)
        .exclude(assignments__shift=shift)
        .distinct()
    )
    # Primary-role workers are scheduled first; secondary-role workers only
    # fill remaining slots to avoid pulling them away from their primary role.
    primary_candidates = list(base_qs.filter(primary_role=requirement.role))
    secondary_candidates = list(
        base_qs.filter(roles=requirement.role).exclude(primary_role=requirement.role)
    )
    all_candidates = primary_candidates + secondary_candidates

    # Fetch preferred/available status for all candidates in one query
    avail_records = BaselineAvailability.objects.filter(
        employee_id__in=[c.id for c in all_candidates],
        day_of_week=requirement.day_of_week,
        is_active=True,
        effective_date__lte=shift_date,
    ).values("employee_id", "status")
    availability_map = {r["employee_id"]: r["status"] for r in avail_records}

    # Count existing same-day assignments per candidate using timezone-aware
    # bounds (midnight–midnight local time) so late-night shifts stored as
    # next-day UTC are still counted correctly.
    day_start = aware_datetime(shift_date, time(0, 0))
    day_end = aware_datetime(shift_date + timedelta(days=1), time(0, 0))
    day_counts = dict(
        Assignment.objects.filter(
            employee_id__in=[c.id for c in all_candidates],
            shift__start_time__gte=day_start,
            shift__start_time__lt=day_end,
        )
        .values("employee_id")
        .annotate(n=Count("employee_id"))
        .values_list("employee_id", "n")
    )

    sorted_primary = sorted_by_score(primary_candidates, stype, week_counts, availability_map, day_counts)
    sorted_secondary = sorted_by_score(secondary_candidates, stype, week_counts, availability_map, day_counts)
    candidates = sorted_primary + sorted_secondary

    for employee in candidates:
        if created_count >= slots_to_fill:
            break
        if not employee_can_cover(employee, requirement, shift_date, shift_start, shift_end):
            continue

        try:
            Assignment.objects.create(employee=employee, shift=shift)
        except (ValidationError, IntegrityError):
            continue

        if stype in ("opener", "closer"):
            week_counts[employee.id][stype] += 1
        week_counts[employee.id]["total"] += 1
        created_count += 1

    return created_count


def employee_can_cover(employee, requirement, shift_date, shift_start, shift_end):
    if TimeOffRequest.objects.filter(
        employee=employee,
        status=REQUEST_STATUS_APPROVED,
        start_date__lte=shift_date,
        end_date__gte=shift_date,
    ).exists():
        return False

    if Assignment.objects.filter(
        employee=employee,
        shift__start_time__lt=shift_end,
        shift__end_time__gt=shift_start,
    ).exists():
        return False

    return BaselineAvailability.objects.filter(
        employee=employee,
        day_of_week=requirement.day_of_week,
        is_active=True,
        effective_date__lte=shift_date,
    ).exists()


def aware_datetime(date_value, time_value):
    return timezone.make_aware(
        datetime.combine(date_value, time_value),
        timezone.get_current_timezone(),
    )


def copy_schedule_from_last_week(week_start):
    last_week_start = week_start - timedelta(days=7)

    try:
        last_schedule = ScheduleWeek.objects.get(week_start=last_week_start)
    except ScheduleWeek.DoesNotExist:
        return {"error": "No published or draft schedule found for last week."}

    schedule_week, _ = ScheduleWeek.objects.get_or_create(week_start=week_start)
    schedule_week.shifts.all().delete()
    schedule_week.status = ScheduleWeek.STATUS_DRAFT
    schedule_week.published_at = None
    schedule_week.published_by = None
    schedule_week.save()

    week_end = week_start + timedelta(days=6)
    closed_dates = set(
        ClosedDay.objects.filter(date__gte=week_start, date__lte=week_end)
        .values_list("date", flat=True)
    )

    summary = {
        "week_start": week_start.isoformat(),
        "assignments_copied": 0,
        "skipped_time_off": 0,
        "skipped_closed": 0,
    }

    last_shifts = (
        last_schedule.shifts
        .select_related("role")
        .prefetch_related("assignments__employee")
    )

    for last_shift in last_shifts:
        local_start = timezone.localtime(last_shift.start_time)
        local_end = timezone.localtime(last_shift.end_time)
        day_offset = (local_start.date() - last_week_start).days
        new_date = week_start + timedelta(days=day_offset)

        if new_date in closed_dates:
            summary["skipped_closed"] += last_shift.assignments.count()
            continue

        new_start = aware_datetime(new_date, local_start.time())
        new_end = aware_datetime(new_date, local_end.time())

        new_shift, _ = Shift.objects.get_or_create(
            schedule_week=schedule_week,
            role=last_shift.role,
            title=last_shift.title,
            start_time=new_start,
            end_time=new_end,
            defaults={"notes": "Copied from last week."},
        )

        for assignment in last_shift.assignments.all():
            if TimeOffRequest.objects.filter(
                employee=assignment.employee,
                status=REQUEST_STATUS_APPROVED,
                start_date__lte=new_date,
                end_date__gte=new_date,
            ).exists():
                summary["skipped_time_off"] += 1
                continue

            try:
                Assignment.objects.create(employee=assignment.employee, shift=new_shift)
                summary["assignments_copied"] += 1
            except (ValidationError, IntegrityError):
                pass

    return summary
