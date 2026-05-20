from datetime import datetime, time, timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone


DAY_CHOICES = [
    (0, "Monday"),
    (1, "Tuesday"),
    (2, "Wednesday"),
    (3, "Thursday"),
    (4, "Friday"),
    (5, "Saturday"),
    (6, "Sunday"),
]

REQUEST_STATUS_PENDING = "pending"
REQUEST_STATUS_APPROVED = "approved"
REQUEST_STATUS_DENIED = "denied"

REQUEST_STATUS_CHOICES = [
    (REQUEST_STATUS_PENDING, "Pending"),
    (REQUEST_STATUS_APPROVED, "Approved"),
    (REQUEST_STATUS_DENIED, "Denied"),
]


class Employee(models.Model):
    ACCOUNT_TYPE_EMPLOYEE = "employee"
    ACCOUNT_TYPE_MANAGER = "manager"

    ACCOUNT_TYPE_CHOICES = [
        (ACCOUNT_TYPE_EMPLOYEE, "Employee"),
        (ACCOUNT_TYPE_MANAGER, "Manager"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_profile",
    )
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=20, blank=True, default="")
    account_type = models.CharField(
        max_length=20,
        choices=ACCOUNT_TYPE_CHOICES,
        default=ACCOUNT_TYPE_EMPLOYEE,
    )
    primary_role = models.ForeignKey(
        "Role",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
    )
    roles = models.ManyToManyField(
        "Role",
        blank=True,
        related_name="employees_with_role",
    )
    desired_days_per_week = models.PositiveSmallIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_manager(self):
        return self.account_type == self.ACCOUNT_TYPE_MANAGER

    def __str__(self):
        return self.name


class Role(models.Model):
    DEPT_FOH = "foh"
    DEPT_BOH = "boh"
    DEPT_MANAGEMENT = "management"
    DEPT_CHOICES = [
        (DEPT_FOH, "Front of House"),
        (DEPT_BOH, "Back of House"),
        (DEPT_MANAGEMENT, "Management"),
    ]

    name = models.CharField(max_length=100, unique=True)
    department = models.CharField(
        max_length=20,
        choices=DEPT_CHOICES,
        default=DEPT_FOH,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class OperatingHours(models.Model):
    MONDAY = 0
    TUESDAY = 1
    WEDNESDAY = 2
    THURSDAY = 3
    FRIDAY = 4
    SATURDAY = 5
    SUNDAY = 6

    day_of_week = models.PositiveSmallIntegerField(choices=DAY_CHOICES, unique=True)
    open_time = models.TimeField()
    close_time = models.TimeField()
    is_closed = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["day_of_week"]

    def clean(self):
        if not self.is_closed and self.close_time <= self.open_time:
            raise ValidationError("Close time must be after open time.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.get_day_of_week_display()


class StaffingRequirement(models.Model):
    title = models.CharField(max_length=120, default="Service")
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name="staffing_requirements",
    )
    day_of_week = models.PositiveSmallIntegerField(choices=DAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField(null=True, blank=True)
    required_count = models.PositiveSmallIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["day_of_week", "start_time", "role__name"]

    def clean(self):
        if self.required_count < 1:
            raise ValidationError("Required count must be at least 1.")
        if self.end_time and self.end_time <= self.start_time:
            raise ValidationError("Staffing requirement must end after it starts.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.get_day_of_week_display()} {self.title}: "
            f"{self.required_count} {self.role}"
        )


class ScheduleWeek(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"
    STATUS_ARCHIVED = "archived"

    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_PUBLISHED, "Published"),
        (STATUS_ARCHIVED, "Archived"),
    ]

    week_start = models.DateField(unique=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
    )
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_schedule_weeks",
    )
    department_statuses = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-week_start"]

    def clean(self):
        if self.week_start and self.week_start.weekday() != 0:
            raise ValidationError("Schedule week must start on a Monday.")

    @property
    def week_end(self):
        return self.week_start + timedelta(days=6)

    def publish(self, user=None):
        self.status = self.STATUS_PUBLISHED
        self.published_at = timezone.now()
        if user and user.is_authenticated:
            self.published_by = user
        self.save()

    def publish_department(self, department, user=None):
        statuses = dict(self.department_statuses)
        statuses[department] = self.STATUS_PUBLISHED
        self.department_statuses = statuses
        self.published_at = timezone.now()
        if user and user.is_authenticated:
            self.published_by = user
        self.save()

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Week of {self.week_start} ({self.status})"


