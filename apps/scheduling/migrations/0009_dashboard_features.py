import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scheduling', '0008_alter_staffingrequirement_end_time'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='shift',
            name='is_open',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='shiftswaprequest',
            name='request_type',
            field=models.CharField(
                choices=[
                    ('swap', 'Targeted Swap'),
                    ('giveaway', 'Shift Giveaway'),
                    ('pickup', 'Open Shift Pickup'),
                ],
                default='giveaway',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='shiftswaprequest',
            name='target_shift',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='targeted_swap_requests',
                to='scheduling.shift',
            ),
        ),
        migrations.AddField(
            model_name='shiftswaprequest',
            name='coverer',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='covered_swap_requests',
                to='scheduling.employee',
            ),
        ),
        migrations.AddField(
            model_name='shiftswaprequest',
            name='coverer_approved',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='shiftswaprequest',
            name='requested_employee',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='incoming_shift_swap_requests',
                to='scheduling.employee',
            ),
        ),
        migrations.CreateModel(
            name='Announcement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('body', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('posted_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='posted_announcements',
                    to='scheduling.employee',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
