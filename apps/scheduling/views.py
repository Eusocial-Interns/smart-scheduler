from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from .emails import (
    send_schedule_published,
    send_trade_proposed,
    send_trade_accepted_notify_managers,
    send_request_submitted_to_managers,
    send_request_approved_to_employee,
)
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

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
    REQUEST_STATUS_APPROVED,
    REQUEST_STATUS_DENIED,
    REQUEST_STATUS_PENDING,
)
from apps.scheduling.permissions import (
    IsAuthenticatedSchedulingUser,
    IsManager,
    IsManagerOrReadOnlySchedulingUser,
    employee_profile_for,
    user_is_manager,
)
from apps.scheduling.serializers import (
    AnnouncementSerializer,
    AssignmentSerializer,
    AvailabilitySerializer,
    AvailabilityChangeRequestSerializer,
    BaselineAvailabilitySerializer,
    ClosedDaySerializer,
    EmployeeSerializer,
    OperatingHoursSerializer,
    RoleSerializer,
    ScheduleWeekSerializer,
    ShiftSerializer,
    ShiftSwapRequestSerializer,
    StaffingRequirementSerializer,
    TimeOffRequestSerializer,
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
from apps.scheduling.services.schedule_generation import (
    copy_schedule_from_last_week,
    generate_schedule_from_requirements,
)


DEFAULT_EMPLOYEE_PASSWORD = "123456789"


def require_employee_profile(request):
    profile = employee_profile_for(request.user)
    if not profile:
        raise PermissionDenied("Authenticated users need an employee profile.")
    return profile


def build_schedule_visibility_q(profile, schedule_week_prefix="schedule_week"):
    """
    Q filter that matches shifts/assignments in schedule weeks visible to this profile.
    Passes when the week is fully published OR the employee's dept is published.
    schedule_week_prefix:
      "schedule_week"       when filtering Shift
      "shift__schedule_week" when filtering Assignment
    """
    emp_depts = set(profile.roles.values_list("department", flat=True))
    if profile.primary_role_id:
        pr_dept = (
            Role.objects.filter(pk=profile.primary_role_id)
            .values_list("department", flat=True)
            .first()
        )
        if pr_dept:
            emp_depts.add(pr_dept)
    q = Q(**{f"{schedule_week_prefix}__status": ScheduleWeek.STATUS_PUBLISHED})
    for dept in emp_depts:
        q |= Q(**{
            f"{schedule_week_prefix}__department_statuses__{dept}": ScheduleWeek.STATUS_PUBLISHED
        })
    return q


def deny_request(instance, manager_user=None, note=""):
    instance.status = REQUEST_STATUS_DENIED
    instance.reviewed_at = timezone.now()
    instance.manager_note = note
    if manager_user and manager_user.is_authenticated:
        instance.reviewed_by = manager_user
    instance.save()


def translate_django_validation(callback):
    try:
        return callback()
    except DjangoValidationError as error:
        raise ValidationError(error.messages)


def get_or_create_login_user_for_employee(email, existing_user=None):
    User = get_user_model()
    normalized_email = User.objects.normalize_email(email)

    if existing_user:
        conflicting_user = (
            User.objects.filter(username=normalized_email)
            .exclude(pk=existing_user.pk)
            .first()
        )
        if conflicting_user:
            raise ValidationError({"email": ["A login already exists for this email."]})

        existing_user.username = normalized_email
        existing_user.email = normalized_email
        existing_user.save(update_fields=["username", "email"])
        return existing_user

    user, created = User.objects.get_or_create(
        username=normalized_email,
        defaults={"email": normalized_email},
    )

    try:
        linked_employee = user.employee_profile
    except ObjectDoesNotExist:
        linked_employee = None
    if linked_employee:
        raise ValidationError({"email": ["This login is already linked to another employee."]})

    if created:
        user.set_password(DEFAULT_EMPLOYEE_PASSWORD)
        user.save(update_fields=["password"])
    elif not user.email:
        user.email = normalized_email
        user.save(update_fields=["email"])

    return user


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticatedSchedulingUser]

    def get_queryset(self):
        if user_is_manager(self.request.user):
            return Employee.objects.select_related("primary_role", "user")
        profile = employee_profile_for(self.request.user)
        if profile:
            return Employee.objects.filter(pk=profile.pk).select_related(
                "primary_role",
                "user",
            )
        return Employee.objects.none()

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsManager()]
        return super().get_permissions()

    def perform_create(self, serializer):
        email = serializer.validated_data.get("email")
        user = get_or_create_login_user_for_employee(email)
        instance = serializer.save(user=user)
        self._sync_primary_role(instance)

    def perform_update(self, serializer):
        email = serializer.validated_data.get("email")
        instance = serializer.instance
        if email:
            user = get_or_create_login_user_for_employee(
                email,
                existing_user=instance.user,
            )
            instance = serializer.save(user=user)
        else:
            instance = serializer.save()
        self._sync_primary_role(instance)

    def _sync_primary_role(self, employee):
        if employee.primary_role_id and not employee.roles.filter(pk=employee.primary_role_id).exists():
            employee.roles.add(employee.primary_role_id)

    @action(detail=False, methods=["get"])
    def me(self, request):
        profile = require_employee_profile(request)
        serializer = self.get_serializer(profile)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def teammates(self, request):
        profile = require_employee_profile(request)
        teammates = Employee.objects.select_related("primary_role").filter(
            account_type=Employee.ACCOUNT_TYPE_EMPLOYEE,
        ).exclude(pk=profile.pk)
        serializer = self.get_serializer(teammates, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def eligible_for_giveaway(self, request):
        profile = require_employee_profile(request)
        shift_id = request.query_params.get("shift")
        shift = Shift.objects.filter(pk=shift_id).first() if shift_id else None
        if not shift:
            return Response([])
        shift_date = timezone.localtime(shift.start_time).date()
        busy_ids = set(
            Assignment.objects.filter(
                shift__start_time__date=shift_date,
                shift__schedule_week__status=ScheduleWeek.STATUS_PUBLISHED,
            ).values_list("employee_id", flat=True)
        )
        qs = Employee.objects.filter(account_type=Employee.ACCOUNT_TYPE_EMPLOYEE)
        if shift.role_id:
            qs = qs.filter(
                Q(roles=shift.role_id) | Q(primary_role_id=shift.role_id)
            )
        qs = qs.exclude(pk__in=busy_ids).exclude(pk=profile.pk).distinct()
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], permission_classes=[IsManager])
    def eligible_for_open_slot(self, request):
        shift_id = request.query_params.get("shift")
        shift = Shift.objects.filter(pk=shift_id).first() if shift_id else None
        if not shift:
            return Response([])
        shift_date = timezone.localtime(shift.start_time).date()
        day_of_week = shift_date.weekday()  # 0=Mon … 6=Sun matches DAY_CHOICES
        busy_ids = set(
            Assignment.objects.filter(
                shift__start_time__date=shift_date,
            ).values_list("employee_id", flat=True)
        )
        available_ids = set(
            BaselineAvailability.objects.filter(
                day_of_week=day_of_week,
                is_active=True,
                effective_date__lte=shift_date,
            ).values_list("employee_id", flat=True)
        )
        qs = Employee.objects.filter(
            account_type=Employee.ACCOUNT_TYPE_EMPLOYEE,
            pk__in=available_ids,
        ).exclude(pk__in=busy_ids)
        if shift.role_id:
            qs = qs.filter(
                Q(roles=shift.role_id) | Q(primary_role_id=shift.role_id)
            )
        serializer = self.get_serializer(qs.distinct(), many=True)
        return Response(serializer.data)


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsManagerOrReadOnlySchedulingUser]


