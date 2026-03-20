from rest_framework import viewsets
from apps.scheduling.models import Employee, Shift, Assignment
from .serializers import EmployeeSerializer, ShiftSerializer, AssignmentSerializer

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


class AssignmentViewSet(viewsets.ModelViewSet):
    queryset = Assignment.objects.all()
    serializer_class = AssignmentSerializer

    def perform_create(self, serializer):
        create_assignment(serializer.validated_data)