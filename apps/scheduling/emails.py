import logging
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils import timezone

logger = logging.getLogger(__name__)


def _requests_url(http_request):
    return http_request.build_absolute_uri(reverse("requests"))


def _schedule_url(http_request, week_start):
    week_param = week_start.strftime("%Y-%m-%d")
    return http_request.build_absolute_uri(f"{reverse('weekly_schedule')}?week={week_param}")


def _send(subject, text_body, html_body, recipients):
    if not recipients:
        return
    try:
        send_mail(
            subject=subject,
            message=text_body,
            from_email=None,
            recipient_list=recipients,
            html_message=html_body,
            fail_silently=False,
        )
        logger.info("Email '%s' sent to %s", subject, recipients)
    except Exception:
        logger.exception("Failed to send email '%s'", subject)


# ── Schedule published ────────────────────────────────────────────────────────

def send_schedule_published(schedule_week, department, http_request):
    from apps.scheduling.models import Employee

    week_start = schedule_week.week_start
    week_end = schedule_week.week_end
    week_str = f"{week_start.strftime('%B %d')} – {week_end.strftime('%B %d, %Y')}"
    dept_label = {"foh": "Front of House", "boh": "Back of House", "management": "Management"}.get(department)

    qs = Employee.objects.filter(
        assignments__shift__schedule_week=schedule_week,
    ).exclude(email="").distinct()
    if department:
        qs = qs.filter(assignments__shift__role__department=department)
    recipients = list(qs.values_list("email", flat=True))

    if not recipients:
        logger.info("Schedule published email skipped — no employees with assignments for week %s", week_str)
        return

    subject = f"Schedule for {week_str} is out!"
    url = _schedule_url(http_request, week_start)

    dept_line = f" ({dept_label})" if dept_label else ""
    text_body = (
        f"The schedule{dept_line} for the week of {week_str} is ready.\n\n"
        f"View your schedule: {url}\n\n"
        "Have a great week!"
    )
    html_body = render_to_string(
        "scheduling/emails/schedule_published.html",
        {"week_str": week_str, "schedule_url": url, "dept_label": dept_label},
    )
    _send(subject, text_body, html_body, recipients)


# ── Trade proposed → target employee ─────────────────────────────────────────

def send_trade_proposed(swap_request, http_request):
    target = swap_request.requested_employee
    if not target or not target.email:
        return

    requester_name = swap_request.requester.name if swap_request.requester else "A teammate"
    shift = swap_request.shift
    shift_start = timezone.localtime(shift.start_time)
    shift_str = f"{shift_start.strftime('%A, %B %-d')} at {shift_start.strftime('%-I:%M %p')}"
    role_name = shift.role.name if shift.role else "Shift"
    is_giveaway = swap_request.request_type == "giveaway"

    subject = (
        f"{requester_name} wants to give you a shift"
        if is_giveaway
        else f"{requester_name} wants to trade shifts with you"
    )
    url = _requests_url(http_request)
    text_body = (
        f"Hi {target.name},\n\n"
        f"{requester_name} {'wants to give you' if is_giveaway else 'has proposed a shift trade with'} you.\n\n"
        f"  Their shift: {role_name} — {shift.title} on {shift_str}\n"
        + (f"  Reason: {swap_request.reason}\n" if swap_request.reason else "")
        + f"\nLog in to accept or decline: {url}"
    )
    html_body = render_to_string(
        "scheduling/emails/trade_proposed.html",
        {
            "target_name": target.name,
            "requester_name": requester_name,
            "label": "Shift Giveaway" if is_giveaway else "Shift Trade Request",
            "action_verb": "give you a shift" if is_giveaway else "trade shifts with",
            "role_name": role_name,
            "shift_title": shift.title,
            "shift_str": shift_str,
            "reason": swap_request.reason,
            "url": url,
        },
    )
    _send(subject, text_body, html_body, [target.email])


# ── Trade accepted → all managers ─────────────────────────────────────────────