class OperatingHoursViewSet(viewsets.ModelViewSet):
    queryset = OperatingHours.objects.all()
    serializer_class = OperatingHoursSerializer
    permission_classes = [IsManagerOrReadOnlySchedulingUser]


class StaffingRequirementViewSet(viewsets.ModelViewSet):
    queryset = StaffingRequirement.objects.select_related("role")
    serializer_class = StaffingRequirementSerializer
    permission_classes = [IsManagerOrReadOnlySchedulingUser]

    def get_queryset(self):
        queryset = StaffingRequirement.objects.select_related("role")
        if self.request.query_params.get("active") == "true":
            queryset = queryset.filter(is_active=True)
        return queryset

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsManager()]
        return super().get_permissions()

    def perform_create(self, serializer):
        translate_django_validation(lambda: serializer.save())

    def perform_update(self, serializer):
        translate_django_validation(lambda: serializer.save())


def _notify_managers_pickup(swap_request, requester):
    manager_emails = list(
        Employee.objects.filter(account_type=Employee.ACCOUNT_TYPE_MANAGER)
        .exclude(email="")
        .values_list("email", flat=True)
    )
    if not manager_emails:
        return
    shift = swap_request.shift
    shift_start = timezone.localtime(shift.start_time)
    role_name = shift.role.name if shift.role else "Shift"
    date_str = shift_start.strftime("%A, %B %-d")
    time_str = shift_start.strftime("%-I:%M %p")
    subject = f"Pickup request: {requester.name} wants {role_name} on {date_str}"
    body = (
        f"{requester.name} has volunteered to pick up the following open shift:\n\n"
        f"  Position: {role_name}\n"
        f"  Shift: {shift.title}\n"
        f"  Date: {date_str}\n"
        f"  Time: {time_str}\n\n"
        f"Log in to approve or deny this request from the Requests page."
    )
    try:
        send_mail(subject, body, None, manager_emails, fail_silently=True)
    except Exception:
        pass


def _build_shift_snapshot(schedule_week):
    def fmt_time(dt):
        return dt.strftime("%I:%M %p").lstrip("0")

    shifts = (
        Shift.objects.select_related("role")
        .prefetch_related("assignments__employee")
        .filter(
            start_time__date__gte=schedule_week.week_start,
            start_time__date__lte=schedule_week.week_end,
        )
        .order_by("start_time")
    )
    requirements = StaffingRequirement.objects.filter(is_active=True)
    roles_map = {}
    for shift in shifts:
        role_name = shift.role.name if shift.role else "General"
        if role_name not in roles_map:
            roles_map[role_name] = {
                "role_id": shift.role_id,
                "role_name": role_name,
                "role_department": shift.role.department if shift.role else None,
                "days": {str(i): [] for i in range(7)},
            }
        shift_start = timezone.localtime(shift.start_time)
        shift_end = timezone.localtime(shift.end_time)
        day_index = (shift_start.date() - schedule_week.week_start).days
        if day_index < 0 or day_index > 6:
            continue
        assignments = list(shift.assignments.all())
        for assignment in assignments:
            roles_map[role_name]["days"][str(day_index)].append({
                "assignment_id": assignment.id,
                "employee_id": assignment.employee_id,
                "shift_id": shift.id,
                "shift_title": shift.title,
                "role_id": shift.role_id,
                "employee_name": assignment.employee.name,
                "start_time": shift_start.isoformat(),
                "end_time": shift_end.isoformat(),
                "display_time": f"Arrive {fmt_time(shift_start)}",
                "notes": shift.notes,
                "is_open": False,
            })
        matching_req = requirements.filter(
            role=shift.role,
            title=shift.title,
            day_of_week=shift_start.weekday(),
            start_time=shift_start.time(),
        ).first()
        required_count = matching_req.required_count if matching_req else 0
        open_count = max(required_count - len(assignments), 0)
        for _ in range(open_count):
            roles_map[role_name]["days"][str(day_index)].append({
                "assignment_id": None,
                "employee_id": None,
                "shift_id": shift.id,
                "shift_title": shift.title,
                "role_id": shift.role_id,
                "employee_name": "Open",
                "start_time": shift_start.isoformat(),
                "end_time": shift_end.isoformat(),
                "display_time": f"Arrive {fmt_time(shift_start)}",
                "notes": "",
                "is_open": True,
            })
    return list(roles_map.values())


class ScheduleWeekViewSet(viewsets.ModelViewSet):
    serializer_class = ScheduleWeekSerializer
    permission_classes = [IsManagerOrReadOnlySchedulingUser]

    def get_queryset(self):
        queryset = ScheduleWeek.objects.select_related("published_by")
        if user_is_manager(self.request.user):
            return queryset
        return queryset.filter(status=ScheduleWeek.STATUS_PUBLISHED)

    def perform_create(self, serializer):
        translate_django_validation(lambda: serializer.save())

    def perform_update(self, serializer):
        translate_django_validation(lambda: serializer.save())

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def publish(self, request, pk=None):
        schedule_week = self.get_object()
        schedule_week.publish(request.user)
        serializer = self.get_serializer(schedule_week)
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["post"],
        permission_classes=[IsManager],
        url_path="generate-draft",
    )
    def generate_draft(self, request):
        week_start = parse_date(request.data.get("week_start", ""))
        if not week_start:
            raise ValidationError({"week_start": ["A valid week_start date is required."]})
        department = request.data.get("department") or None

        schedule_week, _ = ScheduleWeek.objects.get_or_create(week_start=week_start)
        summary = translate_django_validation(
            lambda: generate_schedule_from_requirements(week_start, department=department)
        )
        serializer = self.get_serializer(schedule_week)
        return Response({"schedule_week": serializer.data, "summary": summary})

    @action(
        detail=False,
        methods=["post"],
        permission_classes=[IsManager],
        url_path="copy-last-week",
    )
    def copy_last_week(self, request):
        week_start = parse_date(request.data.get("week_start", ""))
        if not week_start:
            raise ValidationError({"week_start": ["A valid week_start date is required."]})

        summary = translate_django_validation(
            lambda: copy_schedule_from_last_week(week_start)
        )
        if "error" in summary:
            return Response({"detail": summary["error"]}, status=400)
        schedule_week, _ = ScheduleWeek.objects.get_or_create(week_start=week_start)
        serializer = self.get_serializer(schedule_week)
        return Response({"schedule_week": serializer.data, "summary": summary})

    @action(
        detail=False,
        methods=["post"],
        permission_classes=[IsManager],
        url_path="publish-week",
    )
    def publish_week(self, request):
        week_start = parse_date(request.data.get("week_start", ""))
        if not week_start:
            raise ValidationError({"week_start": ["A valid week_start date is required."]})

        department = request.data.get("department") or None
        schedule_week, _ = ScheduleWeek.objects.get_or_create(week_start=week_start)
        snapshot = _build_shift_snapshot(schedule_week)
        if department:
            schedule_week.publish_department(department, request.user, shift_snapshot=snapshot)
        else:
            schedule_week.publish(request.user, shift_snapshot=snapshot)
        send_schedule_published(schedule_week, department, request)
        serializer = self.get_serializer(schedule_week)
        return Response(serializer.data)


class ShiftViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftSerializer
    permission_classes = [IsManagerOrReadOnlySchedulingUser]

    def get_queryset(self):
        queryset = Shift.objects.select_related("role", "schedule_week").prefetch_related(
            "assignments__employee"
        )
        is_manager = user_is_manager(self.request.user)
        if is_manager:
            if self.request.query_params.get("is_open") == "true":
                queryset = queryset.filter(is_open=True)
            return queryset
        profile = employee_profile_for(self.request.user)
        if profile:
            today = timezone.localdate()

            visibility_q = build_schedule_visibility_q(profile)

            if self.request.query_params.get("is_open") == "true":
                return queryset.filter(
                    is_open=True,
                    start_time__date__gte=today,
                ).filter(visibility_q).distinct()
            if self.request.query_params.get("for_trade") == "true":
                role_ids = set(profile.roles.values_list("id", flat=True))
                if profile.primary_role_id:
                    role_ids.add(profile.primary_role_id)
                busy_dates = set(
                    Assignment.objects.filter(
                        employee=profile,
                        shift__schedule_week__status=ScheduleWeek.STATUS_PUBLISHED,
                        shift__start_time__date__gte=today,
                    ).values_list("shift__start_time__date", flat=True)
                )
                qs = queryset.filter(
                    start_time__date__gte=today,
                    role_id__in=role_ids,
                ).filter(visibility_q).exclude(assignments__employee=profile)
                if busy_dates:
                    qs = qs.exclude(start_time__date__in=busy_dates)
                my_shift_id = self.request.query_params.get("my_shift")
                if my_shift_id:
                    my_shift = Shift.objects.filter(pk=my_shift_id).first()
                    if my_shift and my_shift.role_id:
                        qs = qs.filter(
                            Q(assignments__employee__roles=my_shift.role_id) |
                            Q(assignments__employee__primary_role=my_shift.role_id)
                        )
                    if my_shift and my_shift.start_time:
                        my_shift_date = timezone.localtime(my_shift.start_time).date()
                        already_busy_ids = set(
                            Assignment.objects.filter(
                                shift__start_time__date=my_shift_date,
                                shift__schedule_week__status=ScheduleWeek.STATUS_PUBLISHED,
                            ).exclude(employee=profile)
                            .values_list("employee_id", flat=True)
                        )
                        if already_busy_ids:
                            qs = qs.exclude(assignments__employee_id__in=already_busy_ids)
                return qs.distinct()
            return queryset.filter(
                assignments__employee=profile,
                start_time__date__gte=today,
            ).filter(visibility_q).distinct()
        return Shift.objects.none()

    def perform_create(self, serializer):
        serializer.instance = translate_django_validation(
            lambda: create_shift(serializer.validated_data)
        )

    def perform_update(self, serializer):
        serializer.instance = translate_django_validation(
            lambda: update_shift(serializer.instance, serializer.validated_data)
        )

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def mark_open(self, request, pk=None):
        shift = self.get_object()
        shift.is_open = request.data.get("is_open", True)
        Shift.objects.filter(pk=shift.pk).update(is_open=shift.is_open)
        serializer = self.get_serializer(shift)
        return Response(serializer.data)


class AvailabilityViewSet(viewsets.ModelViewSet):
    serializer_class = AvailabilitySerializer
    permission_classes = [IsManagerOrReadOnlySchedulingUser]

    def get_queryset(self):
        queryset = Availability.objects.select_related("employee")
        if user_is_manager(self.request.user):
            return queryset
        profile = employee_profile_for(self.request.user)
        if profile:
            return queryset.filter(employee=profile)
        return Availability.objects.none()

    def perform_create(self, serializer):
        serializer.instance = translate_django_validation(
            lambda: create_availability(serializer.validated_data)
        )

    def perform_update(self, serializer):
        serializer.instance = translate_django_validation(
            lambda: update_availability(
                serializer.instance,
                serializer.validated_data,
            )
        )


