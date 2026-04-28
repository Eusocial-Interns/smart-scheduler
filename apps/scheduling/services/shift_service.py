
from django.core.exceptions import ValidationError
from apps.scheduling.models import Shift, OperatingHours


def create_shift(data):
    start_time = data.get("start_time")
    end_time = data.get("end_time")

    if not start_time or not end_time:
        raise ValidationError("Shift must have a start time and end time.")

    if end_time <= start_time:
        raise ValidationError("Shift end time must be after start time.")

    day_of_week = start_time.weekday()

    operating_hours = OperatingHours.objects.filter(day_of_week=day_of_week).first()

    if not operating_hours:
        raise ValidationError("No operating hours are set for this day.")

    shift_start_time = start_time.time()
    shift_end_time = end_time.time()

    if shift_start_time < operating_hours.open_time or shift_end_time > operating_hours.close_time:
        raise ValidationError(
            f"Shift must be within operating hours: "
            f"{operating_hours.open_time} to {operating_hours.close_time}."
        )

    return Shift.objects.create(**data)