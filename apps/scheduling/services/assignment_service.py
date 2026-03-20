from apps.scheduling.models import Assignment

def create_assignment(validated_data):
    return Assignment.objects.create(**validated_data)
