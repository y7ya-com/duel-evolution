#include "Misc/yo2MailBox.h"

#include <cstring>
#include <string>
#include <vector>

#include "Lobby/yo2FriendBase.h"   // fblistUserDir, fblistFileRead / Write: the user's folder, CCryptFile I/O
#include "Net/NetLobby.h"
#include "Net/NetUi.h"             // appLanguage

struct CMailBox::Layout {
    YO2_AT(CMailBox, fwd_, 0x04);
    YO2_AT(CMailBox, mails_, 0x0c);
    YO2_AT(CMailBox, path_, 0x1c);
    YO2_AT(CMailBox, user_, 0x2c);
};
struct CMailMgr::Layout {
    YO2_AT(CMailMgr, recv_, 0x04);
    YO2_AT(CMailMgr, sent_, 0x40);
    YO2_AT(CMailMgr, user_, 0x7c);
};

namespace {

// The file's date headers, oldest first (PTR_DAT_00ce95a0); save writes the last. All are 10 characters.
const char* const kVersions[] = {"2006/02/02", "2006/08/21", "2007/06/20"};
constexpr size_t kHeaderSize = 10;

// The yaneSDK CSerialize the exe builds on the stack (vtable 0x00bee1d8): bytes appended while storing, read
// forward otherwise.
// @yo2 0x00834980 vector<uint8_t>::vector (its buffer)
// @yo2 0x008349b0 vector<uint8_t>::clear
// @yo2 0x00834a00 destroy<uint8_t*> (empty)
// @yo2 0x00833100 CSerialize::~CSerialize
// @yo2 0x00833140 CSerialize deleting destructor
struct Archive {
    std::vector<uint8_t> data;
    size_t pos = 0;

    void put(const void* p, size_t n) {
        auto* b = static_cast<const uint8_t*>(p);
        data.insert(data.end(), b, b + n);
    }
    // fix: the exe reads past the end of a truncated file; this reads zeros
    void get(void* p, size_t n) {
        auto* b = static_cast<uint8_t*>(p);
        for (size_t i = 0; i < n; i++, pos++)
            b[i] = pos < data.size() ? data[pos] : 0;
    }
    uint8_t getByte() {
        uint8_t b;
        get(&b, 1);
        return b;
    }
    // @yo2 0x00834cc0 CSerialize::operator<<(int&)
    int32_t getInt() {
        int32_t v;
        get(&v, 4);
        return v;
    }
    void putInt(int32_t v) { put(&v, 4); }

    void putName(const std::string& s) {   // 16 bytes, zero padded
        char b[16] = {};
        std::memcpy(b, s.data(), std::min(s.size(), sizeof b));
        put(b, sizeof b);
    }
    std::string getName() {
        char b[17] = {};
        get(b, 16);
        return b;
    }
    void putText(const std::string& s) {
        putInt(static_cast<int32_t>(s.size()));
        put(s.data(), s.size());
    }
    // the exe reads into a 0x201-byte buffer and keeps up to the first NUL
    std::string getText() {
        int32_t n = getInt();
        std::string b(n > 0 ? n : 0, '\0');
        get(b.data(), b.size());
        return b.c_str();
    }
};

}  // namespace

// @yo2 0x00834670 CMailBox::~CMailBox
// @yo2 0x00834940 vector<LobbyMail*>::~vector
CMailBox::~CMailBox() = default;

// @yo2 0x00832740
bool CMailBox::exists() {
    buildPath();
    return pathFileExists(path_.c_str());
}

// @yo2 0x00832770
int32_t CMailBox::save() {
    buildPath();
    Archive a;
    a.put(kVersions[2], kHeaderSize);
    a.putInt(static_cast<int32_t>(mails_.size()));
    for (LobbyMail* m : mails_) {
        a.put(&m->b62, 1);
        a.put(&m->read, 1);
        a.put(&m->valid, 1);
        a.putInt(m->to);
        a.putName(m->toName);
        a.putInt(m->sent);   // read back as received: the exe writes sent twice, so received isn't kept
        a.putInt(m->from);
        a.putName(m->fromName);
        a.putInt(m->sent);
        a.putText(m->subjectText());
        a.putText(m->bodyText());
        a.putText(m->extraText());
    }
    fblistFileWrite(path_.c_str(), a.data.data(), static_cast<uint32_t>(a.data.size()));
    return 0;
}

