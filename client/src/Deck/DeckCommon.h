// Shared stand-ins for src/Deck part A (deckEntry.cpp, yo2DeckParts.cpp, yo2DeckUtil.cpp, yo2DeckWindow.cpp,
// yo2KabanWindow.cpp): the MSVC6 containers and the CTaskPtr<T> every window keeps to its children.
//
// TODO(System): src/System (branch phase2-system) has the real CTask / CTaskPtr<T> / vc6 containers. Until it is
// merged these are local, layout-true stand-ins with their own names (dk::), so both can coexist. Window classes are
// declared as structs whose base-class region is an opaque byte block; base-class calls go through
// deck_a_externs.h. Offsets are pinned with YO2_AT (checked on 32-bit builds: tests/deck_a_test.py compiles every
// file with i686-w64-mingw32-g++).
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <new>

#if defined(__GNUC__) || defined(__clang__)
#pragma GCC diagnostic ignored "-Winvalid-offsetof"
#endif
#ifndef YO2_AT
#define YO2_AT(T, f, off) static_assert(sizeof(void*) != 4 || offsetof(T, f) == (off), #T "::" #f " offset")
#endif
#ifndef YO2_SIZEOF
#define YO2_SIZEOF(T, n) static_assert(sizeof(void*) != 4 || sizeof(T) == (n), "sizeof " #T)
#endif

namespace dk {

// ---------------------------------------------------------------- the yo2 assert
// FUN_0060cff0 shows "file(line) msg" and returns false (then the caller exits); `ignore` is the per-site flag.
bool assertBox(bool* ignore, const char* msg, const char* file, int line);
[[noreturn]] void fatalExit(int code);   // FUN_00b0ae12 (exit)

#define DK_ASSERT(cond, msg)                                                                  \
    do {                                                                                       \
        static bool dkIgnore_;                                                                 \
        if (!dkIgnore_ && !(cond) && !::dk::assertBox(&dkIgnore_, (msg), __FILE__, __LINE__)) \
            ::dk::fatalExit(1);                                                                \
    } while (0)

// ---------------------------------------------------------------- MSVC6 basic_string<C>
// 16 bytes: {allocator byte, C* ptr, len, res}. The exe's strings are copy-on-write with a refcount byte at
// ((uint8_t*)ptr)[-1]; this stand-in has plain value semantics and keeps that byte at 0 (one owner), so exe code
// that reads or frees one stays correct. ptr == nullptr is the empty string, like the exe's.
template <class C>
struct VcBasicString {
    uint8_t alloc = 0;
    C* ptr = nullptr;
    uint32_t len = 0;
    uint32_t res = 0;

    VcBasicString() = default;
    VcBasicString(const C* s) { assign(s, s ? slen(s) : 0); }
    VcBasicString(const C* s, size_t n) { assign(s, n); }
    VcBasicString(const VcBasicString& o) { assign(o.ptr, o.len); }
    ~VcBasicString() { clear(); }
    VcBasicString& operator=(const VcBasicString& o) {
        if (this != &o) assign(o.ptr, o.len);
        return *this;
    }
    VcBasicString& operator=(const C* s) { return assign(s, s ? slen(s) : 0); }

    static size_t slen(const C* s) {
        size_t n = 0;
        while (s[n]) n++;
        return n;
    }
    VcBasicString& assign(const C* s, size_t n) {
        if (!n) {
            clear();
            return *this;
        }
        // one leading C keeps the refcount byte just below ptr
        C* p = static_cast<C*>(::operator new((n + 2) * sizeof(C)));
        std::memset(p, 0, sizeof(C));
        std::memmove(p + 1, s, n * sizeof(C));
        p[n + 1] = 0;
        clear();
        ptr = p + 1;
        len = res = (uint32_t)n;
        return *this;
    }
    VcBasicString& append(const C* s, size_t n) {
        if (!n) return *this;
        VcBasicString t;
        C* p = static_cast<C*>(::operator new((len + n + 2) * sizeof(C)));
        std::memset(p, 0, sizeof(C));
        if (len) std::memcpy(p + 1, ptr, len * sizeof(C));
        std::memmove(p + 1 + len, s, n * sizeof(C));
        p[len + n + 1] = 0;
        uint32_t nl = len + (uint32_t)n;
        clear();
        ptr = p + 1;
        len = res = nl;
        return *this;
    }
    VcBasicString& operator+=(const C* s) { return append(s, slen(s)); }
    VcBasicString& operator+=(const VcBasicString& o) { return append(o.c_str(), o.len); }
    void clear() {
        if (ptr) ::operator delete(ptr - 1);
        ptr = nullptr;
        len = res = 0;
    }
    const C* c_str() const {
        static const C empty[1] = {0};
        return ptr ? ptr : empty;
    }
    size_t size() const { return len; }
    bool empty() const { return len == 0; }
    bool operator==(const VcBasicString& o) const {
        return len == o.len && (!len || std::memcmp(ptr, o.ptr, len * sizeof(C)) == 0);
    }
    bool operator!=(const VcBasicString& o) const { return !(*this == o); }
};
using VcString = VcBasicString<char>;
using VcWString = VcBasicString<uint16_t>;   // the exe's wchar_t is 16-bit
YO2_AT(VcString, ptr, 4);
YO2_AT(VcString, len, 8);
YO2_SIZEOF(VcString, 0x10);
YO2_SIZEOF(VcWString, 0x10);

// ---------------------------------------------------------------- MSVC6 vector<T>
// 16 bytes: {allocator byte, first, last, end}. Value semantics; T must be trivially relocatable or a VcString.
template <class T>
struct VcVector {
    uint8_t alloc = 0;
    T* first = nullptr;
    T* last = nullptr;
    T* end_ = nullptr;