def send_trade_accepted_notify_managers(swap_request, http_request):
    from apps.scheduling.models import Employee

    manager_emails = list(
        Employee.objects.filter(account_type=Employee.ACCOUNT_TYPE_MANAGER)
        .exclude(email="")
        .values_list("email", flat=True)
    )
    if not manager_emails:
        return

    requester_name = swap_request.requester.name if swap_request.requester else "Employee"
    coverer_name = swap_request.coverer.name if swap_request.coverer else "A teammate"
    shift = swap_request.shift
    shift_start = timezone.localtime(shift.start_time)
    shift_str = f"{shift_start.strftime('%A, %B %-d')} at {shift_start.strftime('%-I:%M %p')}"
    role_name = shift.role.name if shift.role else "Shift"

    subject = f"Trade accepted — {coverer_name} ↔ {requester_name} needs your approval"
    url = _requests_url(http_request)
    text_body = (
        f"{coverer_name} accepted {requester_name}'s trade request.\n\n"
        f"  Shift: {role_name} — {shift.title} on {shift_str}\n\n"
        f"Log in to approve or deny: {url}"
    )
    html_body = render_to_string(
        "scheduling/emails/trade_accepted_managers.html",
        {
            "requester_name": requester_name,
            "coverer_name": coverer_name,
            "role_name": role_name,
            "shift_title": shift.title,
            "shift_str": shift_str,
            "url": url,
        },
    )
    _send(subject, text_body, html_body, manager_emails)


# ── Request submitted → all managers ─────────────────────────────────────────

def send_request_submitted_to_managers(employee, request_type_label, detail, http_request):
    from apps.scheduling.models import Employee

    manager_emails = list(
        Employee.objects.filter(account_type=Employee.ACCOUNT_TYPE_MANAGER)
        .exclude(email="")
        .values_list("email", flat=True)
    )
    if not manager_emails:
        return

    subject = f"{employee.name} submitted a {request_type_label} request"
    url = _requests_url(http_request)
    text_body = (
        f"{employee.name} has submitted a new {request_type_label} request.\n\n"
        f"  {detail}\n\n"
        f"Log in to review: {url}"
    )
    html_body = render_to_string(
        "scheduling/emails/request_submitted_managers.html",
        {
            "employee_name": employee.name,
            "request_type_label": request_type_label,
            "detail": detail,
            "url": url,
        },
    )
    _send(subject, text_body, html_body, manager_emails)


# ── Availability batch submitted → all managers ───────────────────────────────

def send_availability_batch_to_managers(employee, details, http_request):
    from apps.scheduling.models import Employee

    manager_emails = list(
        Employee.objects.filter(account_type=Employee.ACCOUNT_TYPE_MANAGER)
        .exclude(email="")
        .values_list("email", flat=True)
    )
    if not manager_emails:
        return

    subject = f"{employee.name} submitted an availability change request"
    url = _requests_url(http_request)
    text_body = (
        f"{employee.name} has submitted availability change requests.\n\n"
        + "\n".join(f"  • {d}" for d in details)
        + f"\n\nLog in to review: {url}"
    )
    html_body = render_to_string(
        "scheduling/emails/request_submitted_managers.html",
        {
            "employee_name": employee.name,
            "request_type_label": "availability change",
            "details": details,
            "url": url,
        },
    )
    _send(subject, text_body, html_body, manager_emails)


# ── Night off given → employee ───────────────────────────────────────────────

def send_night_off_to_employee(employee, shift, http_request):
    if not employee.email:
        return

    from django.utils import timezone as tz
    shift_date = tz.localtime(shift.start_time).strftime("%A, %B %-d")
    shift_time = (
        tz.localtime(shift.start_time).strftime("%-I:%M %p")
        + " – "
        + tz.localtime(shift.end_time).strftime("%-I:%M %p")
    )
    role_name = shift.role.name if shift.role_id else "your shift"
    url = _requests_url(http_request)

    subject = "You've been given the night off"
    text_body = (
        f"Hi {employee.name},\n\n"
        f"Your manager has given you the night off for {shift_date}.\n\n"
        f"  {role_name} · {shift_time}\n\n"
        f"You're all set — no action needed.\n\n"
        f"View your schedule: {url}"
    )
    html_body = render_to_string(
        "scheduling/emails/night_off.html",
        {
            "employee_name": employee.name,
            "shift_date": shift_date,
            "shift_time": shift_time,
            "role_name": role_name,
            "url": url,
        },
    )
    _send(subject, text_body, html_body, [employee.email])


# ── Swap/giveaway/pickup applied → parties involved ──────────────────────────

