
from apps.scheduling.models import Shift
from django.core.exceptions import ValidationError

def create_shift(data):
    start = data.get("start_time")
    end = data.get("end_time")

    if start >= end:
        raise ValidationError("End time must be after start time")

    return Shift.objects.create(**data)