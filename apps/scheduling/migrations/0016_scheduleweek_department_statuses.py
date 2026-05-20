from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("scheduling", "0015_role_department")]

    operations = [
        migrations.AddField(
            model_name="scheduleweek",
            name="department_statuses",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