    VcVector() = default;
    VcVector(const VcVector&) = delete;
    VcVector& operator=(const VcVector&) = delete;
    ~VcVector() { clear(); }
    size_t size() const { return first ? (size_t)(last - first) : 0; }
    size_t capacity() const { return first ? (size_t)(end_ - first) : 0; }
    bool empty() const { return size() == 0; }
    T& operator[](size_t i) { return first[i]; }
    const T& operator[](size_t i) const { return first[i]; }
    T* begin() { return first; }
    T* end() { return last; }
    const T* begin() const { return first; }
    const T* end() const { return last; }
    void reserve(size_t n) {
        if (n <= capacity()) return;
        T* p = static_cast<T*>(::operator new(n * sizeof(T)));
        size_t k = size();
        for (size_t i = 0; i < k; i++) {
            new (p + i) T(first[i]);
            first[i].~T();
        }
        if (first) ::operator delete(first);
        first = p;
        last = p + k;
        end_ = p + n;
    }
    void push_back(const T& v) {
        if (size() == capacity()) {
            T copy(v);   // v may live inside this vector
            reserve(size() ? size() * 2 : 4);
            new (last++) T(copy);
            return;
        }
        new (last++) T(v);
    }
    void erase(size_t i) {
        for (size_t k = i; k + 1 < size(); k++) first[k] = first[k + 1];
        (--last)->~T();
    }
    void clear() {
        for (T* p = first; p != last; p++) p->~T();
        if (first) ::operator delete(first);
        first = last = end_ = nullptr;
    }
};
YO2_AT(VcVector<int>, first, 4);
YO2_SIZEOF(VcVector<int>, 0x10);

// The "invalid vector<T> subscript" throw (std::_Xran), one copy per TU in the exe.
[[noreturn]] void vectorXran();

// ---------------------------------------------------------------- tasks
// An opaque CTask (yo2Task.cpp). Window classes in src/Deck point at each other through TaskPtr<T>.
bool taskAlive(const void* task);                       // FUN_0062a420: non-null, not a freed fill, magic at +0x38
void taskAddUser(void* task, void* ptr);                // FUN_00628fa0 CTask::addUser
void taskRemoveUser(void* task, void* ptr);             // FUN_00629010 CTask::removeUser

// CTaskPtr<T>, 0xc bytes: {vtbl, task, user}. get() asserts on a null or dead target like the exe's
// (yo2TaskPtr.h lines 0x4d "NULL access" / 0x4e "Wild Task") and then returns null.
// The per-T copies of get/set/~ in the exe are marked where each class is defined (phase2-system marks some).
template <class T>
struct TaskPtr {
    uint32_t vtbl = 0;
    T* task = nullptr;
    void* user = nullptr;

    TaskPtr() = default;
    TaskPtr(const TaskPtr&) = delete;
    TaskPtr& operator=(const TaskPtr&) = delete;
    ~TaskPtr() {
        if (task) taskRemoveUser(task, this);
    }
    bool alive() const { return taskAlive(task); }
    T* get() const {
        if (alive()) return task;
        DK_ASSERT(task, "NULL access\n");
        DK_ASSERT(!task, "Wild Task\n");
        return nullptr;
    }
    T* operator->() const { return get(); }
    void set(T* t) {
        DK_ASSERT(user, "CTaskPtr: set the user before use");
        if (task && alive()) taskRemoveUser(task, this);
        task = t;
        if (t) taskAddUser(t, this);
    }
    void setUser(void* u) { user = u; }   // FUN_00634230 CTaskPtrBase::setUser
};
YO2_AT(TaskPtr<int>, task, 4);
YO2_AT(TaskPtr<int>, user, 8);
YO2_SIZEOF(TaskPtr<int>, 0xc);

// ---------------------------------------------------------------- 2D helpers the windows share
struct Vec2 {
    float x, y;
};
struct Rect {   // {left, top, right, bottom}
    float l, t, r, b;
    bool contains(float x, float y) const { return x >= l && x < r && y >= t && y < b; }
};

}   // namespace dk
