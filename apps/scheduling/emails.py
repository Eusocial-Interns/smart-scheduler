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

    subject = f"{requester_name} wants to trade shifts with you"
    url = _requests_url(http_request)
    text_body = (
        f"Hi {target.name},\n\n"
        f"{requester_name} has proposed a shift trade with you.\n\n"
        f"  Their shift: {role_name} — {shift.title} on {shift_str}\n"
        + (f"  Reason: {swap_request.reason}\n" if swap_request.reason else "")
        + f"\nLog in to accept or decline: {url}"
    )
    html_body = (
        f"<p>Hi <strong>{target.name}</strong>,</p>"
        f"<p><strong>{requester_name}</strong> has proposed a shift trade with you.</p>"
        f"<ul>"
        f"<li><strong>Their shift:</strong> {role_name} — {shift.title} on {shift_str}</li>"
        + (f"<li><strong>Reason:</strong> {swap_request.reason}</li>" if swap_request.reason else "")
        + f"</ul>"
        f"<p><a href='{url}'>Review the trade request</a></p>"
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
    html_body = (
        f"<p><strong>{coverer_name}</strong> accepted <strong>{requester_name}</strong>'s trade request.</p>"
        f"<ul><li><strong>Shift:</strong> {role_name} — {shift.title} on {shift_str}</li></ul>"
        f"<p><a href='{url}'>Approve or deny in the Requests page</a></p>"
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
    html_body = (
        f"<p><strong>{employee.name}</strong> submitted a new <strong>{request_type_label}</strong> request.</p>"
        f"<p>{detail}</p>"
        f"<p><a href='{url}'>Review in the Requests page</a></p>"
    )
    _send(subject, text_body, html_body, manager_emails)


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
    html_body = (
        f"<p>Hi <strong>{employee.name}</strong>,</p>"
        f"<p>Your <strong>{request_type_label}</strong> request has been approved.</p>"
        f"<p>{detail}</p>"
        f"<p><a href='{url}'>View your requests</a></p>"
    )
    _send(subject, text_body, html_body, [employee.email])