class Availability(models.Model):
    STATUS_AVAILABLE = "available"
    STATUS_UNAVAILABLE = "unavailable"
    STATUS_PREFERRED = "preferred"

    STATUS_CHOICES = [
        (STATUS_AVAILABLE, "Available"),
        (STATUS_UNAVAILABLE, "Unavailable"),
        (STATUS_PREFERRED, "Preferred"),
    ]

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="availabilities",
    )
    date = models.DateField(default=timezone.localdate)
    start_time = models.TimeField()
    end_time = models.TimeField()
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_AVAILABLE,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date", "start_time"]

    def clean(self):
        if self.end_time <= self.start_time:
            raise ValidationError("Availability must end after it starts.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee} - {self.date}"


class BaselineAvailability(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="baseline_availability",
    )
    day_of_week = models.PositiveSmallIntegerField(choices=DAY_CHOICES)
    start_time = models.TimeField(default=time(0, 0))
    end_time = models.TimeField(default=time(23, 59))
    status = models.CharField(
        max_length=20,
        choices=[
            (Availability.STATUS_AVAILABLE, "Available"),
            (Availability.STATUS_PREFERRED, "Preferred"),
        ],
        default=Availability.STATUS_AVAILABLE,
    )
    effective_date = models.DateField(default=timezone.localdate)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["employee__name", "day_of_week"]

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee} - {self.get_day_of_week_display()}"


class AvailabilityChangeRequest(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="availability_change_requests",
    )
    day_of_week = models.PositiveSmallIntegerField(choices=DAY_CHOICES)
    requested_status = models.CharField(
        max_length=20,
        choices=[
            (Availability.STATUS_AVAILABLE, "Available"),
            (Availability.STATUS_PREFERRED, "Preferred"),
            (Availability.STATUS_UNAVAILABLE, "Unavailable"),
        ],
        default=Availability.STATUS_AVAILABLE,
    )
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    effective_date = models.DateField(default=timezone.localdate)
    reason = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=REQUEST_STATUS_CHOICES,
        default=REQUEST_STATUS_PENDING,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_availability_change_requests",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    manager_note = models.TextField(blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        return

    def approve(self, manager_user=None):
        self.status = REQUEST_STATUS_APPROVED
        self.reviewed_at = timezone.now()
        if manager_user and manager_user.is_authenticated:
            self.reviewed_by = manager_user
        self.save()

    def apply_approved_change(self):
        if self.status != REQUEST_STATUS_APPROVED or self.applied_at:
            return

        BaselineAvailability.objects.filter(
            employee=self.employee,
            day_of_week=self.day_of_week,
            is_active=True,
        ).update(is_active=False)

        if self.requested_status != Availability.STATUS_UNAVAILABLE:
            BaselineAvailability.objects.create(
                employee=self.employee,
                day_of_week=self.day_of_week,
                start_time=self.start_time or time(0, 0),
                end_time=self.end_time or time(23, 59),
                status=self.requested_status,
                effective_date=self.effective_date,
            )

        self.applied_at = timezone.now()
        type(self).objects.filter(pk=self.pk).update(applied_at=self.applied_at)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
        self.apply_approved_change()

    def __str__(self):
        return f"{self.employee} availability change ({self.status})"


class TimeOffRequest(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="time_off_requests",
    )
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=REQUEST_STATUS_CHOICES,
        default=REQUEST_STATUS_PENDING,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_time_off_requests",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    manager_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        if self.end_date < self.start_date:
            raise ValidationError("Time off must end on or after the start date.")

    def approve(self, manager_user=None):
        self.status = REQUEST_STATUS_APPROVED
        self.reviewed_at = timezone.now()
        if manager_user and manager_user.is_authenticated:
            self.reviewed_by = manager_user
        self.save()

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee} time off ({self.status})"


