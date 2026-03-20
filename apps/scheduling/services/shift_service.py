from apps.scheduling.models import Shift


def create_shift(validated_data):
    return Shift.objects.create(**validated_data)


def get_all_shifts():
    return Shift.objects.all()