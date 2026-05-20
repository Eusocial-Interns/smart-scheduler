from django.db import migrations


def copy_primary_role_to_roles(apps, schema_editor):
    Employee = apps.get_model("scheduling", "Employee")
    for employee in Employee.objects.filter(primary_role__isnull=False):
        employee.roles.add(employee.primary_role)


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0011_add_employee_roles_m2m"),
    ]

    operations = [
        migrations.RunPython(copy_primary_role_to_roles, migrations.RunPython.noop),
    ]
