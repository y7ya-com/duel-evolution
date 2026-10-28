// The new server's sign-in, in the game's own UI (the page's web/lazyfs.js asks <http>/api/de/session at boot):
//  - signed in (YO2_SESSION_NAME): the new server binds the game's WebSocket to the site's session cookie and ignores
//    the 0x3003 credentials, so the player never sees the 2008 login dialog. YO2_SESSION_PASS (default "-") is only
//    for a native test against the legacy run.py, which checks them;
//  - signed out (YO2_DISCORD_URL): the 2008 login dialog is rearranged into Duel Evolution's sign-in panel, built from
//    this game's own widgets (see Panel below): Discord, then name + password, create account (verified by a code run
//    as /verify in Discord), reset password (a code from /reset in Discord). Every request goes to the site first
//    (<YO2_DE_HTTP>/api/...), before the scene opens a socket, so all of them are bound to the session;
//  - back from Discord (YO2_AUTO_ONLINE): the patcher goes straight to the login scene instead of the title.
// ONLINE still opens the login scene (CLoginScene, vtable 0xbede6c); in its state 2 (the dialog waiting) the two input
// boxes of its CWindowLogin (+0x434 user ID, +0x440 password: CWindowTaskInput, vtable 0xbe812c) get the text, the
// window is hidden and its result (+0x3b0, read through vtable slot 0x60) becomes OK (0xfa2). The scene then runs its
// own OK path: the Save boxes, the gate list, CNetAccountTask::login -> 0x3003, the player list, Select Player.
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

extern "C" {
#include "win.h"
}
#include "ui_kit.h"

extern "C" int rc_readable(uint32_t a);   // mem.c: inside the image or an allocated granule
extern "C" int rc_online_pressed;   // rt.c: ONLINE was pressed (emit.py IMM_HOOKS at 0x7fa658); answered once per press
extern "C" uint32_t rc_first_scene;   // rt.c: the patcher's next scene (emit.py IMM_HOOKS at 0x6deebc)

