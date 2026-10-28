// std::vector<T> as MSVC 6 lays it out ({allocator byte, first, last, end}, 16 bytes), for the element types
// System's vc6::vector (PODs only) can't hold: strings, action data, button records. Growth follows VC6's
// insert(end(), 1, v): the capacity becomes size + max(size, 1).
#pragma once
#include <cstddef>
#include <cstdint>
#include <new>
#include <utility>

#include "System/vc6.h"

template <class T>
class SwfVec {
public:
    SwfVec() = default;
    SwfVec(const SwfVec& o) {
        for (const T& v : o) push_back(v);
    }
    SwfVec& operator=(const SwfVec& o) {
        if (this != &o) {
            clear();
            for (const T& v : o) push_back(v);
        }
        return *this;
    }
    ~SwfVec() {
        clear();
        ::operator delete(first_);
    }

    T* begin() const { return first_; }
    T* end() const { return last_; }
    size_t size() const { return first_ ? static_cast<size_t>(last_ - first_) : 0; }
    bool empty() const { return size() == 0; }
    T& operator[](size_t i) const { return first_[i]; }
    T& back() const { return last_[-1]; }

    void push_back(const T& v) {
        if (last_ == end_) {
            size_t n = size();
            size_t cap = n + (n < 1 ? 1 : n);
            T* p = static_cast<T*>(::operator new(cap * sizeof(T)));
            T* e = p;
            for (T* it = first_; it != last_; ++it, ++e) new (e) T(*it);
            new (e) T(v);   // before destroying the old elements: v may live in them
            for (T* it = first_; it != last_; ++it) it->~T();
            ::operator delete(first_);
            first_ = p;
            last_ = e + 1;
            end_ = p + cap;
            return;
        }
        new (last_++) T(v);
    }
    void clear() {
        for (T* it = first_; it != last_; ++it) it->~T();
        last_ = first_;
    }

private:
    [[maybe_unused]] uint8_t alloc_ = 0;  // the allocator object
    T* first_ = nullptr;
    T* last_ = nullptr;
    T* end_ = nullptr;
};
YO2_SIZEOF(SwfVec<int>, 16);
