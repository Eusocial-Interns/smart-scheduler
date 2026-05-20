from rest_framework import permissions


def employee_profile_for(user):
    if not user or not user.is_authenticated:
        return None
    return getattr(user, "employee_profile", None)


def user_is_manager(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = employee_profile_for(user)
    return bool(profile and profile.is_manager)


class IsManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return user_is_manager(request.user)


class IsAuthenticatedSchedulingUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class IsManagerOrReadOnlySchedulingUser(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return user_is_manager(request.user)
