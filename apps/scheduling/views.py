from apps.scheduling.services.availability_service import create_availability
from django.shortcuts import render
from rest_framework import viewsets

from apps.scheduling.models import Employee, Shift, Assignment, Availability
from .serializers import (
    EmployeeSerializer,
    ShiftSerializer,
    AssignmentSerializer,
    AvailabilitySerializer
)

from apps.scheduling.services.shift_service import create_shift
from apps.scheduling.services.assignment_service import create_assignment


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer




class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer

    def perform_create(self, serializer):
        create_shift(serializer.validated_data)


class AvailabilityViewSet(viewsets.ModelViewSet):
    queryset = Availability.objects.all()
    serializer_class = AvailabilitySerializer

    def perform_create(self, serializer):
        create_availability(serializer.validated_data)





# keep these (frontend views)
def calendar_view(request):
    return render(request, 'scheduling/calendar.html')


def profile_view(request):
    return render(request, 'scheduling/profile.html')


def announcements_view(request):
    return render(request, 'scheduling/announcements.html')


def chat_view(request):
    return render(request, 'scheduling/chat.html')