
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    EmployeeViewSet,
    ShiftViewSet,
    AvailabilityViewSet,
    OperatingHoursViewSet,
    calendar_view,
    profile_view,
    announcements_view,
    chat_view,
)

# =========================
# API Router
# =========================
router = DefaultRouter()

router.register(r'api/v1/employees', EmployeeViewSet, basename='employee')
router.register(r'api/v1/shifts', ShiftViewSet, basename='shift')
router.register(r'api/v1/availability', AvailabilityViewSet, basename='availability')
router.register(r'api/v1/operating-hours', OperatingHoursViewSet, basename='operating-hours')

# =========================
# URL Patterns
# =========================
urlpatterns = [
    path('', include(router.urls)),

    # frontend views (leave these)
    path('calendar/', calendar_view, name='calendar'),
    path('profile/', profile_view, name='profile'),
    path('announcements/', announcements_view, name='announcements'),
    path('chat/', chat_view, name='chat'),
]