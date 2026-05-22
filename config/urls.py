
from django.contrib import admin
from django.contrib.auth.views import (
    PasswordResetView,
    PasswordResetDoneView,
    PasswordResetConfirmView,
    PasswordResetCompleteView,
)
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import path, include
import logging

logger = logging.getLogger(__name__)


def health_check(request):
    return JsonResponse({"status": "ok"})


class LoggingPasswordResetView(PasswordResetView):
    def form_valid(self, form):
        self.request.session['password_reset_requested'] = True
        try:
            return super().form_valid(form)
        except Exception as e:
            logger.error("Password reset email failed: %s", e, exc_info=True)
            return redirect(self.get_success_url())


class ProtectedPasswordResetDoneView(PasswordResetDoneView):
    def get(self, request, *args, **kwargs):
        if not request.session.pop('password_reset_requested', False):
            return redirect('login')
        return super().get(request, *args, **kwargs)


class ProtectedPasswordResetConfirmView(PasswordResetConfirmView):
    def form_valid(self, form):
        self.request.session['password_reset_complete'] = True
        return super().form_valid(form)


class ProtectedPasswordResetCompleteView(PasswordResetCompleteView):
    def get(self, request, *args, **kwargs):
        if not request.session.pop('password_reset_complete', False):
            return redirect('login')
        return super().get(request, *args, **kwargs)


urlpatterns = [
    path('health/', health_check),
    path('admin/', admin.site.urls),
    path('accounts/password_reset/', LoggingPasswordResetView.as_view(), name='password_reset'),
    path('accounts/password_reset/done/', ProtectedPasswordResetDoneView.as_view(), name='password_reset_done'),
    path('accounts/reset/<uidb64>/<token>/', ProtectedPasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('accounts/reset/done/', ProtectedPasswordResetCompleteView.as_view(), name='password_reset_complete'),
    path('accounts/', include('django.contrib.auth.urls')),
    path('', include('apps.scheduling.urls')),
]
