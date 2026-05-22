
from django.contrib import admin
from django.contrib.auth.views import PasswordResetView
from django.http import JsonResponse
from django.urls import path, include
import logging

logger = logging.getLogger(__name__)


def health_check(request):
    return JsonResponse({"status": "ok"})


class LoggingPasswordResetView(PasswordResetView):
    def form_valid(self, form):
        try:
            return super().form_valid(form)
        except Exception as e:
            logger.error("Password reset email failed: %s", e, exc_info=True)
            raise


urlpatterns = [
    path('health/', health_check),
    path('admin/', admin.site.urls),
    path('accounts/password_reset/', LoggingPasswordResetView.as_view(), name='password_reset'),
    path('accounts/', include('django.contrib.auth.urls')),
    path('', include('apps.scheduling.urls')),
]
