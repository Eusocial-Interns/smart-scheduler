from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0013_employee_desired_days_per_week"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClosedDay",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(unique=True)),
                ("note", models.CharField(blank=True, default="", max_length=255)),
            ],
            options={
                "ordering": ["date"],
            },
        ),
    ]
