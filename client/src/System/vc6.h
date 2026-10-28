// Containers with the exe's (MSVC 6 STL) memory layout, so game classes keep their original offsets and sizes
// on i686, and functions can later be diffed against the exe on the same memory.
//   vc6::string     16 bytes  {allocator byte, char* ptr, len, res}; ptr[-1] is the VC6 COW refcount byte
//   vc6::wstring    16 bytes  {allocator byte, char16_t* ptr, len, res}; one char16_t header before ptr, whose
//                             high byte (((uint8_t*)ptr)[-1]) is the refcount; the exe frees ptr - 1 (in chars)
//   vc6::list<T>    12 bytes  {allocator byte, Node* head, size}; circular, head is a sentinel allocated up front
//   vc6::vector<T>  16 bytes  {allocator byte, first, last, end}
//   vc6::map<K,V>   16 bytes  {allocator, key_compare, head, multi, size} (footprint only, see below)
// Behaviour is plain value semantics (no COW sharing); the refcount byte is kept at 0 so exe code reading or
// freeing one of these strings stays correct.
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <iterator>
#include <map>
#include <new>
#include <string>
#include <string_view>
#include <type_traits>
#include <vector>

// Offset checks that only mean something on the original 32-bit layout. Same text as src/Net/MessageIO.h's, so
// both headers can be included together.
#define YO2_AT(T, f, off) static_assert(sizeof(void*) != 4 || offsetof(T, f) == (off), #T "::" #f " offset")
#define YO2_SIZEOF(T, n) static_assert(sizeof(void*) != 4 || sizeof(T) == (n), "sizeof " #T)
#if defined(__GNUC__) || defined(__clang__)
#pragma GCC diagnostic ignored "-Winvalid-offsetof"  // offsetof on polymorphic classes: fine on our compilers
#endif

namespace vc6 {

class string {
public:
    string() = default;
    string(const char* s) { assign(s, s ? std::strlen(s) : 0); }
    string(std::string_view s) { assign(s.data(), s.size()); }
    string(const string& o) { assign(o.ptr_, o.len_); }
    ~string() { tidy(); }
    string& operator=(const string& o) {
        if (this != &o)
            assign(o.ptr_, o.len_);
        return *this;
    }
    string& operator=(const char* s) { return assign(s, s ? std::strlen(s) : 0); }

    string& assign(const char* s, size_t n) {
        if (n == 0) {
            tidy();
            return *this;
        }
        char* p = static_cast<char*>(::operator new(n + 2));
        p[0] = 0;  // refcount: one owner
        std::memmove(p + 1, s, n);
        p[n + 1] = 0;
        tidy();
        ptr_ = p + 1;
        len_ = static_cast<uint32_t>(n);
        res_ = static_cast<uint32_t>(n);
        return *this;
    }
    string& operator+=(std::string_view s) {
        string t;
        t.reserveCopy(*this, s);
        swap(t);
        return *this;
    }

    const char* c_str() const { return ptr_ ? ptr_ : ""; }
    size_t size() const { return len_; }
    bool empty() const { return len_ == 0; }
    operator std::string_view() const { return {c_str(), len_}; }
    bool operator==(std::string_view s) const { return std::string_view(*this) == s; }
    bool operator!=(std::string_view s) const { return !(*this == s); }
    void swap(string& o) {
        std::swap(ptr_, o.ptr_);
        std::swap(len_, o.len_);
        std::swap(res_, o.res_);
    }

private:
    void reserveCopy(std::string_view a, std::string_view b) {
        char* p = static_cast<char*>(::operator new(a.size() + b.size() + 2));
        p[0] = 0;
        std::memcpy(p + 1, a.data(), a.size());
        std::memcpy(p + 1 + a.size(), b.data(), b.size());
        p[a.size() + b.size() + 1] = 0;
        ptr_ = p + 1;
        len_ = res_ = static_cast<uint32_t>(a.size() + b.size());
    }
    void tidy() {
        if (ptr_)
            ::operator delete(ptr_ - 1);
        ptr_ = nullptr;
        len_ = res_ = 0;
    }
    [[maybe_unused]] uint8_t alloc_ = 0;  // the allocator object
    char* ptr_ = nullptr;
    uint32_t len_ = 0;
    uint32_t res_ = 0;
};

// std::wstring with the exe's layout (UTF-16 wchar_t). Same rules as string: value semantics, refcount kept 0.
class wstring {
public:
    wstring() = default;
    wstring(const char16_t* s) { assign(s, s ? std::char_traits<char16_t>::length(s) : 0); }
    wstring(std::u16string_view s) { assign(s.data(), s.size()); }
    wstring(const wstring& o) { assign(o.ptr_, o.len_); }
    ~wstring() { tidy(); }
    wstring& operator=(const wstring& o) {
        if (this != &o)
            assign(o.ptr_, o.len_);
        return *this;
    }
    wstring& operator=(const char16_t* s) { return assign(s, s ? std::char_traits<char16_t>::length(s) : 0); }

