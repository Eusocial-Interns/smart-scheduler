
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    EmployeeViewSet,
    ShiftViewSet,
    AvailabilityViewSet,
    OperatingHoursViewSet,
    ScheduleNoteViewSet,
    weekly_schedule_view,
)
# =========================
# API Router
# =========================
router = DefaultRouter()

router.register(r'api/v1/employees', EmployeeViewSet, basename='employee')
router.register(r'api/v1/shifts', ShiftViewSet, basename='shift')
router.register(r'api/v1/availability', AvailabilityViewSet, basename='availability')
router.register(r'api/v1/operating-hours', OperatingHoursViewSet, basename='operating-hours')
router.register(r'api/v1/schedule-notes', ScheduleNoteViewSet, basename='schedule-note')
# =========================
# URL Patterns
# =========================
urlpatterns = [
    path('', include(router.urls)),
    path('api/v1/weekly-schedule/', weekly_schedule_view),

]
  