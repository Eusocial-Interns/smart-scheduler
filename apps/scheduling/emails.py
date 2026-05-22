import logging
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.urls import reverse

logger = logging.getLogger(__name__)

# TODO: replace with real recipient resolution once testing is done
_TEST_RECIPIENTS = ["gabriel.bressanelli@hotmail.com"]


def send_schedule_published(schedule_week, department, request):
    week_start = schedule_week.week_start
    week_end = schedule_week.week_end
    week_str = f"{week_start.strftime('%B %d')} – {week_end.strftime('%B %d, %Y')}"

    dept_label = {"foh": "Front of House", "boh": "Back of House"}.get(department)

    subject = f"Schedule for {week_str} is out!"
    schedule_url = request.build_absolute_uri(reverse("weekly_schedule"))

    html_body = render_to_string(
        "scheduling/emails/schedule_published.html",
        {
            "week_str": week_str,
            "schedule_url": schedule_url,
            "dept_label": dept_label,
        },
    )
    text_body = (
        f"The schedule for the week of {week_str} is out!\n\n"
        f"View your schedule: {schedule_url}\n\n"
        "Have a great week at work!"
    )

    recipients = _TEST_RECIPIENTS

    try:
        send_mail(
            subject=subject,
            message=text_body,
            from_email=None,
            recipient_list=recipients,
            html_message=html_body,
            fail_silently=False,
        )
        logger.info("Schedule published email sent for week %s to %s", week_str, recipients)
    except Exception:
        logger.exception("Failed to send schedule published email for week %s", week_str)