class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer
    permission_classes = [IsManagerOrReadOnlySchedulingUser]

    def get_queryset(self):
        queryset = Assignment.objects.select_related(
            "employee",
            "shift",
            "shift__role",
            "shift__schedule_week",
        )
        if user_is_manager(self.request.user):
            return queryset
        profile = employee_profile_for(self.request.user)
        if profile:
            return queryset.filter(
                employee=profile,
                shift__schedule_week__status=ScheduleWeek.STATUS_PUBLISHED,
                shift__start_time__date__gte=timezone.localdate(),
            )
        return Assignment.objects.none()

    def perform_create(self, serializer):
        serializer.instance = translate_django_validation(
            lambda: create_assignment(serializer.validated_data)
        )

    def perform_update(self, serializer):
        serializer.instance = translate_django_validation(
            lambda: update_assignment(
                serializer.instance,
                serializer.validated_data,
            )
        )

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def move(self, request, pk=None):
        assignment = self.get_object()
        target_shift_id = request.data.get("target_shift")
        if not target_shift_id:
            raise ValidationError({"target_shift": ["Target shift is required."]})

        target_shift = Shift.objects.filter(pk=target_shift_id).first()
        if not target_shift:
            raise ValidationError({"target_shift": ["Target shift does not exist."]})

        swap_assignment_id = request.data.get("swap_assignment")

        def move_assignment():
            with transaction.atomic():
                original_shift = assignment.shift

                if swap_assignment_id:
                    swap_assignment = Assignment.objects.select_related("shift").get(
                        pk=swap_assignment_id,
                    )
                    if swap_assignment.pk == assignment.pk:
                        return assignment
                    if swap_assignment.shift_id != target_shift.id:
                        raise DjangoValidationError(
                            "Swap target is no longer assigned to that shift."
                        )

                    assignment.shift = target_shift
                    assignment.save()
                    swap_assignment.shift = original_shift
                    swap_assignment.save()
                    return assignment

                assignment.shift = target_shift
                assignment.save()
                return assignment

        try:
            moved_assignment = translate_django_validation(move_assignment)
        except Assignment.DoesNotExist:
            raise ValidationError({"swap_assignment": ["Swap assignment does not exist."]})

        serializer = self.get_serializer(moved_assignment)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def reschedule(self, request, pk=None):
        assignment = self.get_object()
        title = request.data.get("title", "").strip()
        arrival_time = request.data.get("arrival_time", "")

        if not title:
            raise ValidationError({"title": ["Service is required."]})
        parsed_time = self._parse_arrival_time(arrival_time)
        if not parsed_time:
            raise ValidationError({"arrival_time": ["Arrival time is required."]})

        def reschedule_assignment():
            current_shift = assignment.shift
            current_start = timezone.localtime(current_shift.start_time)
            shift_date = current_start.date()
            target_start = timezone.make_aware(
                datetime.combine(shift_date, parsed_time),
                current_start.tzinfo,
            )
            target_end = timezone.make_aware(
                datetime.combine(
                    shift_date,
                    self._shift_end_time_for(current_shift),
                ),
                current_start.tzinfo,
            )

            target_shift, _ = Shift.objects.get_or_create(
                schedule_week=current_shift.schedule_week,
                role=current_shift.role,
                title=title,
                start_time=target_start,
                end_time=target_end,
                defaults={"notes": "Manager edited assignment."},
            )
            assignment.shift = target_shift
            assignment.save()
            return assignment

        moved_assignment = translate_django_validation(reschedule_assignment)
        serializer = self.get_serializer(moved_assignment)
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["get"],
        permission_classes=[IsManager],
        url_path="unavailability-reason",
    )
    def unavailability_reason(self, request):
        employee = Employee.objects.filter(pk=request.query_params.get("employee")).first()
        shift = Shift.objects.filter(pk=request.query_params.get("shift")).first()
        if not employee or not shift:
            return Response({"reason": "unknown", "detail": "Could not find employee or shift."})

        shift_date = timezone.localtime(shift.start_time).date()

        time_off = TimeOffRequest.objects.filter(
            employee=employee,
            status=REQUEST_STATUS_APPROVED,
            start_date__lte=shift_date,
            end_date__gte=shift_date,
        ).first()
        if time_off:
            start = time_off.start_date.strftime("%b %-d")
            end = time_off.end_date.strftime("%b %-d, %Y")
            detail = (
                f"Has approved time off from {start} to {end}."
                if time_off.start_date != time_off.end_date
                else f"Has approved time off on {start}."
            )
            return Response({"reason": "time_off", "detail": detail})

        day_of_week = shift_date.weekday()
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        if not BaselineAvailability.objects.filter(
            employee=employee,
            day_of_week=day_of_week,
            is_active=True,
            effective_date__lte=shift_date,
        ).exists():
            return Response({
                "reason": "no_availability",
                "detail": f"No availability set for {day_names[day_of_week]}s.",
            })

        return Response({
            "reason": "unavailable",
            "detail": "Marked unavailable during this shift time.",
        })

    @action(
        detail=False,
        methods=["post"],
        permission_classes=[IsManager],
        url_path="force-create",
    )
    def force_create(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = serializer.validated_data["employee"]
        shift = serializer.validated_data["shift"]

        if Assignment.objects.filter(employee=employee, shift=shift).exists():
            return Response(self.get_serializer(
                Assignment.objects.get(employee=employee, shift=shift)
            ).data, status=status.HTTP_200_OK)

        assignment = Assignment(employee=employee, shift=shift)
        assignment._skip_availability_check = True
        try:
            assignment.save()
        except Exception as exc:
            raise ValidationError({"detail": [str(exc)]})

        serializer = self.get_serializer(assignment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _parse_arrival_time(self, value):
        try:
            return datetime.strptime(value, "%H:%M").time()
        except (TypeError, ValueError):
            return None

    def _shift_end_time_for(self, shift):
        return timezone.localtime(shift.end_time).time()


class BaselineAvailabilityViewSet(viewsets.ModelViewSet):
    serializer_class = BaselineAvailabilitySerializer
    permission_classes = [IsManagerOrReadOnlySchedulingUser]

    def get_queryset(self):
        queryset = BaselineAvailability.objects.select_related("employee")
        if user_is_manager(self.request.user):
            return queryset
        profile = employee_profile_for(self.request.user)
        if profile:
            return queryset.filter(employee=profile, is_active=True)
        return BaselineAvailability.objects.none()

    def perform_create(self, serializer):
        translate_django_validation(lambda: serializer.save())

    def perform_update(self, serializer):
        translate_django_validation(lambda: serializer.save())


class AvailabilityChangeRequestViewSet(viewsets.ModelViewSet):
    serializer_class = AvailabilityChangeRequestSerializer
    permission_classes = [IsAuthenticatedSchedulingUser]

    def get_queryset(self):
        queryset = AvailabilityChangeRequest.objects.select_related(
            "employee",
            "reviewed_by",
        )
        if user_is_manager(self.request.user):
            status_filter = self.request.query_params.get("status")
            if status_filter:
                queryset = queryset.filter(status=status_filter)
            return queryset
        profile = employee_profile_for(self.request.user)
        if profile:
            return queryset.filter(employee=profile)
        return AvailabilityChangeRequest.objects.none()

    def perform_create(self, serializer):
        if user_is_manager(self.request.user):
            translate_django_validation(lambda: serializer.save())
            return
        profile = require_employee_profile(self.request)
        instance = translate_django_validation(lambda: serializer.save(employee=profile))
        if instance:
            day_name = dict(enumerate(["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"])).get(instance.day_of_week, "")
            detail = f"{day_name} → {instance.requested_status}"
            if instance.effective_date:
                detail += f" (effective {instance.effective_date})"
            send_request_submitted_to_managers(profile, "availability change", detail, self.request)

    def perform_update(self, serializer):
        translate_django_validation(lambda: serializer.save())

    def get_permissions(self):
        if self.action in ["update", "partial_update", "destroy", "approve", "deny"]:
            return [IsManager()]
        return super().get_permissions()

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def approve(self, request, pk=None):
        instance = self.get_object()
        translate_django_validation(lambda: instance.approve(request.user))
        day_name = dict(enumerate(["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"])).get(instance.day_of_week, "")
        detail = f"{day_name} → {instance.requested_status}"
        send_request_approved_to_employee(instance.employee, "availability change", detail, request)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def deny(self, request, pk=None):
        instance = self.get_object()
        deny_request(instance, request.user, request.data.get("manager_note", ""))
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticatedSchedulingUser])
    def cancel(self, request, pk=None):
        instance = self.get_object()
        profile = require_employee_profile(request)
        if instance.employee_id != profile.pk:
            raise PermissionDenied("You can only cancel your own requests.")
        if instance.status != REQUEST_STATUS_PENDING:
            raise ValidationError("Only pending requests can be cancelled.")
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TimeOffRequestViewSet(viewsets.ModelViewSet):
    serializer_class = TimeOffRequestSerializer
    permission_classes = [IsAuthenticatedSchedulingUser]

    def get_queryset(self):
        queryset = TimeOffRequest.objects.select_related("employee", "reviewed_by")
        if user_is_manager(self.request.user):
            status_filter = self.request.query_params.get("status")
            if status_filter:
                queryset = queryset.filter(status=status_filter)
            return queryset
        profile = employee_profile_for(self.request.user)
        if profile:
            return queryset.filter(employee=profile)
        return TimeOffRequest.objects.none()

    def perform_create(self, serializer):
        if user_is_manager(self.request.user):
            translate_django_validation(lambda: serializer.save(
                status="approved",
                reviewed_by=self.request.user,
                reviewed_at=timezone.now(),
            ))
            return
        profile = require_employee_profile(self.request)
        instance = translate_django_validation(lambda: serializer.save(employee=profile))
        if instance:
            detail = f"{instance.start_date} → {instance.end_date}"
            if instance.reason:
                detail += f": {instance.reason}"
            send_request_submitted_to_managers(profile, "time off", detail, self.request)

    def perform_update(self, serializer):
        translate_django_validation(lambda: serializer.save())

    def get_permissions(self):
        if self.action in ["update", "partial_update", "destroy", "approve", "deny"]:
            return [IsManager()]
        return super().get_permissions()

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def approve(self, request, pk=None):
        instance = self.get_object()
        translate_django_validation(lambda: instance.approve(request.user))
        detail = f"{instance.start_date} → {instance.end_date}"
        send_request_approved_to_employee(instance.employee, "time off", detail, request)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def deny(self, request, pk=None):
        instance = self.get_object()
        deny_request(instance, request.user, request.data.get("manager_note", ""))
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticatedSchedulingUser])
    def cancel(self, request, pk=None):
        instance = self.get_object()
        profile = require_employee_profile(request)
        if instance.employee_id != profile.pk:
            raise PermissionDenied("You can only cancel your own requests.")
        if instance.status != REQUEST_STATUS_PENDING:
            raise ValidationError("Only pending requests can be cancelled.")
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ShiftSwapRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftSwapRequestSerializer
    permission_classes = [IsAuthenticatedSchedulingUser]

    def get_queryset(self):
        queryset = ShiftSwapRequest.objects.select_related(
            "shift",
            "requester",
            "requested_employee",
            "coverer",
            "reviewed_by",
        )
        if user_is_manager(self.request.user):
            status_filter = self.request.query_params.get("status")
            if status_filter:
                queryset = queryset.filter(status=status_filter)
            return queryset
        profile = employee_profile_for(self.request.user)
        if profile:
            return queryset.filter(
                Q(requester=profile)
                | Q(requested_employee=profile)
                | Q(coverer=profile)
                | Q(
                    request_type=ShiftSwapRequest.TYPE_GIVEAWAY,
                    status=REQUEST_STATUS_PENDING,
                    coverer__isnull=True,
                )
            )
        return ShiftSwapRequest.objects.none()

    def perform_create(self, serializer):
        if user_is_manager(self.request.user):
            translate_django_validation(lambda: serializer.save())
            return
        profile = require_employee_profile(self.request)
        request_type = serializer.validated_data.get("request_type", ShiftSwapRequest.TYPE_GIVEAWAY)
        extra = {"requester": profile}
        if request_type == ShiftSwapRequest.TYPE_PICKUP:
            extra["coverer"] = profile
            extra["coverer_approved"] = True
        if request_type == ShiftSwapRequest.TYPE_GIVEAWAY:
            requested_employee = serializer.validated_data.get("requested_employee")
            shift = serializer.validated_data.get("shift")
            if requested_employee and shift:
                shift_date = timezone.localtime(shift.start_time).date()
                already_scheduled = Assignment.objects.filter(
                    employee=requested_employee,
                    shift__start_time__date=shift_date,
                    shift__schedule_week__status=ScheduleWeek.STATUS_PUBLISHED,
                ).exists()
                if already_scheduled:
                    raise ValidationError(
                        f"{requested_employee.name} is already scheduled on that day and cannot receive this shift."
                    )
        instance = translate_django_validation(lambda: serializer.save(**extra))
        if instance:
            if request_type == ShiftSwapRequest.TYPE_PICKUP:
                _notify_managers_pickup(instance, profile)
            elif request_type == ShiftSwapRequest.TYPE_SWAP and instance.requested_employee:
                send_trade_proposed(instance, self.request)

    def perform_update(self, serializer):
        translate_django_validation(lambda: serializer.save())

    def get_permissions(self):
        if self.action in ["update", "partial_update", "destroy", "approve", "deny"]:
            return [IsManager()]
        return super().get_permissions()

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticatedSchedulingUser])
    def accept(self, request, pk=None):
        instance = self.get_object()
        profile = require_employee_profile(request)

        if instance.coverer_approved:
            raise ValidationError("This request has already been accepted.")

        if instance.request_type == ShiftSwapRequest.TYPE_SWAP:
            if not instance.requested_employee or profile.pk != instance.requested_employee.pk:
                raise PermissionDenied("Only the requested employee can accept this swap.")
            instance.coverer = profile
        elif instance.request_type == ShiftSwapRequest.TYPE_GIVEAWAY:
            if profile.pk == instance.requester_id:
                raise ValidationError("You cannot claim your own shift giveaway.")
            if instance.coverer_id:
                raise ValidationError("This shift has already been claimed.")
            if instance.requested_employee_id and profile.pk != instance.requested_employee_id:
                raise PermissionDenied("This giveaway is directed at a specific employee.")
            shift_date = timezone.localtime(instance.shift.start_time).date()
            if Assignment.objects.filter(
                employee=profile,
                shift__start_time__date=shift_date,
                shift__schedule_week__status=ScheduleWeek.STATUS_PUBLISHED,
            ).exists():
                raise ValidationError("You are already scheduled on this day and cannot claim this shift.")
            instance.coverer = profile
        else:
            raise ValidationError("Pickup requests are approved directly by managers.")

        instance.coverer_approved = True
        instance.save()
        if instance.request_type == ShiftSwapRequest.TYPE_SWAP:
            send_trade_accepted_notify_managers(instance, request)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticatedSchedulingUser])
    def decline(self, request, pk=None):
        instance = self.get_object()
        profile = require_employee_profile(request)
        if instance.requested_employee_id != profile.pk:
            raise PermissionDenied("You can only decline requests directed at you.")
        if instance.coverer_approved:
            raise ValidationError("This request has already been accepted.")
        deny_request(instance, note="Declined by requested employee.")
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def approve(self, request, pk=None):
        instance = self.get_object()
        with transaction.atomic():
            translate_django_validation(lambda: instance.approve(request.user))
        shift = instance.shift
        shift_start = timezone.localtime(shift.start_time)
        shift_str = f"{shift_start.strftime('%A, %B %-d')} at {shift_start.strftime('%-I:%M %p')}"
        type_label = {"swap": "trade", "giveaway": "giveaway", "pickup": "pickup"}.get(instance.request_type, instance.request_type)
        detail = f"{shift.role.name if shift.role else 'Shift'} — {shift.title} on {shift_str}"
        recipient = instance.coverer or instance.requester
        send_request_approved_to_employee(recipient, f"shift {type_label}", detail, request)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def deny(self, request, pk=None):
        instance = self.get_object()
        deny_request(instance, request.user, request.data.get("manager_note", ""))
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticatedSchedulingUser])
    def cancel(self, request, pk=None):
        instance = self.get_object()
        profile = require_employee_profile(request)
        if instance.requester_id != profile.pk:
            raise PermissionDenied("You can only cancel your own requests.")
        if instance.status != REQUEST_STATUS_PENDING:
            raise ValidationError("Only pending requests can be cancelled.")
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClosedDayViewSet(viewsets.ModelViewSet):
    serializer_class = ClosedDaySerializer
    permission_classes = [IsManagerOrReadOnlySchedulingUser]

    def get_queryset(self):
        qs = ClosedDay.objects.all()
        start = self.request.query_params.get("start")
        end = self.request.query_params.get("end")
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        return qs


