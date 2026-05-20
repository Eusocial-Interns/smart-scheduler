from datetime import datetime, time, timedelta

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.scheduling.models import (
    Assignment,
    Availability,
    AvailabilityChangeRequest,
    BaselineAvailability,
    Employee,
    OperatingHours,
    Role,
    ScheduleWeek,
    Shift,
    StaffingRequirement,
    TimeOffRequest,
)


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

    def test_availability_change_approval_updates_baseline(self):
        request = AvailabilityChangeRequest.objects.create(
            employee=self.employee,
            day_of_week=OperatingHours.MONDAY,
            requested_status=Availability.STATUS_AVAILABLE,
            reason="Class schedule changed.",
        )

        request.approve()

        baseline = BaselineAvailability.objects.get(employee=self.employee)
        self.assertEqual(baseline.day_of_week, OperatingHours.MONDAY)
        self.assertEqual(baseline.start_time, time(0, 0))
        self.assertEqual(baseline.end_time, time(23, 59))

    def test_approved_time_off_blocks_assignment(self):
        shift = Shift.objects.create(
            title="Dinner",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 10, 18, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 10, 21, 0)),
        )
        TimeOffRequest.objects.create(
            employee=self.employee,
            start_date=timezone.localdate(shift.start_time),
            end_date=timezone.localdate(shift.start_time),
            status="approved",
        )

        with self.assertRaises(ValidationError):
            Assignment.objects.create(employee=self.employee, shift=shift)


class SchedulingApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager_user = User.objects.create_user(
            username="manager",
            password="password",
        )
        self.employee_user = User.objects.create_user(
            username="casey",
            password="password",
        )
        self.teammate_user = User.objects.create_user(
            username="taylor",
            password="password",
        )
        self.employee = Employee.objects.create(
            user=self.employee_user,
            name="Casey Morgan",
            email="casey@example.com",
        )
        self.role = Role.objects.create(name="Cook")
        Employee.objects.create(
            user=self.manager_user,
            name="Morgan Manager",
            email="manager@example.com",
            account_type=Employee.ACCOUNT_TYPE_MANAGER,
        )
        self.teammate = Employee.objects.create(
            user=self.teammate_user,
            name="Taylor Reed",
            email="taylor@example.com",
        )
        for day in range(7):
            OperatingHours.objects.get_or_create(
                day_of_week=day,
                defaults={
                    "open_time": time(11, 0),
                    "close_time": time(22, 0),
                },
            )
        self.client.force_authenticate(self.manager_user)

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
        login_user = User.objects.get(username="adriana@example.com")
        employee = Employee.objects.get(email="adriana@example.com")
        self.assertEqual(employee.user, login_user)
        self.assertEqual(login_user.email, "adriana@example.com")
        self.assertTrue(login_user.check_password("123456789"))

    def test_employee_api_update_email_syncs_login_username(self):
        response = self.client.patch(
            f"/api/v1/employees/{self.employee.id}/",
            {"email": "casey.new@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.employee.user.refresh_from_db()
        self.assertEqual(self.employee.email, "casey.new@example.com")
        self.assertEqual(self.employee.user.username, "casey.new@example.com")
        self.assertEqual(self.employee.user.email, "casey.new@example.com")

    def test_operating_hours_api_is_exposed(self):
        response = self.client.get("/api/v1/operating-hours/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 7)
        self.assertEqual(response.data[0]["day_name"], "Monday")

    def test_shift_api_allows_shift_outside_operating_hours(self):
        # Coverage (StaffingRequirements) is the source of truth; operating hours no longer gate shift creation.
        response = self.client.post(
            "/api/v1/shifts/",
            {
                "title": "Early Prep",
                "role": self.role.id,
                "start_time": "2026-04-13T09:00:00Z",
                "end_time": "2026-04-13T10:00:00Z",
                "notes": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_weekly_schedule_api_groups_assignments_by_role_and_day(self):
        shift = Shift.objects.create(
            title="Dinner",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 13, 17, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 13, 22, 0)),
            notes="Patio coverage",
        )
        Assignment.objects.create(employee=self.employee, shift=shift)

        response = self.client.get("/api/v1/schedule/week/?start=2026-04-13")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["week_start"], "2026-04-13")
        self.assertEqual(response.data["week_end"], "2026-04-19")
        cook_row = response.data["roles"][0]
        self.assertEqual(cook_row["role_name"], "Cook")
        self.assertEqual(cook_row["days"]["0"][0]["employee_name"], "Casey Morgan")
        self.assertEqual(cook_row["days"]["0"][0]["display_time"], "Arrive 5:00 PM")
        self.assertIsNotNone(cook_row["days"]["0"][0]["assignment_id"])
        self.assertEqual(cook_row["days"]["0"][0]["notes"], "Patio coverage")

    def test_employee_cannot_view_unpublished_weekly_schedule(self):
        Shift.objects.create(
            title="Dinner",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 13, 17, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 13, 22, 0)),
        )

        self.client.force_authenticate(self.employee_user)
        response = self.client.get("/api/v1/schedule/week/?start=2026-04-13")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_team_setup_page_renders_for_manager(self):
        self.client.force_login(self.manager_user)
        response = self.client.get("/team-setup/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "Employees, roles, and availability")

    def test_employee_can_view_published_weekly_schedule(self):
        shift = Shift.objects.create(
            title="Dinner",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 13, 17, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 13, 22, 0)),
        )
        Assignment.objects.create(employee=self.employee, shift=shift)
        teammate_shift = Shift.objects.create(
            title="Prep",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 14, 13, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 14, 16, 0)),
        )
        Assignment.objects.create(employee=self.teammate, shift=teammate_shift)
        ScheduleWeek.objects.get(week_start=timezone.localdate(shift.start_time)).publish(
            self.manager_user
        )

        self.client.force_authenticate(self.employee_user)
        response = self.client.get("/api/v1/schedule/week/?start=2026-04-13")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], ScheduleWeek.STATUS_PUBLISHED)
        self.assertEqual([day["index"] for day in response.data["days"]], [0])
        self.assertEqual(len(response.data["roles"]), 1)
        self.assertEqual(
            response.data["roles"][0]["days"]["0"][0]["employee_name"],
            "Casey Morgan",
        )

    def test_manager_can_move_assignment_to_open_shift(self):
        first_shift = Shift.objects.create(
            title="Opener",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 13, 13, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 13, 17, 0)),
        )
        target_shift = Shift.objects.create(
            title="Closer",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 13, 17, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 13, 22, 0)),
        )
        assignment = Assignment.objects.create(employee=self.employee, shift=first_shift)

        response = self.client.post(
            f"/api/v1/assignments/{assignment.id}/move/",
            {"target_shift": target_shift.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        assignment.refresh_from_db()
        self.assertEqual(assignment.shift, target_shift)

    def test_manager_can_assign_employee_to_shift_from_roster(self):
        shift = Shift.objects.create(
            title="Dinner Service",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 13, 17, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 13, 22, 0)),
        )
        BaselineAvailability.objects.create(
            employee=self.employee,
            day_of_week=OperatingHours.MONDAY,
            effective_date=timezone.localdate() - timedelta(days=60),
        )

        response = self.client.post(
            "/api/v1/assignments/",
            {"employee": self.employee.id, "shift": shift.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Assignment.objects.get().employee, self.employee)

    def test_manager_can_reschedule_single_assignment_card(self):
        shift = Shift.objects.create(
            title="Dinner Service",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 13, 17, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 13, 22, 0)),
        )
        assignment = Assignment.objects.create(employee=self.employee, shift=shift)

        response = self.client.post(
            f"/api/v1/assignments/{assignment.id}/reschedule/",
            {"title": "Opener", "arrival_time": "13:00"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        assignment.refresh_from_db()
        self.assertEqual(assignment.shift.title, "Opener")
        self.assertEqual(timezone.localtime(assignment.shift.start_time).time(), time(13, 0))
        self.assertEqual(timezone.localtime(assignment.shift.end_time).time(), time(22, 0))
        self.assertTrue(Shift.objects.filter(title="Dinner Service").exists())

    def test_manager_can_swap_assignments_by_drag_target(self):
        first_shift = Shift.objects.create(
            title="Opener",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 13, 13, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 13, 17, 0)),
        )
        second_shift = Shift.objects.create(
            title="Closer",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 13, 17, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 13, 22, 0)),
        )
        first_assignment = Assignment.objects.create(
            employee=self.employee,
            shift=first_shift,
        )
        second_assignment = Assignment.objects.create(
            employee=self.teammate,
            shift=second_shift,
        )

        response = self.client.post(
            f"/api/v1/assignments/{first_assignment.id}/move/",
            {
                "target_shift": second_shift.id,
                "swap_assignment": second_assignment.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first_assignment.refresh_from_db()
        second_assignment.refresh_from_db()
        self.assertEqual(first_assignment.shift, second_shift)
        self.assertEqual(second_assignment.shift, first_shift)

    def test_employee_me_endpoint_returns_current_profile(self):
        self.client.force_authenticate(self.employee_user)

        response = self.client.get("/api/v1/employees/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Casey Morgan")
        self.assertEqual(response.data["account_type"], Employee.ACCOUNT_TYPE_EMPLOYEE)

    def test_employee_teammates_endpoint_excludes_self_and_managers(self):
        self.client.force_authenticate(self.employee_user)

        response = self.client.get("/api/v1/employees/teammates/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {employee["name"] for employee in response.data}
        self.assertEqual(names, {"Taylor Reed"})

    def test_employee_can_submit_availability_change_without_employee_id(self):
        self.client.force_authenticate(self.employee_user)

        response = self.client.post(
            "/api/v1/availability-change-requests/",
            {
                "day_of_week": OperatingHours.TUESDAY,
                "requested_status": Availability.STATUS_AVAILABLE,
                "effective_date": "2026-05-13",
                "reason": "School schedule changed.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["employee_name"], "Casey Morgan")
        self.assertEqual(response.data["status"], "pending")

    def test_manager_can_create_baseline_availability_for_employee(self):
        response = self.client.post(
            "/api/v1/baseline-availability/",
            {
                "employee": self.employee.id,
                "day_of_week": OperatingHours.WEDNESDAY,
                "status": Availability.STATUS_AVAILABLE,
                "effective_date": "2026-05-18",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["employee_name"], "Casey Morgan")
        self.assertEqual(response.data["day_name"], "Wednesday")

    def test_employee_cannot_create_employee_from_setup_api(self):
        self.client.force_authenticate(self.employee_user)

        response = self.client.post(
            "/api/v1/employees/",
            {
                "name": "New Person",
                "email": "new@example.com",
                "account_type": Employee.ACCOUNT_TYPE_EMPLOYEE,
                "primary_role": self.role.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_employee_cannot_approve_availability_change_request(self):
        request = AvailabilityChangeRequest.objects.create(
            employee=self.employee,
            day_of_week=OperatingHours.TUESDAY,
            requested_status=Availability.STATUS_AVAILABLE,
            effective_date=timezone.localdate(),
        )
        self.client.force_authenticate(self.employee_user)

        response = self.client.post(
            f"/api/v1/availability-change-requests/{request.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_approve_availability_change_request(self):
        request = AvailabilityChangeRequest.objects.create(
            employee=self.employee,
            day_of_week=OperatingHours.TUESDAY,
            requested_status=Availability.STATUS_AVAILABLE,
            effective_date=timezone.localdate(),
        )

        response = self.client.post(
            f"/api/v1/availability-change-requests/{request.id}/approve/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "approved")
        self.assertTrue(
            BaselineAvailability.objects.filter(
                employee=self.employee,
                day_of_week=OperatingHours.TUESDAY,
                is_active=True,
            ).exists()
        )

    def test_manager_can_create_staffing_requirement(self):
        response = self.client.post(
            "/api/v1/staffing-requirements/",
            {
                "title": "Dinner Service",
                "role": self.role.id,
                "day_of_week": OperatingHours.MONDAY,
                "start_time": "17:00:00",
                "required_count": 2,
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["role_name"], "Cook")
        self.assertIsNone(response.data["end_time"])
        self.assertEqual(response.data["required_count"], 2)

    def test_generate_draft_assigns_available_employees_to_requirement(self):
        BaselineAvailability.objects.create(
            employee=self.employee,
            day_of_week=OperatingHours.MONDAY,
            effective_date=timezone.localdate() - timedelta(days=60),
        )
        BaselineAvailability.objects.create(
            employee=self.teammate,
            day_of_week=OperatingHours.MONDAY,
            effective_date=timezone.localdate() - timedelta(days=60),
        )
        self.employee.primary_role = self.role
        self.employee.save()
        self.employee.roles.add(self.role)
        self.teammate.primary_role = self.role
        self.teammate.save()
        self.teammate.roles.add(self.role)
        StaffingRequirement.objects.create(
            title="Dinner Service",
            role=self.role,
            day_of_week=OperatingHours.MONDAY,
            start_time=time(17, 0),
            required_count=2,
        )

        response = self.client.post(
            "/api/v1/schedule-weeks/generate-draft/",
            {"week_start": "2026-04-13"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["assignments_created"], 2)
        self.assertEqual(response.data["summary"]["open_slots"], [])
        self.assertEqual(Assignment.objects.count(), 2)
        generated_shift = Shift.objects.get(title="Dinner Service")
        self.assertEqual(timezone.localtime(generated_shift.end_time).time(), time(23, 59))

    def test_generate_draft_reports_open_slots_when_availability_is_missing(self):
        self.employee.primary_role = self.role
        self.employee.save()
        self.employee.roles.add(self.role)
        StaffingRequirement.objects.create(
            title="Dinner Service",
            role=self.role,
            day_of_week=OperatingHours.MONDAY,
            start_time=time(17, 0),
            required_count=1,
        )

        response = self.client.post(
            "/api/v1/schedule-weeks/generate-draft/",
            {"week_start": "2026-04-13"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["assignments_created"], 0)
        self.assertEqual(response.data["summary"]["open_slots"][0]["open_count"], 1)

    def test_generate_draft_reports_invalid_requirement_without_aborting(self):
        # start_time == fallback end_time (23:59), so Shift.clean() rejects it as start >= end
        StaffingRequirement.objects.create(
            title="Late Dinner Service",
            role=self.role,
            day_of_week=OperatingHours.MONDAY,
            start_time=time(23, 59),
            required_count=1,
        )

        response = self.client.post(
            "/api/v1/schedule-weeks/generate-draft/",
            {"week_start": "2026-04-13"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invalid_requirement = response.data["summary"]["invalid_requirements"][0]
        self.assertEqual(invalid_requirement["title"], "Late Dinner Service")
        self.assertIn("Shift must end after it starts", invalid_requirement["message"])
        self.assertEqual(Shift.objects.count(), 0)

    def test_generate_draft_rebuilds_existing_week_draft(self):
        BaselineAvailability.objects.create(
            employee=self.employee,
            day_of_week=OperatingHours.MONDAY,
            effective_date=timezone.localdate() - timedelta(days=60),
        )
        self.employee.primary_role = self.role
        self.employee.save()
        self.employee.roles.add(self.role)
        old_shift = Shift.objects.create(
            title="Old Draft",
            role=self.role,
            start_time=timezone.make_aware(datetime(2026, 4, 13, 13, 0)),
            end_time=timezone.make_aware(datetime(2026, 4, 13, 14, 0)),
        )
        StaffingRequirement.objects.create(
            title="Opener",
            role=self.role,
            day_of_week=OperatingHours.MONDAY,
            start_time=time(17, 0),
            required_count=1,
        )

        response = self.client.post(
            "/api/v1/schedule-weeks/generate-draft/",
            {"week_start": "2026-04-13"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Shift.objects.filter(pk=old_shift.pk).exists())
        self.assertEqual(list(Shift.objects.values_list("title", flat=True)), ["Opener"])
        self.assertEqual(Assignment.objects.count(), 1)
