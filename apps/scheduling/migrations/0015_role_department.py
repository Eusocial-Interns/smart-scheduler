from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0014_closedday"),
    ]

    operations = [
        migrations.AddField(
            model_name="role",
            name="department",
            field=models.CharField(
                choices=[
                    ("foh", "Front of House"),
                    ("boh", "Back of House"),
                    ("management", "Management"),
                ],
                default="foh",
                max_length=20,
            ),
        ),
    ]
