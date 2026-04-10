from datetime import datetime, time

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.scheduling.models import Assignment, Availability, Employee, Role, Shift


class SchedulingModelTests(TestCase):
    def setUp(self):
        self.employee = Employee.objects.create(
            name="Alex Johnson",
            email="alex@example.com",
        )
        self.role = Role.objects.create(name="Server")

    def test_shift_rejects_end_before_start(self):
        shift = Shift(
            title="Bad Shift",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 10, 17, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 10, 15, 0)),
        )

        with self.assertRaises(ValidationError):
            shift.full_clean()

    def test_assignment_rejects_unavailable_employee(self):
        shift = Shift.objects.create(
            title="Dinner",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 10, 22, 0)),
        )

        Availability.objects.create(
            employee=self.employee,
            date=timezone.localdate(shift.start_time),
            start_time=time(17, 0),
            end_time=time(23, 0),
            status=Availability.STATUS_UNAVAILABLE,
        )

        with self.assertRaises(ValidationError):
            Assignment.objects.create(employee=self.employee, shift=shift)


class SchedulingApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employee = Employee.objects.create(
            name="Casey Morgan",
            email="casey@example.com",
        )
        self.role = Role.objects.create(name="Cook")

    def test_shift_api_create_returns_created_shift(self):
        response = self.client.post(
            "/api/v1/shifts/",
            {
                "title": "Prep",
                "role": self.role.id,
                "start_time": "2026-04-12T13:00:00Z",
                "end_time": "2026-04-12T17:00:00Z",
                "notes": "Prep station",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "Prep")
        self.assertEqual(response.data["role_name"], "Cook")

    def test_role_api_is_exposed(self):
        response = self.client.get("/api/v1/roles/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["name"], "Cook")

    def test_employee_api_create_returns_created_employee(self):
        response = self.client.post(
            "/api/v1/employees/",
            {
                "name": "Adriana Lopez",
                "email": "adriana@example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Adriana Lopez")
        self.assertEqual(response.data["email"], "adriana@example.com")
