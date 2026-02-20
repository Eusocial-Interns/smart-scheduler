from django.contrib import admin
from django.urls import path
from . import views

appname = 'scheduling'

urlpatterns = [
    path('dashboard/', views.dashboard, name='dashboard'),
]