namespace {
const char* session_name() {
    const char* n = getenv("YO2_SESSION_NAME");
    return n && *n ? n : nullptr;
}

int any(uint32_t) { return 1; }

#ifdef __EMSCRIPTEN__
// Synchronous same-origin JSON POST (the browser adds Origin and the cookie): the status, the body into out.
EM_JS(int, de_post, (const char* url, const char* json, char* out, int nout), {
    const x = new XMLHttpRequest();
    x.open("POST", UTF8ToString(url), false);
    x.setRequestHeader("Content-Type", "application/json");
    try { x.send(UTF8ToString(json)); } catch (e) { return 0; }
    stringToUTF8(x.responseText || "", out, nout);
    return x.status;
});
#endif


// The site's JSON endpoints (same origin): the status and the body. Natively there is no HTTP: YO2_STUB_SIGNIN,
// YO2_STUB_REGISTER and YO2_STUB_RESET give the statuses, comma-separated and used in turn (default 200), for headless
// tests of every branch.
int de_call(const char* path, const std::string& json, std::string& body) {
#ifdef __EMSCRIPTEN__
    const char* base = getenv("YO2_DE_HTTP");
    std::string url = std::string(base ? base : "") + path;
    static char out[2048];
    int st = de_post(url.c_str(), json.c_str(), out, sizeof out);
    body = out;
#else
    static const char* const KEY[] = {"YO2_STUB_SIGNIN", "YO2_STUB_REGISTER", "YO2_STUB_RESET"};
    static std::string left[3];
    static bool read[3];
    int k = strstr(path, "register") ? 1 : strstr(path, "reset") ? 2 : 0;
    if (!read[k]) read[k] = true, left[k] = getenv(KEY[k]) ? getenv(KEY[k]) : "";
    int st = left[k].empty() ? 200 : atoi(left[k].c_str());
    size_t c = left[k].find(',');
    left[k] = c == std::string::npos ? "" : left[k].substr(c + 1);
    body = st == 200 && k == 1   ? "{\"ok\":true,\"code\":\"AB12CD\",\"inviteUrl\":\"https://discord.gg/test\"}"
           : st == 403           ? "{\"code\":\"EMAIL_NOT_VERIFIED\"}"
           : st == 400 && k == 2 ? "{\"code\":\"BAD_CODE\"}"
           : st == 400           ? "{\"code\":\"BAD_NAME\",\"message\":\"Names are 3-16 characters.\"}"
                                 : "{}";
#endif
    rc_log("session: %s -> %d", path, st);
    return st;
}

// A string field of a flat JSON object ("" when absent).
std::string field(const std::string& json, const char* key) {
    std::string k = std::string("\"") + key + "\":\"";
    size_t a = json.find(k);
    if (a == std::string::npos) return "";
    a += k.size();
    size_t b = json.find('"', a);
    return b == std::string::npos ? "" : json.substr(a, b - a);
}

void navigate(const char* url) {
    rc_log("session: to %s", url);
#ifdef __EMSCRIPTEN__
    EM_ASM({   // the page around the game, if any (same origin)
        const u = UTF8ToString($0);
        try { window.top.location.href = u; } catch (e) { location.href = u; }
    }, url);
#endif
}

struct Init {   // back from Discord: past the title straight to the (auto-answered) login
    Init() {
        if (getenv("YO2_AUTO_ONLINE") && session_name()) rc_first_scene = 6, rc_online_pressed = 1;
    }
} init;


// ---- the sign-in panel (signed out, new server). The game's CWindowLogin (the dialog at 256,256, about 464 x 264)
// rearranged in place with the in-game UI kit (ui_kit.h). Its children (CTaskPtr task at window + off):
//   +0x410 header (CWindowTaskTextField at 8,8, 448 x 64: slimmed to a strip)  +0x41c / +0x428 the two labels
//   +0x434 / +0x440 the two inputs  +0x44c / +0x458 / +0x464 / +0x470 the Save labels and boxes (hidden)
//   +0x47c OK, +0x488 Cancel (hidden)
// The main button is the dialog's own OK, so its OK path (scene state 2 -> 3) stays the game's; the request for the
// mode goes out at state 3, and a refusal puts the scene back on its dialog. The rest is new labels and buttons.
enum Mode { SIGNIN, SIGNUP, VERIFY, RESET };
enum Dot { IDLE, BUSY, ERR, OK };
struct Panel {
    uint32_t scene = 0, win = 0;
    Mode mode = SIGNIN;
    bool built = false, signed_in = false;
    uint32_t discord = 0, divider = 0, link1 = 0, mid = 0, link2 = 0, copy = 0, note = 0, code_text = 0, steps = 0;
    uint32_t dot = 0, status = 0, underline = 0;
    float link1_w = 0, link2_w = 0;   // the links' hover boxes (labels have no hover of their own)
    int under = 0;   // the link underlined: 0 none, 1, 2
    uint32_t prev1 = 0, prev2 = 0, prevd = 0, prevc = 0;   // pressed while over (ui_pressed)
    std::string user, pass, code, invite;
} panel;

uint32_t child(uint32_t off) { return RD32m(panel.win + off); }

const float MID = 232, LEFT = 16, WIDE = 432;   // the window's centre; the column's left edge and width
const float LINK_Y[4] = {216, 216, 220, 216};   // by mode

// The status line: a mark by state (the game's text has one colour, see ui_kit.h), then the text.
void status(CPU& t, const std::string& text, Dot d = IDLE) {
    static const char* MARK[4] = {" ", "\u25cc", "\u25cf", "\u2713"};   // idle: nothing; ◌ ● ✓
    ui_set_text(t, panel.dot, MARK[d]);
    ui_set_text(t, panel.status, text.c_str());
}

// A centred label: its text box spans the column.
void centred(CPU& t, uint32_t el, float y) {
    ui_set_align(t, el, 1);
    ui_place(t, el, LEFT + 4, y);
}

// Rows (window coordinates): the greeting strip 8-50, then the column.
void layout(CPU& t) {
    Mode m = panel.mode;
    bool fields = m != VERIFY;
    ui_show(panel.discord, m != VERIFY);
    ui_show(panel.divider, m == SIGNIN || m == SIGNUP);
    for (uint32_t off : {0x41c, 0x428, 0x434, 0x440}) ui_show(child(off), fields);
    ui_set_text(t, child(0x41c), m == RESET ? "Reset code from Discord" : "Username");
    ui_set_text(t, child(0x428), m == RESET ? "New password" : "Password");
    ui_show(panel.note, m == VERIFY || m == RESET);
    ui_show(panel.code_text, m == VERIFY), ui_show(panel.copy, m == VERIFY), ui_show(panel.steps, m == VERIFY);
    if (m == VERIFY) {
        ui_set_text(t, panel.note, "Your verification code");
        centred(t, panel.note, 56);
        std::string spaced;
        for (char c : panel.code) spaced += (spaced.empty() ? "" : " "), spaced += c;
        ui_set_text(t, panel.code_text, spaced.c_str());
        centred(t, panel.code_text, 72);
        ui_place(t, panel.copy, MID, 118);
        std::string invite = panel.invite;
        if (!invite.compare(0, 8, "https://")) invite = invite.substr(8);
        // Three short lines: the web's DejaVu runs about 8 px a character, so a longer one wraps into Continue.
        ui_set_text(t, panel.steps, ("1. Join our Discord: " + invite + "\n2. In #verify, tap Verify my account.\n"
                                     "3. Paste the code, then press Continue.").c_str());
        ui_place(t, panel.steps, LEFT, 130);
    } else if (m == RESET) {
        ui_set_text(t, panel.note, "Get a code in #reset-password on our Discord.");
        centred(t, panel.note, 86);
    }
    uint32_t ok = child(0x47c);
    ui_set_text(t, ok, m == SIGNIN ? "Sign in" : m == SIGNUP ? "Create account" : m == VERIFY ? "Continue" : "Reset password");
    ui_place(t, ok, MID, m == VERIFY ? 200 : 194);
    // The links: "Create account · Reset password" around the centre, else one centred "Back to sign in".
    const char* l1 = m == SIGNIN ? "Create account" : "Back to sign in";
    ui_set_text(t, panel.link1, l1);
    panel.link1_w = (float)strlen(l1) * UI_CHAR_W;
    float ly = LINK_Y[m];
    ui_set_align(t, panel.link1, m == SIGNIN ? 2 : 1);   // SIGNIN: right-aligned in a box ending left of the centre
    ui_place(t, panel.link1, m == SIGNIN ? MID - 10 - 200 : MID - 100, ly);
    ui_place(t, panel.mid, MID - 3, ly), ui_place(t, panel.link2, MID + 10, ly);
    ui_show(panel.mid, m == SIGNIN), ui_show(panel.link2, m == SIGNIN), ui_show(panel.underline, false), panel.under = 0;
    status(t, "");
}

void build(CPU& t) {
    for (uint32_t off : {0x44c, 0x458, 0x464, 0x470, 0x488}) ui_show(child(off), false);   // Save boxes + labels, Cancel
    uint32_t header = child(0x410);
    // The original greeting ("Welcome to the world of Yu-Gi-Oh! ONLINE! / Please enter ...") in the dialog's own
    // header field, reworded, the field cut from 448 x 64 to its two lines.
    ui_set_text(t, header, "Welcome to the world of Duel Evolution!\nPlease sign in to play.");
    ui_set_size(t, header, 448, 42);
    // The window frame (CWindowTaskFrameBottomThick at +0x404): its lower body is +0x420 tall (184 of 264, so the
    // header band was 80); 206 fits the greeting. Then its slot 0x34 re-lays it out, as the dialog's init does.
    if (uint32_t frame = child(0x404)) {
        float body = 206;
        memcpy(rc_mem + frame + 0x420, &body, 4);
        t.ecx = frame;
        rc_call(&t, RD32m(RD32m(frame) + 0x34), 0, nullptr);
    }
    panel.discord = ui_button(t, panel.win, "Sign in with Discord", (int)WIDE, 26);
    ui_place(t, panel.discord, MID, 68);
    panel.divider = ui_label(t, panel.win, "――――――――――   or   ――――――――――");
    centred(t, panel.divider, 88);
    // The dialog's own labels above its own inputs, on the column's left edge; OK at the column's width.
    ui_place(t, child(0x41c), LEFT, 104), ui_place(t, child(0x428), LEFT, 140);
    ui_set_size(t, child(0x434), WIDE + 16, 32), ui_set_size(t, child(0x440), WIDE + 16, 32);
    ui_place(t, child(0x434), LEFT - 8, 112), ui_place(t, child(0x440), LEFT - 8, 148);
    ui_set_size(t, child(0x47c), WIDE, 26);
    panel.link1 = ui_label(t, panel.win, " ", 200), panel.underline = ui_label(t, panel.win, " ", 200);
    panel.mid = ui_label(t, panel.win, "·", 16);
    panel.link2 = ui_label(t, panel.win, "Reset password", 200);
    panel.link2_w = 14 * UI_CHAR_W;
    panel.copy = ui_button(t, panel.win, "Copy", 72, 22);
    panel.note = ui_label(t, panel.win, " "), panel.steps = ui_label(t, panel.win, " ", 424, 64);
    panel.code_text = ui_label(t, panel.win, " ", 424, 36);
    ui_set_font_size(t, panel.code_text, 28);
    panel.dot = ui_label(t, panel.win, " ", 16), panel.status = ui_label(t, panel.win, " ");
    ui_place(t, panel.dot, LEFT, 240), ui_place(t, panel.status, LEFT + 16, 240);
    panel.built = true;
    layout(t);
}

void to(CPU& t, Mode m) {
    if (m == RESET) ui_set_input(t, child(0x434), ""), ui_set_input(t, child(0x440), "");
    panel.mode = m;
    layout(t);
}
std::string login_json(const std::string& user, const std::string& pass) {
    return "{\"username\":\"" + user + "\",\"password\":\"" + pass + "\"}";
}
// The status line's messages (one line of the column).
std::string reason(int st, const std::string& body) {
    if (st == 401) return "Wrong username or password.";
    if (st == 409) return "That username is taken.";
    if (st == 429) return "Too many tries. Wait a bit.";
    if (st == 400 && body.find("BAD_CODE") != std::string::npos) return "Code wrong or expired.";
    if (st == 400 && body.find("BAD_PASSWORD") != std::string::npos) return "Passwords: 10-128 characters.";
    if (st == 400) return "Names: 3-16 of a-z 0-9 _ -";
    return "Server error (" + std::to_string(st) + "). Try again.";
}
// The register answer: a code -> the verify view.
bool to_verify(CPU& t, int st, const std::string& body) {
    if (st != 200) return false;
    panel.code = field(body, "code"), panel.invite = field(body, "inviteUrl");
    to(t, VERIFY);
    return true;
}

// The main button pressed (the dialog's OK, scene state 3): the mode's request, before the gate socket at state 4.
void submit(CPU& t) {
    uint32_t win = panel.win;
    std::string a = ui_input_json(child(0x434)), b = ui_input_json(child(0x440)), body, why;
    if (panel.signed_in) return;
    int st = 0;
    switch (panel.mode) {
    case SIGNIN:
        panel.user = a, panel.pass = b;
        st = de_call("/api/auth/sign-in/username", login_json(a, b), body);
        if (st == 403 && body.find("EMAIL_NOT_VERIFIED") != std::string::npos) {   // a fresh code
            int r = de_call("/api/de/register", login_json(a, b), body);
            if (!to_verify(t, r, body)) why = reason(r, body);
            break;
        }
        if (st != 200) why = reason(st, body);
        break;
    case SIGNUP:
        panel.user = a, panel.pass = b;
        st = de_call("/api/de/register", login_json(a, b), body);
        if (!to_verify(t, st, body)) why = reason(st, body);
        st = 0;   // a code is not a sign-in: the dialog again, now the verify view
        break;
    case VERIFY:
        st = de_call("/api/auth/sign-in/username", login_json(panel.user, panel.pass), body);
        if (st == 403) why = "Not verified on Discord yet.";
        else if (st != 200) why = reason(st, body);
        break;
    case RESET:
        st = de_call("/api/de/reset", "{\"code\":\"" + a + "\",\"newPassword\":\"" + b + "\"}", body);
        if (st != 200) why = reason(st, body);
        break;
    }
    if (st == 200) {   // signed in: the scene goes on to the gate, every socket bound to the session
        panel.signed_in = true;
        status(t, "Signed in. Connecting…", OK);
        return;
    }
    WR32m(panel.scene + 0x80, 2);   // back on the dialog
    WR32m(win + 0x20, RD32m(win + 0x20) & ~1u);
    WR32m(win + 0x3b0, 0xffffffffu);
    if (!why.empty()) status(t, why, ERR);
}

void panel_frame(int frame, uint32_t scene) {
    CPU* cur = rc_cur();
    if (!cur) return;
    CPU t = *cur;
    uint32_t win = RD32m(scene + 0x94);
    if (!win || RD32m(win) != 0xbedda4) return;
    if (panel.scene != scene || panel.win != win) panel = Panel(), panel.scene = scene, panel.win = win;
    uint32_t st = RD32m(scene + 0x80);
    if (!panel.built) {
        if (st != 2) return;
        build(t);
        rc_log("session: sign-in panel at frame %d", frame);
        return;
    }
    if (st == 3) return submit(t);
    if (st != 2) return;
    if (ui_clicked(panel.discord, panel.prevd)) {
        status(t, "Waiting for Discord…", BUSY);
        navigate(getenv("YO2_DISCORD_URL"));
    }
    // A link under the mouse is underlined (a row of '_' under it).
    float ly = LINK_Y[panel.mode], x1 = panel.mode == SIGNIN ? MID - 10 - panel.link1_w : MID - panel.link1_w / 2;
    bool over1 = ui_over(win, x1, ly, panel.link1_w, 18);
    bool over2 = panel.mode == SIGNIN && ui_over(win, MID + 10, ly, panel.link2_w, 18);
    int under = over1 ? 1 : over2 ? 2 : 0;
    if (under != panel.under) {
        float uw = under == 1 ? panel.link1_w : panel.link2_w;
        ui_set_text(t, panel.underline, std::string((size_t)(uw / 7.5f), '_').c_str());
        ui_place(t, panel.underline, under == 1 ? x1 : MID + 10, ly + 3);
        ui_show(panel.underline, under != 0);
        panel.under = under;
    }
    if (ui_pressed(over1, panel.prev1)) to(t, panel.mode == SIGNIN ? SIGNUP : SIGNIN);
    if (ui_pressed(over2, panel.prev2)) to(t, RESET);
    if (ui_clicked(panel.copy, panel.prevc)) {
#ifdef __EMSCRIPTEN__
        EM_ASM({ try { navigator.clipboard.writeText(UTF8ToString($0)); } catch (e) {} }, panel.code.c_str());
#endif
        status(t, "Code copied.", OK);
    }
}
}   // namespace

