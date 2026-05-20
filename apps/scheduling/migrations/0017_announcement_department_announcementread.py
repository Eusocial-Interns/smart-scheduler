from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("scheduling", "0016_scheduleweek_department_statuses")]

    operations = [
        migrations.AddField(
            model_name="announcement",
            name="department",
            field=models.CharField(
                choices=[
                    ("all", "All Departments"),
                    ("foh", "Front of House"),
                    ("boh", "Back of House"),
                    ("management", "Management"),
                ],
                default="all",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="AnnouncementRead",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("read_at", models.DateTimeField(auto_now_add=True)),
                (
                    "announcement",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reads",
                        to="scheduling.announcement",
                    ),
                ),
                (
                    "employee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="announcement_reads",
                        to="scheduling.employee",
                    ),
                ),
            ],
            options={"constraints": [
                models.UniqueConstraint(fields=["announcement", "employee"], name="unique_announcement_read")
            ]},
        ),
    ]
