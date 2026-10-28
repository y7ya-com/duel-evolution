// src/Misc/yo2MailBox.cpp: CMailMgr and its two CMailBoxes (rdm.dat / sdm.dat).
// sources: Misc/yo2MailBox.cpp System/yo2Debug.cpp
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <vector>

#include "Misc/yo2MailBox.h"
#include "Net/NetLobby.h"

#define CHECK(c) \
    do { if (!(c)) { std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #c); std::exit(1); } } while (0)

// ---- doubles: LobbyMail's methods (Net), the user's folder and the crypt files, the language
LobbyMail::~LobbyMail() {}
std::string LobbyMail::subjectText() const { return subject; }
std::string LobbyMail::bodyText() const { return body; }
std::string LobbyMail::extraText() const { return extra; }
std::map<std::string, std::vector<uint8_t>> g_files;
vc6::string fblistUserDir() { return "C:\\yo2\\user"; }
bool fblistFileRead(const char* path, std::vector<uint8_t>* data) {
    auto it = g_files.find(path);
    if (it == g_files.end()) return false;
    *data = it->second;
    return true;
}
void fblistFileWrite(const char* path, const void* data, uint32_t size) {
    g_files[path].assign(static_cast<const uint8_t*>(data), static_cast<const uint8_t*>(data) + size);
}
bool pathFileExists(const char* path) { return g_files.count(path) != 0; }
uint8_t appLanguage() { return 1; }

static LobbyMail mail(int32_t from, const char* subject) {
    LobbyMail m{};
    m.from = from;
    m.fromName = "Jaden";
    m.to = 7;
    m.toName = "a name longer than sixteen";
    m.sent = 1000 + from;
    m.received = 5;
    m.subject = subject;
    m.body = "body";
    m.extra = "extra";
    m.valid = 1;
    m.read = 1;
    m.b62 = 3;
    return m;
}

static void put(std::vector<uint8_t>& v, const void* p, size_t n) {
    v.insert(v.end(), static_cast<const uint8_t*>(p), static_cast<const uint8_t*>(p) + n);
}
static void putInt(std::vector<uint8_t>& v, int32_t x) { put(v, &x, 4); }
static void putText(std::vector<uint8_t>& v, const char* s) {
    putInt(v, static_cast<int32_t>(std::strlen(s)));
    put(v, s, std::strlen(s));
}

int main() {
    const std::string rdm = "C:\\yo2\\user\\mail\\rdm.dat", sdm = "C:\\yo2\\user\\mail\\sdm.dat";
    CMailMgr& mgr = *g_mailMgr;
    CHECK(!mgr.recv_.exists() && mgr.recv_.path_ == rdm);
    CHECK(mgr.recv_.load() == -1 && mgr.recv_.count() == 0);

    // save / load round trip
    mgr.sent_.add(mail(1, "first"));
    mgr.sent_.add(mail(2, "second"));
    CHECK(mgr.sent_.save() == 0 && mgr.sent_.exists());
    const std::vector<uint8_t>& f = g_files[sdm];
    CHECK(std::memcmp(f.data(), "2007/06/20", 10) == 0);
    CHECK(f[10] == 2 && f[14] == 3 && f[15] == 1 && f[16] == 1);   // count, then b62 / read / valid
    mgr.load();
    CHECK(mgr.recv_.count() == 0 && mgr.sent_.count() == 2);
    LobbyMail* m = mgr.sent_.at(1);
    CHECK(m->from == 2 && m->fromName == "Jaden" && m->to == 7 && m->toName == "a name longer th");
    CHECK(m->sent == 1002 && m->received == 1002);   // received comes back as sent
    CHECK(m->subject == "second" && m->body == "body" && m->extra == "extra");
    CHECK(m->b62 == 3 && m->read == 1 && m->valid == 1);

    // cursors
    mgr.sent_.rewind();
    CHECK(mgr.sent_.next()->from == 1 && mgr.sent_.next()->from == 2 && !mgr.sent_.next());
    mgr.sent_.rewindBack();
    CHECK(mgr.sent_.prev()->from == 2 && mgr.sent_.prev()->from == 1 && !mgr.sent_.prev());

    // copy, remove
    mgr.recv_.copyFrom(mgr.sent_);
    CHECK(mgr.recv_.count() == 2 && mgr.recv_.at(0) != mgr.sent_.at(0));
    mgr.recv_.remove(0);
    CHECK(mgr.recv_.count() == 1 && mgr.recv_.at(0)->from == 2);

    // a headerless file (version -1): no b62 / read bytes, b62 is the language, no extra text
    std::vector<uint8_t> old;
    putInt(old, 1);
    uint8_t valid = 1;
    put(old, &valid, 1);
    putInt(old, 9);
    put(old, "to\0\0\0\0\0\0\0\0\0\0\0\0\0\0", 16);
    putInt(old, 11);
    putInt(old, 12);
    put(old, "from\0\0\0\0\0\0\0\0\0\0\0\0", 16);
    putInt(old, 13);
    putText(old, "subj");
    putText(old, "text");
    g_files[rdm] = old;
    CHECK(mgr.recv_.load() == 0 && mgr.recv_.count() == 1);
    m = mgr.recv_.at(0);
    CHECK(m->b62 == 1 && m->read == 0 && m->valid == 1 && m->to == 9 && m->toName == "to" && m->received == 11);
    CHECK(m->from == 12 && m->fromName == "from" && m->sent == 13 && m->subject == "subj" && m->body == "text");
    CHECK(m->extra.empty());

    // 2006/08/21 (version 1): b62 and read are read, still no extra
    std::vector<uint8_t> v1;
    put(v1, "2006/08/21", 10);
    putInt(v1, 1);
    uint8_t flags[3] = {4, 1, 1};
    put(v1, flags, 3);
    put(v1, old.data() + 5, old.size() - 5);
    g_files[rdm] = v1;
    CHECK(mgr.recv_.load() == 0 && mgr.recv_.count() == 1);
    m = mgr.recv_.at(0);
    CHECK(m->b62 == 4 && m->read == 1 && m->body == "text" && m->extra.empty());

    // a truncated file reads zeros instead of running off the end
    std::vector<uint8_t> cut;
    put(cut, "2007/06/20", 10);
    putInt(cut, 1);
    g_files[rdm] = cut;
    CHECK(mgr.recv_.load() == 0 && mgr.recv_.count() == 1 && mgr.recv_.at(0)->from == 0);
    CHECK(mgr.recv_.at(0)->subject.empty());

    mgr.setUser("player");
    CHECK(mgr.user_ == "player" && mgr.recv_.user_ == "player" && mgr.sent_.user_ == "player");
    mgr.recv_.clear();
    mgr.sent_.clear();
    std::puts("mailbox: ok");
    return 0;
}
