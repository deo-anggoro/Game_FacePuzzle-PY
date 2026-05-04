import uuid
from django.db import models


class GameSession(models.Model):
    """Tracks a full game session."""
    PLAYER_MODE_CHOICES = [
        ('1p', 'Single Player'),
        ('2p', 'Two Players'),
    ]
    SOURCE_MODE_CHOICES = [
        ('camera', 'Face Record'),
        ('form', 'System Images'),
    ]

    session_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player_name_1 = models.CharField(max_length=50)
    player_name_2 = models.CharField(max_length=50, blank=True, null=True)
    player_mode = models.CharField(max_length=2, choices=PLAYER_MODE_CHOICES)
    source_mode = models.CharField(max_length=10, choices=SOURCE_MODE_CHOICES, default='camera')
    total_rounds = models.IntegerField(default=3)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Session {self.session_id} ({self.player_mode})"


class Round(models.Model):
    """Per-round results within a session."""
    session = models.ForeignKey(GameSession, on_delete=models.CASCADE, related_name='rounds')
    round_number = models.IntegerField()
    grid_size = models.IntegerField(default=5)
    time_p1 = models.FloatField(null=True, blank=True)
    time_p2 = models.FloatField(null=True, blank=True)
    winner = models.CharField(max_length=10, blank=True, null=True)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['round_number']
        unique_together = ['session', 'round_number']

    def __str__(self):
        return f"Round {self.round_number} of {self.session.session_id}"


class Leaderboard(models.Model):
    """High scores."""
    player_name = models.CharField(max_length=50)
    mode = models.CharField(max_length=2)
    best_time = models.FloatField()
    rounds_won = models.IntegerField(default=0)
    total_rounds = models.IntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['best_time']

    def __str__(self):
        return f"{self.player_name} - {self.best_time}s"
