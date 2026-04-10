from apps.scheduling.models import Assignment


def create_assignment(data):
    return Assignment.objects.create(**data)


def update_assignment(instance, data):
    for field, value in data.items():
        setattr(instance, field, value)
    instance.save()
    return instance
