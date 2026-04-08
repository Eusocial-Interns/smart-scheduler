from django.contrib import admin
from .models import Employee, Role, Shift, Availability, Assignment

admin.site.register(Employee)
admin.site.register(Role)
admin.site.register(Shift)
admin.site.register(Availability)
admin.site.register(Assignment)