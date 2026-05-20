from datetime import timedelta

from django.db import migrations


def backfill_schedule_weeks(apps, schema_editor):
    Shift = apps.get_model("scheduling", "Shift")
    ScheduleWeek = apps.get_model("scheduling", "ScheduleWeek")

    for shift in Shift.objects.filter(schedule_week__isnull=True).exclude(start_time__isnull=True):
        week_start = shift.start_time.date() - timedelta(days=shift.start_time.weekday())
        schedule_week, _ = ScheduleWeek.objects.get_or_create(week_start=week_start)
        shift.schedule_week = schedule_week
        shift.save(update_fields=["schedule_week"])


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0004_employee_account_type_employee_primary_role_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_schedule_weeks, migrations.RunPython.noop),
    ]
