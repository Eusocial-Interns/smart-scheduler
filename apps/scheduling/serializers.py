
from rest_framework import serializers
from apps.scheduling.models import (
    Employee,
    Shift,
    Assignment,
    Availability,
    OperatingHours,
    ScheduleNote,
)


class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = "__all__"


class AvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Availability
        fields = "__all__"


class OperatingHoursSerializer(serializers.ModelSerializer):
    class Meta:
        model = OperatingHours
        fields = "__all__"


class ShiftSerializer(serializers.ModelSerializer):
    start_time = serializers.DateTimeField(required=False, allow_null=True)
    end_time = serializers.DateTimeField(required=False, allow_null=True)

    class Meta:
        model = Shift
        fields = "__all__"

    def to_representation(self, instance):
        data = super().to_representation(instance)

        if not data.get("start_time"):
            data["start_time"] = None
        if not data.get("end_time"):
            data["end_time"] = None

        return data


class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = "__all__"


class ScheduleNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduleNote
        fields = "__all__"