class WeeklyScheduleAPIView(APIView):
    permission_classes = [IsAuthenticatedSchedulingUser]

    def get(self, request):
        requested_start = parse_date(request.query_params.get("start", ""))
        today = timezone.localdate()
        week_start = requested_start or today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        is_manager = user_is_manager(request.user)
        days = [week_start + timedelta(days=offset) for offset in range(7)]
        schedule_week = ScheduleWeek.objects.filter(week_start=week_start).first()

        profile = None
        if not is_manager:
            profile = require_employee_profile(request)
            week_visible = schedule_week and schedule_week.status == ScheduleWeek.STATUS_PUBLISHED
            if not week_visible and schedule_week:
                emp_depts = set(profile.roles.values_list("department", flat=True))
                if profile.primary_role_id:
                    pr_dept = Role.objects.filter(pk=profile.primary_role_id).values_list("department", flat=True).first()
                    if pr_dept:
                        emp_depts.add(pr_dept)
                week_visible = any(
                    schedule_week.department_statuses.get(dept) == ScheduleWeek.STATUS_PUBLISHED
                    for dept in emp_depts
                )
            if not week_visible:
                closed_days_qs = ClosedDay.objects.filter(date__gte=week_start, date__lte=week_end)
                closed_day_map = {cd.date: cd for cd in closed_days_qs}
                closed_dates = set(closed_day_map.keys())
                all_days = [week_start + timedelta(days=i) for i in range(7)]
                return Response({
                    "week_start": week_start.isoformat(),
                    "week_end": week_end.isoformat(),
                    "status": schedule_week.status if schedule_week else ScheduleWeek.STATUS_DRAFT,
                    "department_statuses": schedule_week.department_statuses if schedule_week else {},
                    "has_unpublished_changes": schedule_week.has_unpublished_changes if schedule_week else False,
                    "published_at": schedule_week.published_at.isoformat() if schedule_week and schedule_week.published_at else None,
                    "published_snapshot": (
                        schedule_week.published_shifts_snapshot
                        if schedule_week and schedule_week.has_unpublished_changes and schedule_week.published_shifts_snapshot
                        else None
                    ),
                    "days": [
                        {
                            "index": i,
                            "date": d.isoformat(),
                            "label": d.strftime("%a"),
                            "closed": d in closed_dates,
                            "closed_note": closed_day_map[d].note if d in closed_day_map else "",
                            "closed_day_id": closed_day_map[d].id if d in closed_day_map else None,
                        }
                        for i, d in enumerate(all_days)
                    ],
                    "roles": [],
                })

        closed_days_qs = ClosedDay.objects.filter(date__gte=week_start, date__lte=week_end)
        closed_day_map = {cd.date: cd for cd in closed_days_qs}
        closed_dates = set(closed_day_map.keys())

        roles = list(Role.objects.order_by("name"))
        shifts = (
            Shift.objects.select_related("role")
            .prefetch_related("assignments__employee")
            .filter(start_time__date__gte=week_start, start_time__date__lte=week_end)
            .order_by("start_time")
        )
        if profile:
            shifts = shifts.filter(assignments__employee=profile).distinct()

        role_id_by_name = {role.name: role.id for role in roles}
        role_dept_by_name = {role.name: role.department for role in roles}
        role_names = [role.name for role in roles]
        if any(shift.role is None for shift in shifts):
            role_names.append("General")

        role_rows = [
            {
                "role_id": role_id_by_name.get(role_name),
                "role_name": role_name,
                "role_department": role_dept_by_name.get(role_name),
                "days": {str(index): [] for index in range(7)},
            }
            for role_name in role_names
        ]
        row_by_role = {row["role_name"]: row for row in role_rows}
        visible_day_indexes = set(range(7)) if is_manager else set()
        requirement_counts = self._requirement_counts(week_start)

        for shift in shifts:
            shift_start = timezone.localtime(shift.start_time)
            shift_end = timezone.localtime(shift.end_time)
            day_index = (shift_start.date() - week_start).days
            if day_index < 0 or day_index > 6:
                continue

            role_name = shift.role.name if shift.role else "General"
            row = row_by_role.setdefault(
                role_name,
                {
                    "role_id": role_id_by_name.get(role_name),
                    "role_name": role_name,
                    "role_department": role_dept_by_name.get(role_name),
                    "days": {str(index): [] for index in range(7)},
                },
            )

            assignments = list(shift.assignments.all())
            if profile:
                assignments = [
                    assignment for assignment in assignments if assignment.employee_id == profile.id
                ]

            if assignments:
                for assignment in assignments:
                    visible_day_indexes.add(day_index)
                    row["days"][str(day_index)].append(
                        self._format_assignment(
                            shift,
                            shift_start,
                            shift_end,
                            assignment.employee.name,
                            assignment=assignment,
                        )
                    )
            if is_manager:
                required_count = requirement_counts.get(shift.id, len(assignments))
                open_count = max(required_count - len(assignments), 0)
                for _ in range(open_count):
                    row["days"][str(day_index)].append(
                        self._format_assignment(
                            shift,
                            shift_start,
                            shift_end,
                            "Open",
                            is_open=True,
                        )
                    )

        if not is_manager:
            days = [
                day
                for index, day in enumerate(days)
                if index in visible_day_indexes
            ]
            role_rows = [
                row
                for row in role_rows
                if any(row["days"][str(index)] for index in visible_day_indexes)
            ]

        return Response(
            {
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "status": schedule_week.status if schedule_week else ScheduleWeek.STATUS_DRAFT,
                "department_statuses": schedule_week.department_statuses if schedule_week else {},
                "has_unpublished_changes": schedule_week.has_unpublished_changes if schedule_week else False,
                "published_at": schedule_week.published_at.isoformat() if schedule_week and schedule_week.published_at else None,
                "published_snapshot": (
                    schedule_week.published_shifts_snapshot
                    if schedule_week and schedule_week.has_unpublished_changes and schedule_week.published_shifts_snapshot
                    else None
                ),
                "days": [
                    {
                        "index": (day - week_start).days,
                        "date": day.isoformat(),
                        "label": day.strftime("%a"),
                        "closed": day in closed_dates,
                        "closed_note": closed_day_map[day].note if day in closed_day_map else "",
                        "closed_day_id": closed_day_map[day].id if day in closed_day_map else None,
                    }
                    for day in days
                ],
                "roles": role_rows,
            }
        )

    def _requirement_counts(self, week_start):
        requirements = StaffingRequirement.objects.filter(is_active=True)
        counts = {}
        shifts = Shift.objects.filter(schedule_week__week_start=week_start).select_related(
            "role"
        )
        for shift in shifts:
            shift_start = timezone.localtime(shift.start_time)
            matching_requirement = requirements.filter(
                role=shift.role,
                title=shift.title,
                day_of_week=shift_start.weekday(),
                start_time=shift_start.time(),
            ).first()
            counts[shift.id] = matching_requirement.required_count if matching_requirement else 0
        return counts

    def _format_assignment(
        self,
        shift,
        shift_start,
        shift_end,
        employee_name,
        assignment=None,
        is_open=False,
    ):
        return {
            "assignment_id": assignment.id if assignment else None,
            "employee_id": assignment.employee_id if assignment else None,
            "shift_id": shift.id,
            "shift_title": shift.title,
            "role_id": shift.role_id,
            "employee_name": employee_name,
            "start_time": shift_start.isoformat(),
            "end_time": shift_end.isoformat(),
            "display_time": f"Arrive {self._format_time(shift_start)}",
            "notes": shift.notes,
            "is_open": is_open,
        }

    def _format_time(self, value):
        return value.strftime("%I:%M %p").lstrip("0")


