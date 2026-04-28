
from django.core.exceptions import ValidationError
from apps.scheduling.models import OperatingHours, Shift


def create_shift(data):
    start = data.get("start_time")
    end = data.get("end_time")

    if start is None or end is None:
        raise ValidationError("Start time and end time are required.")

    if start >= end:
        raise ValidationError("Shift end time must be after start time.")

    # Get day from the shift start date
    day = start.weekday()

    # Convert DateTime to Time for comparison
    start_time = start.time()
    end_time = end.time()

    try:
        hours = OperatingHours.objects.get(day_of_week=day)
    except OperatingHours.DoesNotExist:
        raise ValidationError("No operating hours set for this day.")

    if start_time < hours.open_time:
        raise ValidationError("Shift cannot start before restaurant opens.")

    if end_time > hours.close_time:
        raise ValidationError("Shift cannot end after restaurant closes.")

    return Shift.objects.create(**data)