    wstring& assign(const char16_t* s, size_t n) {
        if (n == 0) {
            tidy();
            return *this;
        }
        auto* p = static_cast<char16_t*>(::operator new((n + 2) * sizeof(char16_t)));
        p[0] = 0;  // header; its high byte is the refcount (one owner)
        std::memmove(p + 1, s, n * sizeof(char16_t));
        p[n + 1] = 0;
        tidy();
        ptr_ = p + 1;
        len_ = res_ = static_cast<uint32_t>(n);
        return *this;
    }

    const char16_t* c_str() const { return ptr_ ? ptr_ : u""; }
    size_t size() const { return len_; }
    bool empty() const { return len_ == 0; }
    operator std::u16string_view() const { return {c_str(), len_}; }
    bool operator==(std::u16string_view s) const { return std::u16string_view(*this) == s; }
    bool operator!=(std::u16string_view s) const { return !(*this == s); }
    void swap(wstring& o) {
        std::swap(ptr_, o.ptr_);
        std::swap(len_, o.len_);
        std::swap(res_, o.res_);
    }

private:
    void tidy() {
        if (ptr_)
            ::operator delete(ptr_ - 1);
        ptr_ = nullptr;
        len_ = res_ = 0;
    }
    [[maybe_unused]] uint8_t alloc_ = 0;  // the allocator object
    char16_t* ptr_ = nullptr;
    uint32_t len_ = 0;
    uint32_t res_ = 0;
};

template <class T>
class list {
    struct Node {
        Node* next;
        Node* prev;
        T value;
    };

public:
    class iterator {
    public:
        using iterator_category = std::bidirectional_iterator_tag;
        using value_type = T;
        using difference_type = std::ptrdiff_t;
        using pointer = T*;
        using reference = T&;
        iterator(Node* n = nullptr) : n_(n) {}
        T& operator*() const { return n_->value; }
        T* operator->() const { return &n_->value; }
        // @yo2 0x0062a850 list<CTask*>::iterator::operator++(int)
        iterator operator++(int) {
            iterator t = *this;
            n_ = n_->next;
            return t;
        }
        iterator& operator++() {
            n_ = n_->next;
            return *this;
        }
        iterator& operator--() {
            n_ = n_->prev;
            return *this;
        }
        iterator operator--(int) {
            iterator t = *this;
            n_ = n_->prev;
            return t;
        }
        bool operator==(iterator o) const { return n_ == o.n_; }
        bool operator!=(iterator o) const { return n_ != o.n_; }

    private:
        friend class list;
        Node* n_;
    };
    using reverse_iterator = std::reverse_iterator<iterator>;

    list() {
        head_ = static_cast<Node*>(::operator new(sizeof(Node)));  // the sentinel's value is never constructed
        head_->next = head_->prev = head_;
    }
    list(const list&) = delete;
    list& operator=(const list&) = delete;
    // @yo2 0x0062a7e0 list<CTask*>::~list
    // @yo2 0x0062a870 list<CTaskPtrBase*>::~list
    ~list() {
        clear();
        ::operator delete(head_);
    }

    iterator begin() const { return iterator(head_->next); }
    iterator end() const { return iterator(head_); }
    reverse_iterator rbegin() const { return reverse_iterator(end()); }
    reverse_iterator rend() const { return reverse_iterator(begin()); }
    size_t size() const { return size_; }
    bool empty() const { return size_ == 0; }
    T& front() const { return head_->next->value; }
    T& back() const { return head_->prev->value; }

    iterator insert(iterator pos, const T& v) {
        Node* at = pos.n_;
        Node* n = static_cast<Node*>(::operator new(sizeof(Node)));
        n->next = at;
        n->prev = at->prev;
        at->prev = n;
        n->prev->next = n;
        new (&n->value) T(v);
        ++size_;
        return iterator(n);
    }
    void push_back(const T& v) { insert(end(), v); }
    void push_front(const T& v) { insert(begin(), v); }
    // @yo2 0x0062a900 list<CTask*>::erase
    // @yo2 0x0062a950 list<CTaskPtrBase*>::erase
    iterator erase(iterator it) {
        Node* n = it.n_;
        Node* next = n->next;
        n->prev->next = n->next;
        n->next->prev = n->prev;
        n->value.~T();
        ::operator delete(n);
        --size_;
        return iterator(next);
    }
    void remove(const T& v) {
        for (iterator it = begin(); it != end();)
            it = *it == v ? erase(it) : ++it;
    }
    void clear() {
        for (iterator it = begin(); it != end();)
            it = erase(it);
    }

private:
    [[maybe_unused]] uint8_t alloc_ = 0;  // the allocator object
    Node* head_;
    uint32_t size_ = 0;
};

// Pointer-sized PODs only (all the exe keeps in these), so growth is a plain copy.
template <class T>
class vector {
    static_assert(std::is_trivially_copyable<T>::value, "vc6::vector holds PODs");

public:
    vector() = default;
    vector(const vector&) = delete;
    vector& operator=(const vector&) = delete;
    ~vector() { ::operator delete(first_); }