class Shift(models.Model):
    title = models.CharField(max_length=120, default="Shift")
    role = models.ForeignKey(
        Role,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shifts",
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    notes = models.TextField(blank=True)
    is_open = models.BooleanField(default=False)
    schedule_week = models.ForeignKey(
        ScheduleWeek,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shifts",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_time"]

    def clean(self):
        if self.end_time <= self.start_time:
            raise ValidationError("Shift must end after it starts.")

        shift_start_local = timezone.localtime(self.start_time)
        shift_end_local = timezone.localtime(self.end_time)
        if shift_start_local.date() != shift_end_local.date():
            raise ValidationError("Shift must start and end on the same day.")

    def save(self, *args, **kwargs):
        if self.start_time and not self.schedule_week_id:
            shift_start_local = timezone.localtime(self.start_time)
            week_start = shift_start_local.date() - timedelta(
                days=shift_start_local.weekday()
            )
            self.schedule_week, _ = ScheduleWeek.objects.get_or_create(
                week_start=week_start
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} ({self.start_time} to {self.end_time})"


class Assignment(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="assignments",
    )
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name="assignments",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "shift"],
                name="unique_employee_shift_assignment",
            ),
        ]
        ordering = ["shift__start_time", "employee__name"]

    def clean(self):
        conflict = (
            Assignment.objects.filter(employee=self.employee)
            .filter(
                Q(shift__start_time__lt=self.shift.end_time)
                & Q(shift__end_time__gt=self.shift.start_time)
            )
            .select_related("shift__role")
            .exclude(pk=self.pk)
            .first()
        )
        if conflict:
            day_name = timezone.localtime(conflict.shift.start_time).strftime("%A")
            role_name = conflict.shift.role.name if conflict.shift.role_id else "another role"
            raise ValidationError(
                f"{self.employee.name} is already scheduled as {role_name} on {day_name}."
            )

        skip = getattr(self, "_skip_availability_check", False)

        if not skip and self.shift.role_id:
            employee_role_ids = set(self.employee.roles.values_list("id", flat=True))
            if self.employee.primary_role_id:
                employee_role_ids.add(self.employee.primary_role_id)
            if self.shift.role_id not in employee_role_ids:
                role_name = self.shift.role.name if self.shift.role_id else "this role"
                raise ValidationError(f"Employee does not have the required role: {role_name}.")

        if not skip and not self.is_employee_available():
            raise ValidationError("Employee is unavailable during this shift.")

    def is_employee_available(self):
        shift_start_local = timezone.localtime(self.shift.start_time)
        shift_end_local = timezone.localtime(self.shift.end_time)
        shift_date = shift_start_local.date()

        if TimeOffRequest.objects.filter(
            employee=self.employee,
            status=REQUEST_STATUS_APPROVED,
            start_date__lte=shift_date,
            end_date__gte=shift_date,
        ).exists():
            return False

        # Date-specific Availability records take precedence when they cover the shift window.
        # An overlapping UNAVAILABLE window → blocked; AVAILABLE/PREFERRED → allowed.
        # If records exist but none overlap the shift time, fall through to baseline.
        for availability in Availability.objects.filter(employee=self.employee, date=shift_date):
            availability_start = timezone.make_aware(
                datetime.combine(shift_date, availability.start_time),
                shift_start_local.tzinfo,
            )
            availability_end = timezone.make_aware(
                datetime.combine(shift_date, availability.end_time),
                shift_start_local.tzinfo,
            )
            if not (availability_start < shift_end_local and availability_end > shift_start_local):
                continue
            if availability.status == Availability.STATUS_UNAVAILABLE:
                return False
            if availability.status in {Availability.STATUS_AVAILABLE, Availability.STATUS_PREFERRED}:
                return True

        # Fall back to weekly baseline availability.
        return BaselineAvailability.objects.filter(
            employee=self.employee,
            day_of_week=shift_start_local.weekday(),
            is_active=True,
            effective_date__lte=shift_date,
        ).exists()

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee} assigned to {self.shift}"