extern "C" void rc_session_frame(int frame) {
    static const char* name = session_name();
    static const char* discord = getenv("YO2_DISCORD_URL");
    static uint32_t scene;
    if ((!name && !discord) || !rc_online_pressed) return;
    if (!scene || RD32m(scene) != 0xbede6c) {
        if (!(scene = rc_heap_find(0xbede6c, any))) return;   // every frame, only between ONLINE and the dialog
    }
    if (!name) {   // signed out: the panel until the scene is past the gate
        if (RD32m(scene + 0x80) > 3) rc_online_pressed = 0, panel = Panel();
        else panel_frame(frame, scene);
        return;
    }
    if (RD32m(scene + 0x80) != 2) return;
    uint32_t win = RD32m(scene + 0x94);   // CTaskPtr<CWindowLogin> at +0x90: the task at +4
    if (!win || RD32m(win) != 0xbedda4) {   // the live scene's pointer: null or a live task
        rc_log("session: login window %08x vtable %08x, not CWindowLogin", win, win ? RD32m(win) : 0);
        rc_online_pressed = 0;
        return;
    }
    uint32_t user = RD32m(win + 0x434), password = RD32m(win + 0x440);
    if (!user || RD32m(user) != 0xbe812c || !password || RD32m(password) != 0xbe812c) {
        rc_log("session: login boxes %08x %08x are not CWindowTaskInput", user, password);
        rc_online_pressed = 0;
        return;
    }
    const char* pass = getenv("YO2_SESSION_PASS");
    CPU* cur = rc_cur();
    if (!cur) return;
    CPU t = *cur;   // a scratch copy: the calls run below the current stack pointer
    ui_set_input(t, user, name);
    ui_set_input(t, password, pass && *pass ? pass : "-");
    WR32m(win + 0x20, RD32m(win + 0x20) | 1);   // hidden, as the OK path leaves it
    WR32m(win + 0x3b0, 0xfa2);                  // OK
    rc_log("session: signed in as %s, login dialog answered at frame %d", name, frame);
    rc_online_pressed = 0;
}
