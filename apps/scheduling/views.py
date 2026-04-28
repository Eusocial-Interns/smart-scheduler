
from django.shortcuts import render
from django.core.exceptions import ValidationError as DjangoValidationError

from rest_framework import viewsets
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.scheduling.models import Employee, Shift, Availability, OperatingHours
from apps.scheduling.serializers import (
    EmployeeSerializer,
    ShiftSerializer,
    AvailabilitySerializer,
    OperatingHoursSerializer,
)

from apps.scheduling.services.shift_service import create_shift
from apps.scheduling.services.availability_service import create_availability


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer


class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer

    def perform_create(self, serializer):
        try:
            create_shift(serializer.validated_data)
        except DjangoValidationError as e:
            raise DRFValidationError({"error": e.message})


class AvailabilityViewSet(viewsets.ModelViewSet):
    queryset = Availability.objects.all()
    serializer_class = AvailabilitySerializer

    def perform_create(self, serializer):
        create_availability(serializer.validated_data)


class OperatingHoursViewSet(viewsets.ModelViewSet):
    queryset = OperatingHours.objects.all()
    serializer_class = OperatingHoursSerializer


# keep these frontend views
def calendar_view(request):
    return render(request, "scheduling/calendar.html")


def profile_view(request):
    return render(request, "scheduling/profile.html")


def announcements_view(request):
    return render(request, "scheduling/announcements.html")


def chat_view(request):
    return render(request, "scheduling/chat.html")