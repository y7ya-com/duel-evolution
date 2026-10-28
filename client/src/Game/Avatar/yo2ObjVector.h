// MSVC6 std::vector<T> for a T with a constructor/destructor (vc6::vector holds PODs only). Like vc6::map, only the
// 16-byte footprint {allocator, first, last, end} is the exe's; the elements live in a std::vector behind `first`.
// TODO(System): replace with a vc6::vector that takes class types.
#pragma once
#include <cstdint>
#include <vector>

#include "System/vc6.h"

template <class T>
class ObjVector {
public:
    ObjVector() = default;
    ObjVector(const ObjVector& o) : v_(o.v_ ? new std::vector<T>(*o.v_) : nullptr) {}
    ObjVector& operator=(const ObjVector& o) {
        if (this != &o) {
            if (!o.v_ || o.v_->empty())
                clear();
            else if (v_)
                *v_ = *o.v_;
            else
                v_ = new std::vector<T>(*o.v_);
        }
        return *this;
    }
    ~ObjVector() { delete v_; }

    T* begin() const { return v_ ? v_->data() : nullptr; }
    T* end() const { return v_ ? v_->data() + v_->size() : nullptr; }
    size_t size() const { return v_ ? v_->size() : 0; }
    bool empty() const { return size() == 0; }
    T& operator[](size_t i) const { return (*v_)[i]; }
    void push_back(const T& x) {
        if (!v_)
            v_ = new std::vector<T>;
        v_->push_back(x);
    }
    void clear() {
        delete v_;
        v_ = nullptr;
    }

private:
    [[maybe_unused]] uint8_t alloc_ = 0;
    std::vector<T>* v_ = nullptr;
    [[maybe_unused]] void* last_ = nullptr;
    [[maybe_unused]] void* end_ = nullptr;
};
YO2_SIZEOF(ObjVector<int>, 16);
