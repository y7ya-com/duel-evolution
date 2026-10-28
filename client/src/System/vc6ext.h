// One more VC6-footprint container next to vc6.h's, for the text code:
//   vc6::objvector<T>  16 bytes: std::vector for elements that aren't PODs (vc6::vector's limit). Footprint only,
//                      like vc6::map: a std::vector sits behind the second word.
// ponytail: candidates for vc6.h once another folder needs them.
#pragma once
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "vc6.h"

namespace vc6 {

template <class T>
class objvector {
public:
    objvector() : v_(new std::vector<T>) {}
    objvector(const objvector& o) : v_(new std::vector<T>(*o.v_)) {}
    objvector& operator=(const objvector& o) {
        if (this != &o)
            *v_ = *o.v_;
        return *this;
    }
    ~objvector() { delete v_; }

    std::vector<T>& vec() { return *v_; }
    const std::vector<T>& vec() const { return *v_; }
    size_t size() const { return v_->size(); }
    bool empty() const { return v_->empty(); }
    T& operator[](size_t i) { return (*v_)[i]; }
    const T& operator[](size_t i) const { return (*v_)[i]; }
    T& back() { return v_->back(); }
    const T& back() const { return v_->back(); }
    void push_back(const T& x) { v_->push_back(x); }
    void pop_back() { v_->pop_back(); }
    void clear() { v_->clear(); }
    typename std::vector<T>::iterator begin() { return v_->begin(); }
    typename std::vector<T>::iterator end() { return v_->end(); }
    typename std::vector<T>::const_iterator begin() const { return v_->begin(); }
    typename std::vector<T>::const_iterator end() const { return v_->end(); }

private:
    [[maybe_unused]] uint8_t alloc_ = 0;
    std::vector<T>* v_;
    [[maybe_unused]] uint32_t unused_[2] = {};
};

}  // namespace vc6

YO2_SIZEOF(vc6::wstring, 16);
YO2_SIZEOF(vc6::objvector<int>, 16);
