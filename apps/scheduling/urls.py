from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EmployeeViewSet, ShiftViewSet, AssignmentViewSet, calendar_view, profile_view, announcements_view


router = DefaultRouter()
router.register(r'api/v1/employees', EmployeeViewSet, basename='employee')
router.register(r'api/v1/shifts', ShiftViewSet, basename='shift')
router.register(r'api/v1/assignments', AssignmentViewSet, basename='assignment')

urlpatterns = [
    path('', include(router.urls)),
    path('calendar/', calendar_view, name='calendar'),
    path('profile/', profile_view, name='profile'),
    path('announcements/', announcements_view, name='announcements'),
]