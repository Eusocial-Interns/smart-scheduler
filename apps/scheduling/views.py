
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.core.exceptions import ValidationError as DjangoValidationError

from apps.scheduling.models import (
    Employee,
    Shift,
    Availability,
    OperatingHours,
)

from apps.scheduling.serializers import (
    EmployeeSerializer,
    ShiftSerializer,
    AvailabilitySerializer,
    OperatingHoursSerializer,
)

from apps.scheduling.services.shift_service import create_shift


# =========================
# Employee
# =========================
class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer


# =========================
# Shift
# =========================
class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer

    def perform_create(self, serializer):
        try:
            create_shift(serializer.validated_data)
        except DjangoValidationError as e:
            # convert Django error → DRF error (so frontend sees clean JSON)
            raise DRFValidationError(e.message)


# =========================
# Availability
# =========================
class AvailabilityViewSet(viewsets.ModelViewSet):
    queryset = Availability.objects.all()
    serializer_class = AvailabilitySerializer


# =========================
# Operating Hours
# =========================
class OperatingHoursViewSet(viewsets.ModelViewSet):
    queryset = OperatingHours.objects.all()
    serializer_class = OperatingHoursSerializer


# =========================
# Placeholder frontend views (leave these if your urls use them)
# =========================
from django.http import HttpResponse


def calendar_view(request):
    return HttpResponse("Calendar Page")


def profile_view(request):
    return HttpResponse("Profile Page")


def announcements_view(request):
    return HttpResponse("Announcements Page")


def chat_view(request):
    return HttpResponse("Chat Page")