class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer
    permission_classes = [IsAuthenticatedSchedulingUser]

    def get_queryset(self):
        qs = Announcement.objects.select_related("posted_by").order_by("-created_at")
        if not user_is_manager(self.request.user):
            profile = employee_profile_for(self.request.user)
            if profile:
                emp_depts = set(profile.roles.values_list("department", flat=True))
                if profile.primary_role_id:
                    pr_dept = (
                        Role.objects.filter(pk=profile.primary_role_id)
                        .values_list("department", flat=True)
                        .first()
                    )
                    if pr_dept:
                        emp_depts.add(pr_dept)
                qs = qs.filter(Q(department="all") | Q(department__in=emp_depts))
        return qs

    def get_serializer_context(self):
        context = super().get_serializer_context()
        profile = employee_profile_for(self.request.user)
        if profile:
            read_ids = set(
                AnnouncementRead.objects.filter(employee=profile)
                .values_list("announcement_id", flat=True)
            )
            context["read_announcement_ids"] = read_ids
        else:
            context["read_announcement_ids"] = set()
        return context

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsManager()]
        return super().get_permissions()

    def perform_create(self, serializer):
        profile = require_employee_profile(self.request)
        serializer.save(posted_by=profile)

    @action(detail=True, methods=["post"], url_path="mark-read", permission_classes=[IsAuthenticatedSchedulingUser])
    def mark_read(self, request, pk=None):
        announcement = self.get_object()
        profile = require_employee_profile(request)
        AnnouncementRead.objects.get_or_create(announcement=announcement, employee=profile)
        serializer = self.get_serializer(announcement)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="mark-unread", permission_classes=[IsAuthenticatedSchedulingUser])
    def mark_unread(self, request, pk=None):
        announcement = self.get_object()
        profile = require_employee_profile(request)
        AnnouncementRead.objects.filter(announcement=announcement, employee=profile).delete()
        serializer = self.get_serializer(announcement)
        return Response(serializer.data)


