from apps.scheduling.models import Availability


def create_availability(data):
    return Availability.objects.create(**data)


def update_availability(instance, data):
    for field, value in data.items():
        setattr(instance, field, value)
    instance.save()
    return instance
