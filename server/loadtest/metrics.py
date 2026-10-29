"""Per-minute Durable Object CPU and WebSocket messages (one namespace: the load server's WorldDO, or the driver's
LoadDOs summed) and D1 query time, between two UTC times (README.md). Credentials from the environment
(CLOUDFLARE_API_TOKEN, or CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL); ids from the dashboard or the namespaces API.
  python3.12 -I loadtest/metrics.py <since ISO> <until ISO> <DO namespace id> [d1 database id]
"""
import json
import os
import sys
import urllib.request

since, until = sys.argv[1], sys.argv[2]
ns = sys.argv[3]
db = sys.argv[4] if len(sys.argv) > 4 else None
acct = os.environ["CLOUDFLARE_ACCOUNT_ID"]
h = {"Content-Type": "application/json"}
if os.environ.get("CLOUDFLARE_API_TOKEN"):
    h["Authorization"] = "Bearer " + os.environ["CLOUDFLARE_API_TOKEN"]
else:
    h["X-Auth-Key"], h["X-Auth-Email"] = os.environ["CLOUDFLARE_API_KEY"], os.environ["CLOUDFLARE_EMAIL"]
q = """query($a: String!, $s: Time!, $u: Time!, $n: String!, $db: String) { viewer { accounts(filter: {accountTag: $a}) {
  dos: durableObjectsPeriodicGroups(limit: 1000, filter: {datetimeMinute_geq: $s, datetimeMinute_leq: $u, namespaceId: $n},
       orderBy: [datetimeMinute_ASC]) {
    dimensions { datetimeMinute }
    sum { cpuTime activeTime inboundWebsocketMsgCount outboundWebsocketMsgCount subrequests }
    max { activeWebsocketConnections } }
  d1: d1AnalyticsAdaptiveGroups(limit: 1000, filter: {datetimeMinute_geq: $s, datetimeMinute_leq: $u, databaseId: $db},
      orderBy: [datetimeMinute_ASC]) {
    dimensions { datetimeMinute }
    sum { readQueries writeQueries rowsWritten }
    quantiles { queryBatchTimeMsP50 queryBatchTimeMsP90 } } } } }"""
req = urllib.request.Request("https://api.cloudflare.com/client/v4/graphql", method="POST", headers=h,
                             data=json.dumps({"query": q, "variables": {"a": acct, "s": since, "u": until, "n": ns, "db": db}}).encode())
with urllib.request.urlopen(req, timeout=60) as r:
    out = json.load(r)
if out.get("errors"):
    print(json.dumps(out["errors"], indent=1))
acc = (out.get("data") or {}).get("viewer", {}).get("accounts", [{}])[0]
print("minute            cpu ms/s  active  ws in/s  ws out/s  conns")
for g in acc.get("dos") or []:
    s, m = g["sum"], g["max"]
    print(f"{g['dimensions']['datetimeMinute'][11:16]}  {s['cpuTime'] / 1000 / 60:12.0f}  {s['activeTime'] / 1e6:6.0f}  "
          f"{s['inboundWebsocketMsgCount'] / 60:7.1f}  {s['outboundWebsocketMsgCount'] / 60:8.1f}  {m['activeWebsocketConnections']:5}")
if db:
    print("minute   reads  writes  rows written  batch ms p50  p90")
    for g in acc.get("d1") or []:
        s, qq = g["sum"], g["quantiles"]
        print(f"{g['dimensions']['datetimeMinute'][11:16]}  {s['readQueries']:6} {s['writeQueries']:6} {s['rowsWritten']:8}  "
              f"{qq['queryBatchTimeMsP50']:10.1f} {qq['queryBatchTimeMsP90']:6.1f}")
