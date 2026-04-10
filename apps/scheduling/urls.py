from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AssignmentViewSet,
    AvailabilityViewSet,
    EmployeeViewSet,
    RoleViewSet,
    ShiftViewSet,
    announcements_view,
    calendar_view,
    chat_view,
    profile_view,
)

router = DefaultRouter()
router.register(r"api/v1/employees", EmployeeViewSet, basename="employee")
router.register(r"api/v1/roles", RoleViewSet, basename="role")
router.register(r"api/v1/shifts", ShiftViewSet, basename="shift")
router.register(r"api/v1/assignments", AssignmentViewSet, basename="assignment")
router.register(r"api/v1/availability", AvailabilityViewSet, basename="availability")

urlpatterns = [
    path("", include(router.urls)),
    path("calendar/", calendar_view, name="calendar"),
    path("profile/", profile_view, name="profile"),
    path("announcements/", announcements_view, name="announcements"),
    path("chat/", chat_view, name="chat"),
]
