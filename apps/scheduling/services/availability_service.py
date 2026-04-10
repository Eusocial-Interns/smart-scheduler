from apps.scheduling.models import Availability

def create_availability(data):
    return Availability.objects.create(**data)