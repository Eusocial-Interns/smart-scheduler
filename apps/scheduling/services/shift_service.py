from apps.scheduling.models import Shift


def create_shift(data):
    return Shift.objects.create(**data)


def update_shift(instance, data):
    for field, value in data.items():
        setattr(instance, field, value)
    instance.save()
    return instance
