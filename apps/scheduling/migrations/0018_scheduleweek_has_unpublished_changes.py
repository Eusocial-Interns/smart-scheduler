from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0017_announcement_department_announcementread"),
    ]

    operations = [
        migrations.AddField(
            model_name="scheduleweek",
            name="has_unpublished_changes",
            field=models.BooleanField(default=False),
        ),
    ]