class ShiftSwapRequest(models.Model):
    TYPE_SWAP = "swap"
    TYPE_GIVEAWAY = "giveaway"
    TYPE_PICKUP = "pickup"

    TYPE_CHOICES = [
        (TYPE_SWAP, "Targeted Swap"),
        (TYPE_GIVEAWAY, "Shift Giveaway"),
        (TYPE_PICKUP, "Open Shift Pickup"),
    ]

    request_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default=TYPE_GIVEAWAY,
    )
    # The shift the requester is offering (swap/giveaway) OR the open shift being claimed (pickup)
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name="swap_requests",
    )
    # For targeted swap: the shift the requester wants in return
    target_shift = models.ForeignKey(
        Shift,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="targeted_swap_requests",
    )
    requester = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="requested_shift_swaps",
    )
    # For targeted swap: the specific employee being asked to trade
    requested_employee = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incoming_shift_swap_requests",
    )
    # The employee who will actually cover (set when someone accepts/claims)
    coverer = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="covered_swap_requests",
    )
    coverer_approved = models.BooleanField(default=False)
    reason = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=REQUEST_STATUS_CHOICES,
        default=REQUEST_STATUS_PENDING,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_shift_swap_requests",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    manager_note = models.TextField(blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        if self.request_type == self.TYPE_SWAP and self.requested_employee_id:
            if self.requester_id == self.requested_employee_id:
                raise ValidationError("Shift swaps require two different employees.")

    def approve(self, manager_user=None):
        self.status = REQUEST_STATUS_APPROVED
        self.reviewed_at = timezone.now()
        if manager_user and manager_user.is_authenticated:
            self.reviewed_by = manager_user
        self.save()

    def apply_approved_swap(self):
        if self.status != REQUEST_STATUS_APPROVED or self.applied_at:
            return

        if self.request_type in (self.TYPE_SWAP, self.TYPE_GIVEAWAY):
            coverer = self.coverer or self.requested_employee
            if not coverer:
                if self.request_type == self.TYPE_GIVEAWAY:
                    Assignment.objects.filter(
                        employee=self.requester, shift=self.shift
                    ).delete()
                    Shift.objects.filter(pk=self.shift_id).update(is_open=True)
                    self.applied_at = timezone.now()
                    type(self).objects.filter(pk=self.pk).update(applied_at=self.applied_at)
                return
            assignment = Assignment.objects.filter(
                employee=self.requester, shift=self.shift
            ).first()
            if not assignment:
                return
            assignment.employee = coverer
            assignment.save()
            if self.request_type == self.TYPE_SWAP and self.target_shift:
                target_assignment = Assignment.objects.filter(
                    employee=coverer, shift=self.target_shift
                ).first()
                if target_assignment:
                    target_assignment.employee = self.requester
                    target_assignment.save()

        elif self.request_type == self.TYPE_PICKUP:
            if not Assignment.objects.filter(employee=self.requester, shift=self.shift).exists():
                Assignment.objects.create(employee=self.requester, shift=self.shift)
            self.shift.is_open = False
            Shift.objects.filter(pk=self.shift_id).update(is_open=False)

        self.applied_at = timezone.now()
        type(self).objects.filter(pk=self.pk).update(applied_at=self.applied_at)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
        self.apply_approved_swap()

    def __str__(self):
        return f"{self.requester} {self.request_type} request for {self.shift} ({self.status})"


class Announcement(models.Model):
    DEPT_ALL = "all"
    DEPT_CHOICES = [
        ("all", "All Departments"),
        ("foh", "Front of House"),
        ("boh", "Back of House"),
        ("management", "Management"),
    ]

    posted_by = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="posted_announcements",
    )
    title = models.CharField(max_length=200)
    body = models.TextField()
    department = models.CharField(max_length=20, choices=DEPT_CHOICES, default=DEPT_ALL)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class AnnouncementRead(models.Model):
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name="reads",
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="announcement_reads",
    )
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["announcement", "employee"],
                name="unique_announcement_read",
            )
        ]


class ClosedDay(models.Model):
    date = models.DateField(unique=True)
    note = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ["date"]

    def __str__(self):
        return str(self.date)
