"""CHttpDownload / CDownloadTask (src/Net/NetDownload.cpp) against YOLaucher's own HTTP server (yo2srv.red.http.Http,
serving tools/yo2emu/www: the patcher's yo2/merge.txt and yo2/root.txt). The download thread is held by the test
driver and run on "call dl.run", so every state is seen in order.
Run: python3.12 -I tests/net_test_download.py
"""
import http.server
import os
import sys
import tempfile
import threading
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net_test as T  # noqa: E402
from net_test import EMU, kv  # noqa: E402
from yo2srv.red import http as yo2http  # noqa: E402

WWW = os.path.join(EMU, "www")


def serve():
    yo2http.setup(types.SimpleNamespace(WWW=WWW, log=lambda *a: None))
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), yo2http.Http)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, f"http://127.0.0.1:{s.server_address[1]}"


def frame(live):
    out = live("call dl.frame")
    return kv(next(l for l in out if l.startswith("dl "))), out


def check(exe):
    server, base = serve()
    merge = open(os.path.join(WWW, "yo2", "merge.txt"), "rb").read()

    # into memory: start -> running (the thread hasn't run) -> run -> done + CTmDownloaded to itself, once
    live = T.Live(exe)
    assert live("call dl.spawn")[0] == "dl spawned CDownloadTask"
    assert live(f"call dl.get={base}/yo2/merge.txt")[0] == "start 0"
    st, _ = frame(live)
    assert (st["state"], st["done"], st["thread"]) == ("1", "0", "119"), st
    assert live(f"call dl.get={base}/yo2/root.txt")[0] == "start -1"     # one at a time
    live("call dl.readlimit=100")                                          # several reads
    out = live("call dl.run")
    assert f"http open {base}/yo2/merge.txt status=200 length={len(merge)}" in out and "http close" in out, out
    st, out = frame(live)
    assert (st["state"], st["done"], st["got"], st["size"]) == ("2", "1", str(len(merge)), str(len(merge))), st
    assert "msg 19 self=1" in out, out
    assert live("call dl.body")[0] == "body " + (merge + b"\0").hex()
    _, out = frame(live)
    assert "msg 19 self=1" not in out                                      # only once
    live("call dl.destroy")

    # into a file; then a 404 (not 200: failed, no file); then cancelled before the first read (error box, file gone)
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "merge.txt")
        live("call dl.spawn")
        assert live(f"call dl.file={base}/yo2/merge.txt,{path}")[0] == "start 0"
        live("call dl.run")
        st, _ = frame(live)
        assert (st["state"], st["done"], st["got"], st["tofile"]) == ("2", "1", str(len(merge)), "1"), st
        assert open(path, "rb").read() == merge
        live("call dl.destroy")

        live("call dl.spawn")
        miss = os.path.join(tmp, "nope.txt")
        live(f"call dl.file={base}/yo2/nope.txt,{miss}")
        out = live("call dl.run")
        assert f"http open {base}/yo2/nope.txt status=404" in " ".join(out), out
        st, _ = frame(live)
        assert (st["state"], st["done"]) == ("3", "1") and not os.path.exists(miss), st
        live("call dl.destroy")

        live("call dl.spawn")
        live(f"call dl.file={base}/yo2/merge.txt,{path}")
        live("call dl.cancel")
        out = live("call dl.run")
        assert "messagebox Error" in out, out
        st, _ = frame(live)
        assert (st["state"], st["done"]) == ("3", "1") and not os.path.exists(path), st
        live("call dl.destroy")

    # the thread doesn't start: -1, still idle
    live("call dl.spawn")
    live("call dl.threadfail=1")
    assert live(f"call dl.get={base}/yo2/root.txt")[0] == "start -1"
    st, _ = frame(live)
    assert (st["state"], st["done"], st["thread"]) == ("0", "0", "-1"), st
    live("call dl.threadfail=0")

    # FUN_0069f820: strictly more free than asked
    live("call dl.diskfree=5000000000")
    assert live("call dl.hasfree=4999999999")[0] == "hasfree 1"
    assert live("call dl.hasfree=5000000000")[0] == "hasfree 0"
    live.close()
    server.shutdown()
    print("ok: CHttpDownload / CDownloadTask against yo2srv.red.http (www/yo2/merge.txt): memory, file, 404, "
          "cancel, busy, thread failure; disk-space check")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        check(T.compile_cli(tmp))


if __name__ == "__main__":
    main()
