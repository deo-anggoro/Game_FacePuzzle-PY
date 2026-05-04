from django.urls import path
from . import views

app_name = 'facepuzzle'

urlpatterns = [
    # Template views
    path('', views.menu_view, name='menu'),
    path('game/', views.game_view, name='game'),
    path('leaderboard/', views.leaderboard_view, name='leaderboard'),

    # JSON APIs
    path('api/session/create/', views.api_create_session, name='api_create_session'),
    path('api/round/save/', views.api_save_round, name='api_save_round'),
    path('api/leaderboard/', views.api_leaderboard, name='api_leaderboard'),
    path('api/leaderboard/save/', views.api_save_leaderboard, name='api_save_leaderboard'),
]
