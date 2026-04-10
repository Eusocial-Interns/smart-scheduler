from rest_framework import serializers

from apps.scheduling.models import Assignment, Availability, Employee, Role, Shift


class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = "__all__"


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = "__all__"


class AvailabilitySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)

    class Meta:
        model = Availability
        fields = "__all__"


class AssignmentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    shift_title = serializers.CharField(source="shift.title", read_only=True)

    class Meta:
        model = Assignment
        fields = "__all__"


class ShiftSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source="role.name", read_only=True)
    assignments = AssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = Shift
        fields = "__all__"
