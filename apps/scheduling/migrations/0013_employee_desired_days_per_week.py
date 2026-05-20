from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0012_backfill_employee_roles"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="desired_days_per_week",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
