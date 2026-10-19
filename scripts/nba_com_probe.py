"""Read-only, bounded NBA.com connectivity probe for Momentum Radar.

No writes, bulk extraction, or production dependency. Requires NBA.com usage approval
before scheduling automated collection or commercial redistribution.
"""
import argparse
import json
from datetime import datetime, timezone

from nba_api.live.nba.endpoints import scoreboard


def probe():
    checked_at = datetime.now(timezone.utc).isoformat()
    try:
        data = scoreboard.ScoreBoard(timeout=12).get_dict()
        games = data.get("scoreboard", {}).get("games")
        if not isinstance(games, list):
            raise ValueError("NBA live scoreboard missing games array")
        return {
            "ok": True,
            "source": "nba_api.live.nba.endpoints.scoreboard",
            "checkedAt": checked_at,
            "gameCount": len(games),
            "sampleGameIds": [
                str(g["gameId"]) for g in games[:3] if isinstance(g, dict) and g.get("gameId")
            ],
            "productionReady": False,
            "note": "Connectivity only; NBA.com stats endpoints, permissions and data parity not validated.",
        }
    except Exception as exc:
        return {
            "ok": False,
            "source": "nba_api.live.nba.endpoints.scoreboard",
            "checkedAt": checked_at,
            "errorType": type(exc).__name__,
            "productionReady": False,
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true", required=True)
    parser.parse_args()
    result = probe()
    print(json.dumps(result, separators=(",", ":")))
    raise SystemExit(0 if result["ok"] else 1)
