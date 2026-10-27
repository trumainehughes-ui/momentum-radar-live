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
    if action == "player-log":
        from nba_api.stats.endpoints import playergamelog
        pid = query.get("playerId", [""])[0]
        season = query.get("season", [""])[0]
        if not pid.isdigit() or len(pid) > 10:
            raise ValueError("Valid playerId is required")
        if not (len(season) == 7 and season[4] == "-" and season[:4].isdigit() and season[5:].isdigit()):
            raise ValueError("Season must be YYYY-YY")
        result = playergamelog.PlayerGameLog(player_id=int(pid), season=season, timeout=12)
        rows = result.player_game_log.get_data_frame().head(10).to_dict(orient="records")
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
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)
