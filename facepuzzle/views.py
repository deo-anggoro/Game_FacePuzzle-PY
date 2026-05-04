import json
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST, require_GET
from .models import GameSession, Round, Leaderboard


def menu_view(request):
    """Render main menu page."""
    return render(request, 'facepuzzle/menu.html')


def game_view(request):
    """Render game page with config from URL params."""
    context = {
        'mode': request.GET.get('mode', '1p'),
        'rounds': int(request.GET.get('rounds', 3)),
        'player1': request.GET.get('p1', 'Player 1'),
        'player2': request.GET.get('p2', 'Player 2'),
    }
    return render(request, 'facepuzzle/game.html', context)


def leaderboard_view(request):
    """Render leaderboard page."""
    entries = Leaderboard.objects.all()[:20]
    return render(request, 'facepuzzle/leaderboard.html', {'entries': entries})


@csrf_exempt
@require_POST
def api_create_session(request):
    """Create a new game session."""
    data = json.loads(request.body)
    session = GameSession.objects.create(
        player_name_1=data.get('player_name_1', 'Player 1'),
        player_name_2=data.get('player_name_2'),
        player_mode=data.get('player_mode', '1p'),
        source_mode=data.get('source_mode', 'camera'),
        total_rounds=data.get('total_rounds', 3),
    )
    return JsonResponse({'session_id': str(session.session_id)})


@csrf_exempt
@require_POST
def api_save_round(request):
    """Save a completed round result."""
    data = json.loads(request.body)
    session = GameSession.objects.get(session_id=data['session_id'])
    round_obj = Round.objects.create(
        session=session,
        round_number=data['round_number'],
        grid_size=data.get('grid_size', 5),
        time_p1=data.get('time_p1'),
        time_p2=data.get('time_p2'),
        winner=data.get('winner'),
    )
    return JsonResponse({'status': 'ok', 'round_id': round_obj.id})


@csrf_exempt
@require_POST
def api_save_leaderboard(request):
    """Save a leaderboard entry."""
    data = json.loads(request.body)
    entry = Leaderboard.objects.create(
        player_name=data['player_name'],
        mode=data['mode'],
        best_time=data['best_time'],
        rounds_won=data.get('rounds_won', 0),
        total_rounds=data.get('total_rounds', 1),
    )
    return JsonResponse({'status': 'ok', 'id': entry.id})


@require_GET
def api_leaderboard(request):
    """Return top 20 leaderboard entries."""
    entries = Leaderboard.objects.all()[:20]
    data = [{
        'player_name': e.player_name,
        'mode': e.mode,
        'best_time': e.best_time,
        'rounds_won': e.rounds_won,
        'total_rounds': e.total_rounds,
        'created_at': e.created_at.isoformat(),
    } for e in entries]
    return JsonResponse({'leaderboard': data})
