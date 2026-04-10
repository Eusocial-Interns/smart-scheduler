from django.shortcuts import render
from rest_framework import viewsets

from apps.scheduling.models import Assignment, Availability, Employee, Role, Shift
from apps.scheduling.serializers import (
    AssignmentSerializer,
    AvailabilitySerializer,
    EmployeeSerializer,
    RoleSerializer,
    ShiftSerializer,
)
from apps.scheduling.services.assignment_service import (
    create_assignment,
    update_assignment,
)
from apps.scheduling.services.availability_service import (
    create_availability,
    update_availability,
)
from apps.scheduling.services.shift_service import create_shift, update_shift


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer


class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.select_related("role").prefetch_related(
        "assignments__employee"
    )
    serializer_class = ShiftSerializer

    def perform_create(self, serializer):
        serializer.instance = create_shift(serializer.validated_data)

    def perform_update(self, serializer):
        serializer.instance = update_shift(serializer.instance, serializer.validated_data)


class AvailabilityViewSet(viewsets.ModelViewSet):
    queryset = Availability.objects.select_related("employee")
    serializer_class = AvailabilitySerializer

    def perform_create(self, serializer):
        serializer.instance = create_availability(serializer.validated_data)

    def perform_update(self, serializer):
        serializer.instance = update_availability(
            serializer.instance,
            serializer.validated_data,
        )


class AssignmentViewSet(viewsets.ModelViewSet):
    queryset = Assignment.objects.select_related("employee", "shift")
    serializer_class = AssignmentSerializer

    def perform_create(self, serializer):
        serializer.instance = create_assignment(serializer.validated_data)

    def perform_update(self, serializer):
        serializer.instance = update_assignment(
            serializer.instance,
            serializer.validated_data,
        )


def calendar_view(request):
    return render(request, "scheduling/calendar.html")


def profile_view(request):
    return render(request, "scheduling/profile.html")


def announcements_view(request):
    return render(request, "scheduling/announcements.html")


def chat_view(request):
    return render(request, "scheduling/chat.html")