// @yo2 0x00833170
int32_t CMailBox::load() {
    clear();
    buildPath();
    Archive a;
    if (!fblistFileRead(path_.c_str(), &a.data)) return -1;
    yo2Trace("MAIL FILE OPEN SUCCESS.\n");
    int32_t version = -1;   // no header: the first files had none
    for (int32_t i = 0; i < 3; i++)
        if (a.data.size() >= kHeaderSize && std::memcmp(a.data.data(), kVersions[i], kHeaderSize) == 0) {
            version = i;
            a.pos = kHeaderSize;
            break;
        }
    int32_t n = a.getInt();
    for (int32_t i = 0; i < n; i++) {
        LobbyMail m{};
        m.b62 = version < 1 ? appLanguage() : a.getByte();
        m.read = version < 0 ? 0 : a.getByte();
        m.valid = a.getByte();
        m.to = a.getInt();
        m.toName = a.getName();
        m.received = a.getInt();
        m.from = a.getInt();
        m.fromName = a.getName();
        m.sent = a.getInt();
        m.subject = a.getText();
        m.body = a.getText();
        if (version == 2) m.extra = a.getText();
        add(m);
    }
    return 0;
}

// @yo2 0x00833eb0
void CMailBox::clear() {
    for (LobbyMail* m : mails_)
        delete m;
    mails_.clear();
}

// @yo2 0x008343f0
void CMailBox::copyFrom(const CMailBox& o) {
    for (LobbyMail* m : o.mails_)
        add(*m);
}

// @yo2 0x00833f40
// @yo2 0x00834a20 vector<LobbyMail*>::insert(it, n, v)
void CMailBox::add(const LobbyMail& m) { mails_.push_back(new LobbyMail(m)); }

// @yo2 0x008341c0
void CMailBox::remove(int32_t i) {
    delete mails_[i];
    mails_.erase(mails_.begin() + i);
}

// @yo2 0x00834240
void CMailBox::setUser(vc6::string user) { user_ = user; }

// @yo2 0x00834430
LobbyMail* CMailBox::at(int32_t i) { return mails_[i]; }

// @yo2 0x00834450
int32_t CMailBox::count() { return static_cast<int32_t>(mails_.size()); }

// @yo2 0x00834480
void CMailBox::rewind() { fwd_ = mails_.begin(); }

// @yo2 0x008344a0
LobbyMail* CMailBox::next() { return fwd_ == mails_.end() ? nullptr : *fwd_++; }

// @yo2 0x008344d0
void CMailBox::rewindBack() { back_ = mails_.end(); }

// @yo2 0x008344f0
LobbyMail* CMailBox::prev() { return back_ == mails_.begin() ? nullptr : *--back_; }

// @yo2 0x00833ac0
void CMailBoxRecv::buildPath() {
    path_ = fblistUserDir();
    path_ += "\\mail\\rdm.dat";
}

// @yo2 0x00833aa0
int32_t CMailBoxRecv::load() { return CMailBox::load(); }

// @yo2 0x00833c00
void CMailBoxSend::buildPath() {
    path_ = fblistUserDir();
    path_ += "\\mail\\sdm.dat";
}

// @yo2 0x00833be0
int32_t CMailBoxSend::load() { return CMailBox::load(); }

// @yo2 0x00834520
void CMailMgr::setUser(vc6::string user) {
    user_ = user;
    recv_.setUser(user_);
    sent_.setUser(user_);
}

// @yo2 0x00834640
void CMailMgr::load() {
    recv_.load();
    sent_.load();
}

// @yo2 0x008347c0
CMailMgr::~CMailMgr() = default;

// @yo2 0x00833d40 the global's initializer
CMailMgr* g_mailMgr = new CMailMgr;

// The holder that deletes it at exit (guard bit 0 of DAT_012ad030).
// @yo2 0x00834730 its constructor (empty)
// @yo2 0x00834750 its atexit registration
// @yo2 0x00834770 its destructor
namespace {
struct MailMgrDeleter {
    ~MailMgrDeleter() { delete g_mailMgr; }
} s_mailMgrDeleter;
}  // namespace
