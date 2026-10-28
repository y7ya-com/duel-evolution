# src/Sound differential cases: the WinSock layer (globals injected by run.py: case, Emu, EmuError, random, struct).
# The exe imports WSOCK32 by ordinal ("#19"), the rewrite DLL by name ("send"): every handler is registered under both.
import random  # noqa: F401
import struct  # noqa: F401

from core import Emu, EmuError, case  # noqa: F401
WSAEWOULDBLOCK = 10035
WSOCK = {"send": 19, "WSAGetLastError": 111, "WSAStartup": 115, "socket": 23, "inet_addr": 10, "gethostbyname": 52,
         "htons": 9, "connect": 4}


def sock_import(e, name, fn, nargs):
    for n in (name, f"#{WSOCK[name]}"):
        e.on_import(n, fn, nargs=nargs, stdcall=True)


def last_error(e):
    sock_import(e, "WSAGetLastError", lambda e: e.state.get("err", 0), 0)


@case(0x68A530, params=[([], 0), ([], 5), ([2, 2, 1], 5), (["block", 3, "block", "block", 2], 5), ([2, "reset"], 5),
                        (["reset"], 1), ([], -3), ([1] * 40, 40)])
def send_all(e, f, param):
    script, n = param
    st = list(script)
    buf = e.alloc(bytes(range(max(n, 1))))

    def send(e, s, b, k, flags):
        act = st.pop(0) if st else k
        if act in ("block", "reset"):
            e.state["err"] = WSAEWOULDBLOCK if act == "block" else 10054
            e.trace.append(("send", s, k, act))
            return 0xFFFFFFFF
        act = min(act, k)
        e.trace.append(("send", s, k, e.read(b, act).hex(), flags))
        return act
    sock_import(e, "send", send, 4)
    last_error(e)
    return f(77, buf, n)


@case(0x68B3E0, params=[(0, 0x101), (10091, 0x101), (0, 0x202), (0, 0x100)])
def net_startup(e, f, param):
    rc, version = param

    def startup(e, want, data):
        e.trace.append(("WSAStartup", want))
        e.write(data, struct.pack("<HH", version, 0x202))
        return rc

    def set_key(e, key, n):
        e.trace.append(("ygSetCipherKey", e.read(key, n).hex(), n))
    sock_import(e, "WSAStartup", startup, 2)
    e.on_addr(0x68B180, set_key, 2)   # the exe's cipher: its Blowfish global isn't constructed in the emulator
    return f()


def connect_env(e, script):
    """script: sock, inet_addr result, gethostbyname ok?, connect result"""
    sock, addr, he_ok, conn_rc = script

    def socket(e, af, typ, proto):
        e.trace.append(("socket", af, typ, proto))
        e.state["err"] = 10024
        return sock

    def inet_addr(e, p):
        e.trace.append(("inet_addr", e.read(p, 16).split(b"\0")[0]))
        return addr

    def gethostbyname(e, p):
        e.trace.append(("gethostbyname", e.read(p, 16).split(b"\0")[0]))
        e.state["err"] = 11001
        if not he_ok:
            return 0
        a = e.alloc(struct.pack("<I", 0x0A00A8C0))
        lst = e.alloc(struct.pack("<II", a, 0))
        return e.alloc(struct.pack("<IIhhI", 0, 0, 2, 4, lst))

    def htons(e, v):
        return ((v & 0xFF) << 8) | ((v >> 8) & 0xFF)

    def connect(e, s, sa, n):
        e.trace.append(("connect", s, e.read(sa, n).hex(), n))
        e.state["err"] = 10061
        return conn_rc
    sock_import(e, "socket", socket, 3)
    sock_import(e, "inet_addr", inet_addr, 1)
    sock_import(e, "gethostbyname", gethostbyname, 1)
    sock_import(e, "htons", htons, 1)
    sock_import(e, "connect", connect, 3)
    last_error(e)


CONNECT = [(b"127.0.0.1", (5, 0x0100007F, 0, 0)), (b"127.0.0.1", (0xFFFFFFFF, 0, 0, 0)),
           (b"yo2.example", (6, 0xFFFFFFFF, 1, 0)), (b"yo2.example", (6, 0xFFFFFFFF, 0, 0)),
           (b"10.0.0.2", (7, 0x0200000A, 0, 0xFFFFFFFF))]


@case(0x68B6C0, params=CONNECT)
def connect_blocking(e, f, param):
    host, script = param
    connect_env(e, script)
    c = e.alloc(random.Random(len(host)).randbytes(0x18))
    r = f(e.alloc(host + b"\0"), 0x1662 | 0xABCD0000, c)   # only the low 16 bits are the port
    return r, e.read(c, 0x18).hex()


@case(0x68B7E0, conv="stdcall", params=[("host", 1), ("null-host", 1), ("null-conn", 1), ("host", 0)])
def connect_start(e, f, param):
    which, ok = param
    calls = {"n": 0}

    def malloc(e, n):
        calls["n"] += 1
        return e.malloc(n) if ok or calls["n"] == 1 else 0

    def strlen(e, s):
        n = 0
        while e.read(s + n, 1) != b"\0":
            n += 1
        return n

    def strcpy(e, d, s):
        e.write(d, e.read(s, strlen(e, s) + 1))
        return d

    def begin_thread(e, proc, stack, arg):
        host, port, conn, notify = struct.unpack("<IHxxII", e.read(arg, 16))
        e.trace.append(("beginthread", stack, e.read(host, 16).split(b"\0")[0], port, conn, notify))
        return 1
    e.on_addr(0xB0CDCF, malloc, 1)          # the exe's CRT malloc
    e.on_addr(0xB0AC72, begin_thread, 3)    # the exe's CRT _beginthread
    e.on_import("malloc", malloc, 1, stdcall=False)
    e.on_import("strcpy", strcpy, 2, stdcall=False)
    e.on_import("_beginthread", begin_thread, 3, stdcall=False)
    host = 0 if which == "null-host" else e.alloc(b"gate.example\0")
    conn = 0 if which == "null-conn" else e.alloc(0x18)
    return f(host, 0x1662, conn, 0x5678)
