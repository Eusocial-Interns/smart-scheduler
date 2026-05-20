from django.contrib import admin

from .models import (
    Announcement,
    Assignment,
    Availability,
    AvailabilityChangeRequest,
    BaselineAvailability,
    Employee,
    OperatingHours,
    Role,
    ScheduleWeek,
    Shift,
    ShiftSwapRequest,
    StaffingRequirement,
    TimeOffRequest,
)

admin.site.register(Employee)
admin.site.register(Role)
admin.site.register(Shift)
admin.site.register(Availability)
admin.site.register(Assignment)
admin.site.register(OperatingHours)
admin.site.register(StaffingRequirement)
admin.site.register(ScheduleWeek)
admin.site.register(BaselineAvailability)
admin.site.register(AvailabilityChangeRequest)
admin.site.register(TimeOffRequest)
admin.site.register(ShiftSwapRequest)
admin.site.register(Announcement)
