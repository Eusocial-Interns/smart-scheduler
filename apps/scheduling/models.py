
from django.db import models
from django.core.exceptions import ValidationError
from django.db.models import Q


class Employee(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Role(models.Model):
    name = models.CharField(max_length=100)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Availability(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="availabilities")
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()

    STATUS_CHOICES = [
        ("available", "Available"),
        ("unavailable", "Unavailable"),
        ("preferred", "Preferred"),
    ]

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="available")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.employee} - {self.date} ({self.start_time} to {self.end_time})"


class Shift(models.Model):
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.start_time and self.end_time:
            if self.end_time <= self.start_time:
                raise ValidationError("Shift cannot end before it starts")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.start_time} → {self.end_time}"


class Assignment(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    shift = models.ForeignKey(Shift, on_delete=models.CASCADE)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.shift.start_time and self.shift.end_time:
            overlapping = Assignment.objects.filter(
                employee=self.employee
            ).filter(
                Q(shift__start_time__lt=self.shift.end_time) &
                Q(shift__end_time__gt=self.shift.start_time)
            ).exclude(id=self.id)

            if overlapping.exists():
                raise ValidationError("Employee already assigned to overlapping shift")

        if self.shift.start_time:
            unavailable = Availability.objects.filter(
                employee=self.employee,
                date=self.shift.start_time.date(),
                status="unavailable"
            ).exists()

            if unavailable:
                raise ValidationError("Employee is unavailable for this shift")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee} → {self.shift}"