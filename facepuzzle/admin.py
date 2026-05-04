from django.contrib import admin
from .models import GameSession, Round, Leaderboard


@admin.register(GameSession)
class GameSessionAdmin(admin.ModelAdmin):
    list_display = ('session_id', 'player_name_1', 'player_mode', 'total_rounds', 'created_at')
    list_filter = ('player_mode',)


@admin.register(Round)
class RoundAdmin(admin.ModelAdmin):
    list_display = ('session', 'round_number', 'grid_size', 'time_p1', 'time_p2', 'winner')
    list_filter = ('grid_size',)


@admin.register(Leaderboard)
class LeaderboardAdmin(admin.ModelAdmin):
    list_display = ('player_name', 'mode', 'best_time', 'rounds_won', 'created_at')
    list_filter = ('mode',)
