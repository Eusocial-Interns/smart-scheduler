from apps.scheduling.models import Assignment

def create_assignment(data):
    return Assignment.objects.create(**data)