def send_swap_applied(swap_request, http_request):
    from apps.scheduling.models import ShiftSwapRequest

    requester = swap_request.requester
    coverer = swap_request.coverer or swap_request.requested_employee
    shift = swap_request.shift
    target_shift = swap_request.target_shift
    url = _requests_url(http_request)

    shift_start = timezone.localtime(shift.start_time)
    shift_str = shift_start.strftime("%A, %B %-d at %-I:%M %p")
    role_name = shift.role.name if shift.role else "Shift"

    def _send_confirmed(recipient, eyebrow, headline, body, detail_rows, cta_label):
        if not recipient or not recipient.email:
            return
        text_lines = "\n".join(f"  {r['label']}: {r['value']}" for r in detail_rows)
        text_body = f"Hi {recipient.name},\n\n{body}\n\n{text_lines}\n\nView your schedule: {url}"
        html_body = render_to_string(
            "scheduling/emails/swap_confirmed.html",
            {
                "recipient_name": recipient.name,
                "eyebrow": eyebrow,
                "headline": headline,
                "body": body,
                "detail_rows": detail_rows,
                "cta_label": cta_label,
                "url": url,
            },
        )
        _send(headline, text_body, html_body, [recipient.email])

    if swap_request.request_type == ShiftSwapRequest.TYPE_SWAP and target_shift:
        target_start = timezone.localtime(target_shift.start_time)
        target_str = target_start.strftime("%A, %B %-d at %-I:%M %p")
        target_role = target_shift.role.name if target_shift.role else "Shift"

        _send_confirmed(
            requester,
            eyebrow="Shift Swap Confirmed",
            headline=f"Shift swap confirmed — {target_role} on {target_str}",
            body="your shift swap has been approved and applied.",
            detail_rows=[
                {"label": "Now scheduled for", "value": f"{target_role} on {target_str}"},
                {"label": "Gave away", "value": f"{role_name} on {shift_str}"},
            ],
            cta_label="View my schedule",
        )
        _send_confirmed(
            coverer,
            eyebrow="Shift Swap Confirmed",
            headline=f"Shift swap confirmed — {role_name} on {shift_str}",
            body="your shift swap has been approved and applied.",
            detail_rows=[
                {"label": "Now scheduled for", "value": f"{role_name} on {shift_str}"},
                {"label": "Gave away", "value": f"{target_role} on {target_str}"},
            ],
            cta_label="View my schedule",
        )

    elif swap_request.request_type == ShiftSwapRequest.TYPE_GIVEAWAY:
        if coverer:
            _send_confirmed(
                requester,
                eyebrow="Shift Giveaway Approved",
                headline=f"Shift giveaway confirmed — {role_name} on {shift_str}",
                body="your shift giveaway has been approved.",
                detail_rows=[
                    {"label": "Removed from your schedule", "value": f"{role_name} on {shift_str}"},
                ],
                cta_label="View my schedule",
            )
            _send_confirmed(
                coverer,
                eyebrow="New Shift Added",
                headline=f"A shift has been added to your schedule",
                body="a new shift was assigned to you.",
                detail_rows=[
                    {"label": "Added to your schedule", "value": f"{role_name} on {shift_str}"},
                ],
                cta_label="View my schedule",
            )
        else:
            _send_confirmed(
                requester,
                eyebrow="Shift Giveaway Approved",
                headline=f"Shift removed — {role_name} on {shift_str}",
                body="your shift giveaway was approved. The shift has been removed from your schedule.",
                detail_rows=[
                    {"label": "Removed", "value": f"{role_name} on {shift_str}"},
                ],
                cta_label="View my schedule",
            )

    elif swap_request.request_type == ShiftSwapRequest.TYPE_PICKUP:
        _send_confirmed(
            requester,
            eyebrow="Pickup Confirmed",
            headline=f"Pickup confirmed — {role_name} on {shift_str}",
            body="your shift pickup has been confirmed.",
            detail_rows=[
                {"label": "Added to your schedule", "value": f"{role_name} on {shift_str}"},
            ],
            cta_label="View my schedule",
        )


# ── Request approved → employee ───────────────────────────────────────────────

def send_request_approved_to_employee(employee, request_type_label, detail, http_request):
    if not employee or not employee.email:
        return

    subject = f"Your {request_type_label} request was approved"
    url = _requests_url(http_request)
    text_body = (
        f"Hi {employee.name},\n\n"
        f"Your {request_type_label} request has been approved.\n\n"
        f"  {detail}\n\n"
        f"View your requests: {url}"
    )
    html_body = render_to_string(
        "scheduling/emails/request_approved.html",
        {
            "employee_name": employee.name,
            "request_type_label": request_type_label,
            "detail": detail,
            "url": url,
        },
    )
    _send(subject, text_body, html_body, [employee.email])
