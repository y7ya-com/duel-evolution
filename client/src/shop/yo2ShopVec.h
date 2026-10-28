// The shop's MSVC6 std::vector instances, with the exe's 16-byte layout {allocator, first, last, end} and the exe's
// growth (insert of n: capacity becomes size + max(size, n)). Only for PODs (ShopItem, ShopCartLine): elements are
// copied as raw words, as the exe's instances do. The template bodies stand for the exe's out-of-line copies listed
// at each function; header-only, so the difftest links them without the rest of the shop.
#pragma once
#include <cstdint>
#include <cstring>
#include <new>
#include <string>
#include <vector>
#include <type_traits>

#include "System/vc6.h"

// The item lines (std::vector<ShopItem>, 0x14 bytes) and cart lines (std::vector<ShopCartLine>, 0x1c bytes).
template <class T>
class ShopVec {
    static_assert(std::is_trivially_copyable<T>::value, "ShopVec holds PODs");

public:
    ShopVec() = default;
    // @yo2 0x00b01600 vector<ShopItem>::vector(const allocator&)
    // @yo2 0x00b014a0 vector<ShopCartLine>::vector(const allocator&)
    explicit ShopVec(const uint8_t& alloc) : alloc_(alloc) {}
    // @yo2 0x00b014d0 vector<ShopCartLine>::vector(const vector&): capacity = size
    ShopVec(const ShopVec& o) : alloc_(o.alloc_) {
        size_t n = o.size();
        first_ = static_cast<T*>(::operator new(n * sizeof(T)));
        last_ = end_ = copy(o.first_, o.last_, first_);
    }
    ShopVec& operator=(const ShopVec& o) {
        if (this != &o)
            assign(o.first_, o.last_);
        return *this;
    }
    ~ShopVec() { ::operator delete(first_); }

    T* begin() const { return first_; }
    T* end() const { return last_; }
    // (the exe's out-of-line size() copies are Pack's 0x859680 and Net's 0x6b0110)
    size_t size() const { return first_ ? static_cast<size_t>(last_ - first_) : 0; }
    // @yo2 0x00b02a30 vector<ShopItem>::capacity
    // @yo2 0x00b029a0 vector<ShopCartLine>::capacity
    size_t capacity() const { return first_ ? static_cast<size_t>(end_ - first_) : 0; }
    bool empty() const { return size() == 0; }
    T& operator[](size_t i) const { return first_[i]; }
    // @yo2 0x00b01630 vector<ShopItem>::at (out of range: _Xran, "invalid vector<T> subscript" 0xb02ac0)
    T& at(size_t i) const;

    // @yo2 0x00b01590 vector<ShopCartLine>::clear
    // @yo2 0x00b01680 vector<ShopItem>::clear
    void clear() { last_ = first_; }

    // @yo2 0x00b02a70 vector<ShopItem>::erase(first, last)
    // @yo2 0x00b029e0 vector<ShopCartLine>::erase(first, last)
    T* erase(T* from, T* to) {
        T* out = from;
        for (T* p = to; p != last_; ++p, ++out)
            *out = *p;
        last_ = out;
        return from;
    }

    // operator= (inlined into the exe's callers, e.g. CShopWindowBase::setItems 0xae5840): reuse the storage when
    // it is big enough, else reallocate to exactly the new size.
    void assign(const T* from, const T* to) {
        size_t n = static_cast<size_t>(to - from);
        if (n <= size()) {
            last_ = copy(from, to, first_);
        } else if (n <= capacity()) {
            const T* mid = from + size();
            copy(from, mid, first_);
            last_ = copy(mid, to, last_);
        } else {
            ::operator delete(first_);
            first_ = static_cast<T*>(::operator new(n * sizeof(T)));
            last_ = end_ = copy(from, to, first_);
        }
    }

    // @yo2 0x00b02be0 vector<ShopCartLine>::insert(pos, n, value)
    // (returns where the inserted run ends; the exe's is void and leaves a different EAX)
    T* insert(T* pos, size_t n, const T& v);
    void push_back(const T& v) { insert(last_, 1, v); }

    // @yo2 0x00b03930 copy<ShopCartLine*> (0x6b0170 / 0x6b05c0 are Net's copies of the same)
    // @yo2 0x00b038e0 copy<ShopItem*>
    // @yo2 0x00b03980 copy<ShopItem*> (a second instance)
    static T* copy(const T* from, const T* to, T* out) {
        for (; from != to; ++from, ++out)
            *out = *from;
        return out;
    }

private:
    [[maybe_unused]] uint8_t alloc_ = 0;
    T* first_ = nullptr;
    T* last_ = nullptr;
    T* end_ = nullptr;
};

[[noreturn]] void shopVecRangeError();  // std::_Xran("invalid vector<T> subscript") (0xb02ac0)

template <class T>
T& ShopVec<T>::at(size_t i) const {
    if (!first_ || size() <= i)
        shopVecRangeError();
    return first_[i];
}

template <class T>
T* ShopVec<T>::insert(T* pos, size_t n, const T& v) {
    T value = v;  // v may live in the vector
    if (static_cast<size_t>(end_ - last_) < n) {
        size_t size = this->size();
        size_t cap = size + (first_ && n < size ? size : n);
        T* p = static_cast<T*>(::operator new(cap * sizeof(T)));
        T* out = copy(first_, pos, p);
        for (size_t k = 0; k < n; ++k)
            out[k] = value;
        copy(pos, last_, out + n);
        ::operator delete(first_);
        first_ = p;
        last_ = p + size + n;
        end_ = p + cap;
        return last_;
    }
    size_t after = static_cast<size_t>(last_ - pos);
    if (after < n) {
        copy(pos, last_, pos + n);
        for (T* q = last_; q != pos + n; ++q)
            *q = value;
        for (T* q = pos; q != last_; ++q)
            *q = value;
        last_ += n;
        return last_;
    }
    if (n) {
        copy(last_ - n, last_, last_);
        for (T *src = last_ - n, *dst = last_; src != pos;)
            *--dst = *--src;
        for (T* q = pos; q != pos + n; ++q)
            *q = value;
        last_ += n;
    }
    return pos + n;
}

// The cart's lines as wide strings (std::vector<std::wstring>: the exe's 16-byte vector; the strings live in a
// std::vector behind the `first` slot, like vc6::map).
class ShopLineVec {
public:
    ShopLineVec() = default;
    ShopLineVec(const ShopLineVec&) = delete;
    ShopLineVec& operator=(const ShopLineVec&) = delete;
    ~ShopLineVec() { delete v_; }
    size_t size() const { return v_ ? v_->size() : 0; }
    const std::u16string& operator[](size_t i) const { return (*v_)[i]; }
    // @yo2 0x00b027f0 vector<wstring>::erase(first, last) (used as clear)
    void clear() {
        if (v_)
            v_->clear();
    }
    // @yo2 0x00b025f0 vector<wstring>::insert(end, s) (push_back)
    void push_back(std::u16string s) {
        if (!v_)
            v_ = new std::vector<std::u16string>;
        v_->push_back(std::move(s));
    }

private:
    [[maybe_unused]] uint8_t alloc_ = 0;
    std::vector<std::u16string>* v_ = nullptr;
    [[maybe_unused]] uint32_t unused_[2] = {};
};
YO2_SIZEOF(ShopLineVec, 0x10);
