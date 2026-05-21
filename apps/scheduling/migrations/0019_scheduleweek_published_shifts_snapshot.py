from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0018_scheduleweek_has_unpublished_changes"),
    ]

    operations = [
        migrations.AddField(
            model_name="scheduleweek",
            name="published_shifts_snapshot",
            field=models.JSONField(blank=True, null=True),
        ),
    ]
