from django.urls import include, path
from django.views.generic import RedirectView
from rest_framework.routers import DefaultRouter

from .views import (
    AnnouncementViewSet,
    AssignmentViewSet,
    AvailabilityViewSet,
    AvailabilityChangeRequestViewSet,
    BaselineAvailabilityViewSet,
    ClosedDayViewSet,
    DashboardAPIView,
    PendingCountAPIView,
    EmployeeViewSet,
    OperatingHoursViewSet,
    RoleViewSet,
    ScheduleWeekViewSet,
    ShiftViewSet,
    ShiftSwapRequestViewSet,
    StaffingRequirementViewSet,
    TimeOffRequestViewSet,
    WeeklyScheduleAPIView,
    announcements_view,
    calendar_view,
    chat_view,
    profile_view,
    requests_view,
    team_setup_view,
    weekly_schedule_view,
)

router = DefaultRouter()
router.register(r"api/v1/employees", EmployeeViewSet, basename="employee")
router.register(r"api/v1/roles", RoleViewSet, basename="role")
router.register(r"api/v1/operating-hours", OperatingHoursViewSet, basename="operating-hours")
router.register(
    r"api/v1/staffing-requirements",
    StaffingRequirementViewSet,
    basename="staffing-requirement",
)
router.register(r"api/v1/schedule-weeks", ScheduleWeekViewSet, basename="schedule-week")
router.register(r"api/v1/shifts", ShiftViewSet, basename="shift")
router.register(r"api/v1/assignments", AssignmentViewSet, basename="assignment")
router.register(r"api/v1/availability", AvailabilityViewSet, basename="availability")
router.register(
    r"api/v1/baseline-availability",
    BaselineAvailabilityViewSet,
    basename="baseline-availability",
)
router.register(
    r"api/v1/availability-change-requests",
    AvailabilityChangeRequestViewSet,
    basename="availability-change-request",
)
router.register(r"api/v1/time-off-requests", TimeOffRequestViewSet, basename="time-off-request")
router.register(r"api/v1/shift-swap-requests", ShiftSwapRequestViewSet, basename="shift-swap-request")
router.register(r"api/v1/announcements", AnnouncementViewSet, basename="announcement")
router.register(r"api/v1/closed-days", ClosedDayViewSet, basename="closed-day")

urlpatterns = [
    path("", RedirectView.as_view(pattern_name="calendar", permanent=False)),
    path("", include(router.urls)),
    path("api/v1/schedule/", WeeklyScheduleAPIView.as_view(), name="schedule-week-api"),
    path("api/v1/schedule/week/", WeeklyScheduleAPIView.as_view(), name="schedule-week-api"),
    path("api/v1/dashboard/", DashboardAPIView.as_view(), name="dashboard-api"),
    path("api/v1/pending-count/", PendingCountAPIView.as_view(), name="pending-count-api"),
    path("calendar/", calendar_view, name="calendar"),
    path("weekly-schedule/", weekly_schedule_view, name="weekly_schedule"),
    path("team-setup/", team_setup_view, name="team_setup"),
    path("requests/", requests_view, name="requests"),
    path("profile/", profile_view, name="profile"),
    path("announcements/", announcements_view, name="announcements"),
    path("chat/", chat_view, name="chat"),
]
