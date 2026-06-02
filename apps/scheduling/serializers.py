from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone as tz
from rest_framework import serializers

from apps.scheduling.models import (
    Announcement,
    AnnouncementRead,
    Assignment,
    Availability,
    AvailabilityChangeRequest,
    BaselineAvailability,
    ClosedDay,
    Employee,
    OperatingHours,
    Role,
    ScheduleWeek,
    Shift,
    ShiftSwapRequest,
    StaffingRequirement,
    TimeOffRequest,
)


class EmployeeSerializer(serializers.ModelSerializer):
    primary_role_name = serializers.CharField(source="primary_role.name", read_only=True)
    role_names = serializers.SerializerMethodField()
    role_departments = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = "__all__"
        read_only_fields = ["user"]

    def get_role_names(self, obj):
        names = list(obj.roles.values_list("name", flat=True))
        if obj.primary_role and obj.primary_role.name not in names:
            names.insert(0, obj.primary_role.name)
        return names

    def get_role_departments(self, obj):
        depts = set(obj.roles.values_list("department", flat=True))
        if obj.primary_role_id:
            depts.add(obj.primary_role.department)
        return list(depts)


class RoleSerializer(serializers.ModelSerializer):
    department_display = serializers.CharField(source="get_department_display", read_only=True)

    class Meta:
        model = Role
        fields = "__all__"


class OperatingHoursSerializer(serializers.ModelSerializer):
    day_name = serializers.CharField(source="get_day_of_week_display", read_only=True)

    class Meta:
        model = OperatingHours
        fields = "__all__"


class StaffingRequirementSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source="role.name", read_only=True)
    day_name = serializers.CharField(source="get_day_of_week_display", read_only=True)

    class Meta:
        model = StaffingRequirement
        fields = "__all__"


class ScheduleWeekSerializer(serializers.ModelSerializer):
    published_by_username = serializers.CharField(
        source="published_by.username",
        read_only=True,
    )

    class Meta:
        model = ScheduleWeek
        fields = "__all__"
        read_only_fields = ["published_at", "published_by"]


class AvailabilitySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)

    class Meta:
        model = Availability
        fields = "__all__"


class BaselineAvailabilitySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    day_name = serializers.CharField(source="get_day_of_week_display", read_only=True)

    class Meta:
        model = BaselineAvailability
        fields = "__all__"


class AvailabilityChangeRequestSerializer(serializers.ModelSerializer):
    employee = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        required=False,
    )
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    day_name = serializers.CharField(source="get_day_of_week_display", read_only=True)
    reviewed_by_username = serializers.CharField(
        source="reviewed_by.username",
        read_only=True,
    )

    class Meta:
        model = AvailabilityChangeRequest
        fields = "__all__"
        read_only_fields = ["reviewed_by", "reviewed_at", "applied_at"]


class TimeOffRequestSerializer(serializers.ModelSerializer):
    employee = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        required=False,
    )
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    reviewed_by_username = serializers.CharField(
        source="reviewed_by.username",
        read_only=True,
    )

    class Meta:
        model = TimeOffRequest
        fields = "__all__"
        read_only_fields = ["reviewed_by", "reviewed_at"]


class ShiftInlineSerializer(serializers.ModelSerializer):
    """Lightweight shift representation embedded inside assignments — avoids circular nesting."""
    role_name = serializers.CharField(source="role.name", read_only=True)
    date_label = serializers.SerializerMethodField()
    start_display = serializers.SerializerMethodField()
    end_display = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = ["id", "title", "role", "role_name", "start_time", "end_time", "is_open",
                  "date_label", "start_display", "end_display"]

    def get_date_label(self, obj):
        return tz.localtime(obj.start_time).strftime("%a, %b %-d")

    def get_start_display(self, obj):
        return tz.localtime(obj.start_time).strftime("%-I:%M %p")

    def get_end_display(self, obj):
        return tz.localtime(obj.end_time).strftime("%-I:%M %p")


class AssignmentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    shift_title = serializers.CharField(source="shift.title", read_only=True)
    shift_detail = ShiftInlineSerializer(source="shift", read_only=True)

    class Meta:
        model = Assignment
        fields = "__all__"


class ShiftSwapRequestSerializer(serializers.ModelSerializer):
    requester = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        required=False,
    )
    shift_title = serializers.CharField(source="shift.title", read_only=True)
    shift_start = serializers.DateTimeField(source="shift.start_time", read_only=True)
    shift_end = serializers.DateTimeField(source="shift.end_time", read_only=True)
    shift_role_name = serializers.CharField(source="shift.role.name", read_only=True)
    requester_name = serializers.CharField(source="requester.name", read_only=True)
    requested_employee_name = serializers.CharField(
        source="requested_employee.name",
        read_only=True,
    )
    coverer_name = serializers.CharField(source="coverer.name", read_only=True)
    target_shift_title = serializers.CharField(source="target_shift.title", read_only=True)
    target_shift_start = serializers.DateTimeField(source="target_shift.start_time", read_only=True)
    target_shift_role_name = serializers.CharField(source="target_shift.role.name", read_only=True)
    reviewed_by_username = serializers.CharField(
        source="reviewed_by.username",
        read_only=True,
    )

    class Meta:
        model = ShiftSwapRequest
        fields = "__all__"
        read_only_fields = ["reviewed_by", "reviewed_at", "applied_at", "coverer_approved"]


class AnnouncementSerializer(serializers.ModelSerializer):
    posted_by_name = serializers.CharField(source="posted_by.name", read_only=True)
    posted_by = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        required=False,
    )
    department_display = serializers.CharField(source="get_department_display", read_only=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = "__all__"
        read_only_fields = ["posted_by"]

    def get_is_read(self, obj):
        read_ids = self.context.get("read_announcement_ids", set())
        return obj.id in read_ids


class ShiftSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source="role.name", read_only=True)
    role_department = serializers.CharField(source="role.department", read_only=True)
    assignments = AssignmentSerializer(many=True, read_only=True)
    date_label = serializers.SerializerMethodField()
    start_display = serializers.SerializerMethodField()
    end_display = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = "__all__"

    def get_date_label(self, obj):
        return tz.localtime(obj.start_time).strftime("%a, %b %-d")

    def get_start_display(self, obj):
        return tz.localtime(obj.start_time).strftime("%-I:%M %p")

    def get_end_display(self, obj):
        return tz.localtime(obj.end_time).strftime("%-I:%M %p")

    def validate(self, attrs):
        instance = Shift(
            title=attrs.get("title", getattr(self.instance, "title", "Shift")),
            role=attrs.get("role", getattr(self.instance, "role", None)),
            start_time=attrs.get("start_time", getattr(self.instance, "start_time", None)),
            end_time=attrs.get("end_time", getattr(self.instance, "end_time", None)),
            notes=attrs.get("notes", getattr(self.instance, "notes", "")),
            is_open=attrs.get("is_open", getattr(self.instance, "is_open", False)),
        )

        try:
            instance.clean()
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages)

        return attrs


class ClosedDaySerializer(serializers.ModelSerializer):
    class Meta:
        model = ClosedDay
        fields = "__all__"