    T* begin() const { return first_; }
    T* end() const { return last_; }
    // @yo2 0x0062a9a0 vector<CTask*>::size
    size_t size() const { return first_ ? static_cast<size_t>(last_ - first_) : 0; }
    bool empty() const { return size() == 0; }
    T& operator[](size_t i) const { return first_[i]; }
    void clear() { last_ = first_; }

    // Growth matches VC6's insert(end(), 1, v): capacity becomes size + max(size, 1).
    // @yo2 0x0062aa10 uninitialized_fill_n<CTask**>
    // @yo2 0x0062aa50 construct<CTask*>
    // @yo2 0x0062a8e0 destroy<CTask**> (empty for PODs)
    void push_back(const T& v) {
        if (last_ == end_) {
            size_t n = size();
            size_t cap = n + (n < 1 ? 1 : n);
            T* p = static_cast<T*>(::operator new(cap * sizeof(T)));
            T* e = uninitializedCopy(first_, last_, p);
            ::operator delete(first_);
            first_ = p;
            last_ = e;
            end_ = p + cap;
        }
        *last_++ = v;
    }
    T* erase(T* it) {
        std::memmove(it, it + 1, (last_ - it - 1) * sizeof(T));
        --last_;
        return it;
    }

    // @yo2 0x0062a9d0 uninitialized_copy<CTask**>
    static T* uninitializedCopy(const T* from, const T* to, T* out) {
        for (; from != to; ++from, ++out)
            *out = *from;
        return out;
    }

private:
    [[maybe_unused]] uint8_t alloc_ = 0;  // the allocator object
    T* first_ = nullptr;
    T* last_ = nullptr;
    T* end_ = nullptr;
};

// VC6's std::map is a red-black tree whose leaves all point at one ref-counted static nil node per instantiation,
// so exe code can only walk trees whose nil is the exe's own. Matching that buys nothing, so only the 16-byte
// footprint {allocator, key_compare, head, multi, size} is kept and the tree is a std::map behind the head slot.
// ponytail: not exe-memory compatible; write a real VC6 _Tree if a diff test ever needs to walk one.
template <class K, class V>
class map {
public:
    using impl = std::map<K, V>;
    map() : tree_(new impl) {}
    map(const map&) = delete;
    map& operator=(const map&) = delete;
    ~map() { delete tree_; }

    V& operator[](const K& k) {
        V& v = (*tree_)[k];
        size_ = static_cast<uint32_t>(tree_->size());
        return v;
    }
    const V* find(const K& k) const {
        auto it = tree_->find(k);
        return it == tree_->end() ? nullptr : &it->second;
    }
    void erase(const K& k) {
        tree_->erase(k);
        size_ = static_cast<uint32_t>(tree_->size());
    }
    void clear() {
        tree_->clear();
        size_ = 0;
    }
    size_t size() const { return size_; }
    bool empty() const { return size_ == 0; }
    typename impl::const_iterator begin() const { return tree_->begin(); }
    typename impl::const_iterator end() const { return tree_->end(); }

private:
    [[maybe_unused]] uint8_t alloc_ = 0;
    [[maybe_unused]] uint8_t comp_ = 0;
    impl* tree_;
    [[maybe_unused]] bool multi_ = false;
    uint32_t size_ = 0;
};

// VC6's std::deque: {allocator, first iterator (4 words), last iterator (4 words), map, map size, size}, 48 bytes,
// 4 KB blocks. The game only uses it as a stack, so a std::vector sits behind the footprint.
// ponytail: footprint only, like map.
template <class T>
class deque {
public:
    deque() : v_(new std::vector<T>) {}
    deque(const deque&) = delete;
    deque& operator=(const deque&) = delete;
    ~deque() { delete v_; }
    void push_back(const T& x) {
        v_->push_back(x);
        size_ = static_cast<uint32_t>(v_->size());
    }
    void pop_back() {
        v_->pop_back();
        size_ = static_cast<uint32_t>(v_->size());
    }
    T& back() const { return v_->back(); }
    size_t size() const { return size_; }
    bool empty() const { return size_ == 0; }

private:
    [[maybe_unused]] uint8_t alloc_ = 0;
    std::vector<T>* v_;
    [[maybe_unused]] uint32_t unused_[9] = {};
    uint32_t size_ = 0;
};

}  // namespace vc6

static_assert(sizeof(void*) != 4 || sizeof(vc6::map<int, int>) == 16, "sizeof vc6::map");
static_assert(sizeof(void*) != 4 || sizeof(vc6::deque<int>) == 48, "sizeof vc6::deque");
YO2_SIZEOF(vc6::string, 16);
YO2_SIZEOF(vc6::wstring, 16);
YO2_SIZEOF(vc6::list<void*>, 12);
YO2_SIZEOF(vc6::vector<void*>, 16);
