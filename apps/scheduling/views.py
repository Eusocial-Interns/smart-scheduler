
from rest_framework import viewsets
from apps.scheduling.models import (
    Employee,
    Shift,
    Assignment,
    Availability,
    OperatingHours,
    ScheduleNote,
)
from apps.scheduling.serializers import (
    EmployeeSerializer,
    ShiftSerializer,
    AssignmentSerializer,
    AvailabilitySerializer,
    OperatingHoursSerializer,
    ScheduleNoteSerializer,
)


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer


class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer


class AssignmentViewSet(viewsets.ModelViewSet):
    queryset = Assignment.objects.all()
    serializer_class = AssignmentSerializer


class AvailabilityViewSet(viewsets.ModelViewSet):
    queryset = Availability.objects.all()
    serializer_class = AvailabilitySerializer


class OperatingHoursViewSet(viewsets.ModelViewSet):
    queryset = OperatingHours.objects.all()
    serializer_class = OperatingHoursSerializer


class ScheduleNoteViewSet(viewsets.ModelViewSet):
    queryset = ScheduleNote.objects.all()
    serializer_class = ScheduleNoteSerializer