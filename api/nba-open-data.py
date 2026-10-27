"""NBA.com statistical adapter for Momentum Radar; research data, never sportsbook odds."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone
import json
import os

def payload(query):
    from nba_api.live.nba.endpoints import scoreboard
    from nba_api.stats.static import players, teams
    action = query.get("action", ["scoreboard"])[0]
    if action == "health":
        return {"ok": True, "source": "nba_api", "mode": "ready", "checkedAt": datetime.now(timezone.utc).isoformat()}
    if action == "players":
        name = query.get("name", [""])[0].strip()
        if not name or len(name) > 80:
            raise ValueError("A player name (1-80 characters) is required")
        return {"ok": True, "source": "nba_api", "players": players.find_players_by_full_name(name)[:20]}
    if action == "teams":
        return {"ok": True, "source": "nba_api", "teams": teams.get_teams()}
    if action == "scoreboard":
        games = scoreboard.ScoreBoard().games.get_dict()
        return {"ok": True, "source": "nba_api", "asOf": datetime.now(timezone.utc).isoformat(), "games": games, "sportsbookVerified": False}
    if action == "boxscore":
        from nba_api.live.nba.endpoints import boxscore
        game_id = query.get("gameId", [""])[0].strip()
        if not (game_id.isdigit() and len(game_id) == 10):
            raise ValueError("Valid 10-digit NBA gameId is required")
        game = boxscore.BoxScore(game_id=game_id).game.get_dict()
        return {"ok": True, "source": "nba_api_live", "gameId": game_id,
                "asOf": datetime.now(timezone.utc).isoformat(),
                "game": game, "sportsbookVerified": False}
    if action == "player-name-log":
        from nba_api.stats.endpoints import playergamelog
        name = query.get("name", [""])[0].strip()
        season = query.get("season", [""])[0]
        if not name or len(name) > 80 or not (len(season) == 7 and season[4] == "-" and season[:4].isdigit() and season[5:].isdigit()):
            raise ValueError("Valid name and YYYY-YY season required")
        matches = [p for p in players.find_players_by_full_name(name) if p.get("full_name", "").casefold() == name.casefold()]
        if len(matches) != 1:
            return {"ok": False, "error": "ambiguous_or_unknown_player", "matches": len(matches)}
        pid = matches[0]["id"]
        try:
            result = playergamelog.PlayerGameLog(player_id=pid, season=season, timeout=8)
            rows = result.player_game_log.get_data_frame().head(10).to_dict(orient="records")
        except Exception:
            return {"ok": False, "source": "nba_api", "error": "nba_stats_upstream_unavailable", "playerId": pid, "name": name, "season": season, "recentGames": [], "sportsbookVerified": False}
        return {"ok": True, "source": "nba_api", "playerId": pid, "name": name, "season": season, "recentGames": rows, "sportsbookVerified": False}
    if action == "player-log":
        from nba_api.stats.endpoints import playergamelog
        pid = query.get("playerId", [""])[0]
        season = query.get("season", [""])[0]
        if not pid.isdigit() or len(pid) > 10:
            raise ValueError("Valid playerId is required")
        if not (len(season) == 7 and season[4] == "-" and season[:4].isdigit() and season[5:].isdigit()):
            raise ValueError("Season must be YYYY-YY")
        try:
            result = playergamelog.PlayerGameLog(player_id=int(pid), season=season, timeout=8)
            rows = result.player_game_log.get_data_frame().head(10).to_dict(orient="records")
        except Exception:
            return {"ok": False, "source": "nba_api", "error": "nba_stats_upstream_unavailable", "playerId": pid, "season": season, "recentGames": [], "sportsbookVerified": False}
        return {"ok": True, "source": "nba_api", "playerId": pid, "season": season, "recentGames": rows, "sportsbookVerified": False}
    raise ValueError("Unknown action")

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        try:
            data = payload(query)
            status = 200
        except ValueError as exc:
            data, status = {"ok": False, "error": str(exc)}, 400
        except Exception:
            data, status = {"ok": False, "source": "nba_api", "error": "NBA.com source temporarily unavailable; preserve existing data source."}, 503
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "s-maxage=60, stale-while-revalidate=120" if status == 200 else "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)
