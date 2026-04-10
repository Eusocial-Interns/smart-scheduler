from datetime import datetime

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Employee(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Role(models.Model):
    name = models.CharField(max_length=100, unique=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


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

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_time"]

    def clean(self):
        if self.end_time <= self.start_time:
            raise ValidationError("Shift must end after it starts.")

    def save(self, *args, **kwargs):
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
        overlapping = (
            Assignment.objects.filter(employee=self.employee)
            .filter(
                Q(shift__start_time__lt=self.shift.end_time)
                & Q(shift__end_time__gt=self.shift.start_time)
            )
            .exclude(pk=self.pk)
        )
        if overlapping.exists():
            raise ValidationError("Employee is already assigned to an overlapping shift.")

        if not self.is_employee_available():
            raise ValidationError("Employee is unavailable during this shift.")

    def is_employee_available(self):
        shift_start_local = timezone.localtime(self.shift.start_time)
        shift_end_local = timezone.localtime(self.shift.end_time)
        shift_date = shift_start_local.date()

        relevant_availability = Availability.objects.filter(
            employee=self.employee,
            date=shift_date,
        )

        if not relevant_availability.exists():
            return True

        for availability in relevant_availability:
            availability_start = timezone.make_aware(
                datetime.combine(shift_date, availability.start_time),
                shift_start_local.tzinfo,
            )
            availability_end = timezone.make_aware(
                datetime.combine(shift_date, availability.end_time),
                shift_start_local.tzinfo,
            )

            overlaps = availability_start < shift_end_local and availability_end > shift_start_local
            if not overlaps:
                continue

            if availability.status == Availability.STATUS_UNAVAILABLE:
                return False

            if availability.status in {
                Availability.STATUS_AVAILABLE,
                Availability.STATUS_PREFERRED,
            }:
                return True

        return False

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee} assigned to {self.shift}"