class PendingCountAPIView(APIView):
    permission_classes = [IsAuthenticatedSchedulingUser]

    def get(self, request):
        if not user_is_manager(request.user):
            return Response({"count": 0})
        count = ShiftSwapRequest.objects.filter(
            status=REQUEST_STATUS_PENDING,
        ).exclude(
            Q(request_type=ShiftSwapRequest.TYPE_SWAP) |
            Q(request_type=ShiftSwapRequest.TYPE_GIVEAWAY, requested_employee__isnull=False),
            coverer_approved=False,
        ).count()
        count += TimeOffRequest.objects.filter(status=REQUEST_STATUS_PENDING).count()
        count += AvailabilityChangeRequest.objects.filter(status=REQUEST_STATUS_PENDING).count()
        return Response({"count": count})


class DashboardAPIView(APIView):
    permission_classes = [IsAuthenticatedSchedulingUser]

    def _announcement_serializer_context(self, request, announcements):
        profile = employee_profile_for(request.user)
        read_ids = set()
        if profile:
            read_ids = set(
                AnnouncementRead.objects.filter(
                    employee=profile,
                    announcement_id__in=[a.id for a in announcements],
                ).values_list("announcement_id", flat=True)
            )
        return {"request": request, "read_announcement_ids": read_ids}

    def get(self, request):
        is_manager = user_is_manager(request.user)
        today = timezone.localdate()

        open_shifts = list(
            Shift.objects.filter(
                is_open=True,
                schedule_week__status=ScheduleWeek.STATUS_PUBLISHED,
                start_time__date__gte=today,
            )
            .select_related("role")
            .order_by("start_time")[:10]
        )

        if is_manager:
            pending_time_off = list(
                TimeOffRequest.objects.filter(status=REQUEST_STATUS_PENDING)
                .select_related("employee")
                .order_by("-created_at")
            )
            pending_availability = list(
                AvailabilityChangeRequest.objects.filter(status=REQUEST_STATUS_PENDING)
                .select_related("employee")
                .order_by("-created_at")
            )
            pending_swaps = list(
                ShiftSwapRequest.objects.filter(status=REQUEST_STATUS_PENDING)
                .exclude(
                    Q(request_type=ShiftSwapRequest.TYPE_SWAP) |
                    Q(request_type=ShiftSwapRequest.TYPE_GIVEAWAY, requested_employee__isnull=False),
                    coverer_approved=False,
                )
                .select_related(
                    "shift", "shift__role",
                    "target_shift", "target_shift__role",
                    "requester", "coverer", "requested_employee",
                )
                .order_by("-created_at")
            )
            manager_profile = employee_profile_for(request.user)
            my_upcoming_shifts = []
            my_time_off = []
            my_availability = []
            my_swaps = []
            if manager_profile:
                next_week = today + timedelta(days=7)
                mgr_visibility_q = build_schedule_visibility_q(
                    manager_profile, schedule_week_prefix="shift__schedule_week"
                )
                upcoming_mgr = list(
                    Assignment.objects.filter(
                        employee=manager_profile,
                        shift__start_time__date__gte=today,
                        shift__start_time__date__lte=next_week,
                    )
                    .filter(mgr_visibility_q)
                    .select_related("shift", "shift__role")
                    .order_by("shift__start_time")
                )
                my_upcoming_shifts = self._format_upcoming(upcoming_mgr)
                my_time_off = list(
                    TimeOffRequest.objects.filter(employee=manager_profile, status=REQUEST_STATUS_PENDING)
                    .order_by("-created_at")[:5]
                )
                my_availability = list(
                    AvailabilityChangeRequest.objects.filter(employee=manager_profile, status=REQUEST_STATUS_PENDING)
                    .order_by("-created_at")[:5]
                )
                my_swaps = list(
                    ShiftSwapRequest.objects.filter(requester=manager_profile, status=REQUEST_STATUS_PENDING)
                    .select_related("shift", "shift__role")
                    .order_by("-created_at")[:5]
                )
            announcements = list(
                Announcement.objects.select_related("posted_by").order_by("-created_at")[:8]
            )
            ann_context = self._announcement_serializer_context(request, announcements)
            today_workers = self._format_today_workers(today)
            return Response({
                "role": "manager",
                "upcoming_shifts": my_upcoming_shifts,
                "pending_time_off": TimeOffRequestSerializer(pending_time_off, many=True).data,
                "pending_availability": AvailabilityChangeRequestSerializer(pending_availability, many=True).data,
                "pending_swaps": ShiftSwapRequestSerializer(pending_swaps, many=True).data,
                "open_shifts": self._format_shifts(open_shifts),
                "announcements": AnnouncementSerializer(announcements, many=True, context=ann_context).data,
                "my_time_off": TimeOffRequestSerializer(my_time_off, many=True).data,
                "my_availability": AvailabilityChangeRequestSerializer(my_availability, many=True).data,
                "my_swaps": ShiftSwapRequestSerializer(my_swaps, many=True).data,
                "today_workers": today_workers,
            })

        profile = require_employee_profile(request)
        employee_role_ids = set(profile.roles.values_list("id", flat=True))
        if profile.primary_role_id:
            employee_role_ids.add(profile.primary_role_id)

        emp_shift_visibility_q = build_schedule_visibility_q(profile)
        emp_assignment_visibility_q = build_schedule_visibility_q(
            profile, schedule_week_prefix="shift__schedule_week"
        )

        open_shifts = list(
            Shift.objects.filter(
                is_open=True,
                start_time__date__gte=today,
                **({"role_id__in": employee_role_ids} if employee_role_ids else {}),
            )
            .select_related("role")
            .order_by("start_time")[:10]
        )

        next_week = today + timedelta(days=7)
        upcoming_assignments = list(
            Assignment.objects.filter(
                employee=profile,
                shift__start_time__date__gte=today,
                shift__start_time__date__lte=next_week,
            )
            .filter(emp_assignment_visibility_q)
            .select_related("shift", "shift__role")
            .order_by("shift__start_time")
        )
        pending_time_off = list(
            TimeOffRequest.objects.filter(employee=profile, status=REQUEST_STATUS_PENDING)
            .order_by("-created_at")[:5]
        )
        pending_availability = list(
            AvailabilityChangeRequest.objects.filter(employee=profile, status=REQUEST_STATUS_PENDING)
            .order_by("-created_at")[:5]
        )
        busy_dates = set(
            Assignment.objects.filter(
                employee=profile,
                shift__start_time__date__gte=today,
            )
            .values_list("shift__start_time__date", flat=True)
        )
        pending_swaps = list(
            ShiftSwapRequest.objects.filter(
                requester=profile,
                status=REQUEST_STATUS_PENDING,
            )
            .select_related("shift", "shift__role", "requester", "coverer")
            .order_by("-created_at")[:5]
        )
        incoming_swaps = list(
            ShiftSwapRequest.objects.filter(
                requested_employee=profile,
                status=REQUEST_STATUS_PENDING,
                coverer_approved=False,
            )
            .exclude(shift__start_time__date__in=busy_dates)
            .select_related(
                "shift", "shift__role",
                "target_shift", "target_shift__role",
                "requester",
            )
            .order_by("-created_at")[:10]
        )
        claimable_giveaways = list(
            ShiftSwapRequest.objects.filter(
                request_type=ShiftSwapRequest.TYPE_GIVEAWAY,
                status=REQUEST_STATUS_PENDING,
                coverer__isnull=True,
                requested_employee__isnull=True,
                shift__role_id__in=employee_role_ids,
                shift__start_time__date__gte=today,
            ).exclude(requester=profile)
            .exclude(shift__start_time__date__in=busy_dates)
            .select_related("shift", "shift__role", "requester")
            .order_by("shift__start_time")[:10]
        )
        emp_depts = set(profile.roles.values_list("department", flat=True))
        if profile.primary_role_id:
            pr_dept = (
                Role.objects.filter(pk=profile.primary_role_id)
                .values_list("department", flat=True)
                .first()
            )
            if pr_dept:
                emp_depts.add(pr_dept)
        announcements = list(
            Announcement.objects.select_related("posted_by")
            .filter(Q(department="all") | Q(department__in=emp_depts))
            .order_by("-created_at")[:8]
        )
        pending_pickup_shift_ids = set(
            ShiftSwapRequest.objects.filter(
                coverer=profile,
                request_type=ShiftSwapRequest.TYPE_PICKUP,
                status=REQUEST_STATUS_PENDING,
            ).values_list("shift_id", flat=True)
        )
        ann_context = self._announcement_serializer_context(request, announcements)
        open_shift_data = [
            {**s, "has_pending_pickup": s["shift_id"] in pending_pickup_shift_ids}
            for s in self._format_shifts(open_shifts)
        ]
        return Response({
            "role": "employee",
            "upcoming_shifts": self._format_upcoming(upcoming_assignments),
            "pending_time_off": TimeOffRequestSerializer(pending_time_off, many=True).data,
            "pending_availability": AvailabilityChangeRequestSerializer(pending_availability, many=True).data,
            "pending_swaps": ShiftSwapRequestSerializer(pending_swaps, many=True).data,
            "incoming_swaps": ShiftSwapRequestSerializer(incoming_swaps, many=True).data,
            "open_shifts": open_shift_data,
            "claimable_giveaways": ShiftSwapRequestSerializer(claimable_giveaways, many=True).data,
            "announcements": AnnouncementSerializer(announcements, many=True, context=ann_context).data,
        })

    def _format_upcoming(self, assignments):
        result = []
        for a in assignments:
            shift = a.shift
            start = timezone.localtime(shift.start_time)
            end = timezone.localtime(shift.end_time)
            result.append({
                "assignment_id": a.id,
                "shift_id": shift.id,
                "title": shift.title,
                "role": shift.role.name if shift.role else "General",
                "date": start.date().isoformat(),
                "date_label": start.strftime("%a, %b %-d"),
                "start_time": start.strftime("%-I:%M %p"),
                "end_time": end.strftime("%-I:%M %p"),
                "notes": shift.notes,
            })
        return result

    def _format_today_workers(self, today):
        published_q = (
            Q(shift__schedule_week__status=ScheduleWeek.STATUS_PUBLISHED)
            | Q(shift__schedule_week__department_statuses__foh=ScheduleWeek.STATUS_PUBLISHED)
            | Q(shift__schedule_week__department_statuses__boh=ScheduleWeek.STATUS_PUBLISHED)
        )
        assignments = (
            Assignment.objects.filter(published_q, shift__start_time__date=today)
            .select_related("employee", "shift__role")
            .order_by("shift__role__name", "shift__start_time", "employee__name")
        )
        # Build dept → role → [workers] structure
        # Each assignment is its own entry — a manager can appear in both
        # management and foh/boh if they hold shifts in multiple departments today.
        groups = {"management": {}, "foh": {}, "boh": {}}
        for a in assignments:
            dept = a.shift.role.department if a.shift.role else None
            if dept not in groups:
                continue
            role_name = a.shift.role.name if a.shift.role else "General"
            start = timezone.localtime(a.shift.start_time)
            end = timezone.localtime(a.shift.end_time)
            groups[dept].setdefault(role_name, []).append({
                "assignment_id": a.id,
                "name": a.employee.name,
                "start_time": start.strftime("%-I:%M %p"),
                "end_time": end.strftime("%-I:%M %p"),
            })
        return {
            dept: [{"role": role, "workers": workers} for role, workers in roles.items()]
            for dept, roles in groups.items()
        }

    def _format_shifts(self, shifts):
        result = []
        for shift in shifts:
            start = timezone.localtime(shift.start_time)
            end = timezone.localtime(shift.end_time)
            result.append({
                "shift_id": shift.id,
                "title": shift.title,
                "role": shift.role.name if shift.role else "General",
                "date": start.date().isoformat(),
                "date_label": start.strftime("%a, %b %-d"),
                "start_time": start.strftime("%-I:%M %p"),
                "end_time": end.strftime("%-I:%M %p"),
                "notes": shift.notes,
            })
        return result


@login_required
def calendar_view(request):
    return render(request, "scheduling/calendar.html")


@login_required
def weekly_schedule_view(request):
    return render(request, "scheduling/weekly_schedule.html")


@login_required
def requests_view(request):
    return render(request, "scheduling/requests.html")


@login_required
def team_setup_view(request):
    return render(request, "scheduling/team_setup.html")


@login_required
def profile_view(request):
    return render(request, "scheduling/profile.html")


@login_required
def announcements_view(request):
    profile = employee_profile_for(request.user)
    return render(request, "scheduling/announcements.html", {
        "employee_id": profile.id if profile else None,
        "is_manager": user_is_manager(request.user),
    })


@login_required
def chat_view(request):
    return render(request, "scheduling/chat.html")
