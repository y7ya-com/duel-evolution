"""Test-only launcher for YOLaucher's run.py: the server's per-message send pauses (Conn.send 0.25 s, post 0.02 s,
gate list 0.03 s) become YO2_TEST_PAUSE seconds (default 0.003), so a fast-forwarded client isn't paced by the server.
Run from tools/yo2emu:  python3.12 <this> 0   (same env vars as run.py; YO2_DUEL_PAUSE as usual)."""
import os, runpy, sys
sys.path.insert(0, os.getcwd())
p = float(os.environ.get("YO2_TEST_PAUSE", "0.003"))
from yo2srv.red import conexion, puerta
conexion.Conn.send.__defaults__ = (b"", p)
conexion.Conn.post.__defaults__ = (b"", min(p, 0.02))
puerta.GATE_PAUSE = min(p, puerta.GATE_PAUSE)
sys.argv = ["run.py", *sys.argv[1:]]
runpy.run_path("run.py", run_name="__main__")
