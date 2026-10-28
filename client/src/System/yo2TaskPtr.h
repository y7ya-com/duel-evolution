// yo2TaskPtr.h: weak pointers to tasks.
//
// A CTaskPtr<T> registers itself with the task it points at (CTask::addUser). When that task is destroyed it calls
// onTaskDestroyed(): the pointer goes null and the pointer's owner (its "user", set once with setUser) gets a
// TM_DESTROYED message naming the dead task. get() asserts on a null or dead target, like the exe.
#pragma once
#include "yo2Debug.h"
#include "yo2Task.h"

class CTaskPtrBase {
public:
    // @yo2 0x006341a0 CTaskPtrBase::CTaskPtrBase
    CTaskPtrBase() = default;
    CTaskPtrBase(const CTaskPtrBase&) = delete;
    CTaskPtrBase& operator=(const CTaskPtrBase&) = delete;
    virtual ~CTaskPtrBase();
    virtual void onTaskDestroyed();
    void setUser(CTaskUser* user);
    CTask* task() const { return task_; }

protected:
    struct Layout;
    CTask* task_ = nullptr;      // 0x04
    CTaskUser* user_ = nullptr;  // 0x08 told when task_ dies
};
struct CTaskPtrBase::Layout {
    YO2_AT(CTaskPtrBase, task_, 0x04);
    YO2_AT(CTaskPtrBase, user_, 0x08);
};
YO2_SIZEOF(CTaskPtrBase, 0x0c);

// CTaskPtr<T> deleting destructor, one per instantiation (251 copies):
//   @yo2 0x0059a000 @yo2 0x0059a030 @yo2 0x005da370 @yo2 0x005da3a0
//   @yo2 0x005da3d0 @yo2 0x005da400 @yo2 0x005da430 @yo2 0x005da460
//   @yo2 0x005da490 @yo2 0x005da4c0 @yo2 0x005da4f0 @yo2 0x005da520
//   @yo2 0x005da550 @yo2 0x005da580 @yo2 0x005e0d90 @yo2 0x005ffa50
//   @yo2 0x005ffa80 @yo2 0x005ffab0 @yo2 0x005ffae0 @yo2 0x005ffb10
//   @yo2 0x005ffb40 @yo2 0x005ffb70 @yo2 0x005ffba0 @yo2 0x005ffbd0
//   @yo2 0x005ffc00 @yo2 0x005ffc30 @yo2 0x005ffc60 @yo2 0x005ffc90
//   @yo2 0x005ffcc0 @yo2 0x005ffcf0 @yo2 0x0060bff0 @yo2 0x0061e7c0
//   @yo2 0x0061e7f0 @yo2 0x0063d950 @yo2 0x0063d980 @yo2 0x0063d9b0
//   @yo2 0x0063ebc0 @yo2 0x00642460 @yo2 0x00646010 @yo2 0x0064b660
//   @yo2 0x0064b6b0 @yo2 0x0064d9e0 @yo2 0x0064da10 @yo2 0x0064da40
//   @yo2 0x0064da70 @yo2 0x0064daa0 @yo2 0x0064dad0 @yo2 0x0064db00
//   @yo2 0x00652c30 @yo2 0x00652c60 @yo2 0x00652c90 @yo2 0x00652cc0
//   @yo2 0x00653980 @yo2 0x006539b0 @yo2 0x00654720 @yo2 0x00660430
//   @yo2 0x00660460 @yo2 0x00660490 @yo2 0x00664730 @yo2 0x00689d10
//   @yo2 0x0069f500 @yo2 0x006a7650 @yo2 0x006a7680 @yo2 0x006d6bb0
//   @yo2 0x006e1660 @yo2 0x006e1690 @yo2 0x0076bf80 @yo2 0x0076bfb0
//   @yo2 0x0076bfe0 @yo2 0x0077f180 @yo2 0x0077f1b0 @yo2 0x0077f1e0
//   @yo2 0x0077f210 @yo2 0x00784fb0 @yo2 0x0079e660 @yo2 0x0079e690
//   @yo2 0x0079e6c0 @yo2 0x0079e6f0 @yo2 0x0079e720 @yo2 0x0079e780
//   @yo2 0x0079e7b0 @yo2 0x0079e7e0 @yo2 0x0079e810 @yo2 0x0079e840
//   @yo2 0x0079e870 @yo2 0x0079e8a0 @yo2 0x0079e8d0 @yo2 0x0079e900
//   @yo2 0x0079e930 @yo2 0x0079e960 @yo2 0x0079e990 @yo2 0x0079e9c0
//   @yo2 0x007d9680 @yo2 0x007ebbd0 @yo2 0x007f7cb0 @yo2 0x007fb540
//   @yo2 0x007fda40 @yo2 0x008034d0 @yo2 0x00803500 @yo2 0x00808d70
//   @yo2 0x00808da0 @yo2 0x00808dd0 @yo2 0x00815a50 @yo2 0x00822cd0
//   @yo2 0x00822d00 @yo2 0x0082ad70 @yo2 0x0082ada0 @yo2 0x0082add0
//   @yo2 0x0082ae00 @yo2 0x0082ae30 @yo2 0x0082f510 @yo2 0x0082f540
//   @yo2 0x0083e9d0 @yo2 0x0083ea00 @yo2 0x00846db0 @yo2 0x0084be90
//   @yo2 0x0084bec0 @yo2 0x00859750 @yo2 0x0085b290 @yo2 0x0085b2c0
//   @yo2 0x008830c0 @yo2 0x008830f0 @yo2 0x00883120 @yo2 0x00883150
//   @yo2 0x00883180 @yo2 0x008831b0 @yo2 0x008831e0 @yo2 0x00883210
//   @yo2 0x00883240 @yo2 0x00883270 @yo2 0x008832a0 @yo2 0x008832d0
//   @yo2 0x00883300 @yo2 0x00883330 @yo2 0x00883360 @yo2 0x00883390
//   @yo2 0x008a0880 @yo2 0x008b2f90 @yo2 0x008bcb10 @yo2 0x008c4b80
//   @yo2 0x008c4bb0 @yo2 0x008c4be0 @yo2 0x008c4c10 @yo2 0x008cccc0
//   @yo2 0x008d5c30 @yo2 0x008d5c60 @yo2 0x008d5c90 @yo2 0x008eaa10
//   @yo2 0x008eaa40 @yo2 0x008f06e0 @yo2 0x008f5530 @yo2 0x00903bd0
//   @yo2 0x00953b00 @yo2 0x00953b30 @yo2 0x00953b60 @yo2 0x00953b90
//   @yo2 0x00953bc0 @yo2 0x0097a180 @yo2 0x0097a1b0 @yo2 0x0097a1e0
//   @yo2 0x0097a210 @yo2 0x0097a240 @yo2 0x0097a270 @yo2 0x0097a2a0
//   @yo2 0x0097a2d0 @yo2 0x0097a300 @yo2 0x0097a330 @yo2 0x0097a360
//   @yo2 0x00981d90 @yo2 0x00981dc0 @yo2 0x0098dff0 @yo2 0x0098e020
//   @yo2 0x009bc390 @yo2 0x009bc3c0 @yo2 0x009bc3f0 @yo2 0x009bc420
//   @yo2 0x009bc450 @yo2 0x009bc480 @yo2 0x009bc4b0 @yo2 0x009bc4e0
//   @yo2 0x009c2e90 @yo2 0x009c6860 @yo2 0x009c6890 @yo2 0x009d4eb0
//   @yo2 0x009da690 @yo2 0x009e0fc0 @yo2 0x009f8980 @yo2 0x009f89b0
//   @yo2 0x00a03b80 @yo2 0x00a03bb0 @yo2 0x00a03be0 @yo2 0x00a0cd10
//   @yo2 0x00a25130 @yo2 0x00a25160 @yo2 0x00a25190 @yo2 0x00a251c0
//   @yo2 0x00a251f0 @yo2 0x00a25220 @yo2 0x00a25250 @yo2 0x00a25280
//   @yo2 0x00a252b0 @yo2 0x00a252e0 @yo2 0x00a2d0c0 @yo2 0x00a2d0f0
//   @yo2 0x00a2d120 @yo2 0x00a2d150 @yo2 0x00a34a20 @yo2 0x00a4bd80
//   @yo2 0x00a4bdb0 @yo2 0x00a4bde0 @yo2 0x00a5b990 @yo2 0x00a5b9c0
//   @yo2 0x00a5b9f0 @yo2 0x00a5ba20 @yo2 0x00a5ba50 @yo2 0x00a5ba80
//   @yo2 0x00a5bab0 @yo2 0x00a5bae0 @yo2 0x00a5bb10 @yo2 0x00a60790
//   @yo2 0x00acd990 @yo2 0x00acd9c0 @yo2 0x00acd9f0 @yo2 0x00acda20
//   @yo2 0x00acda50 @yo2 0x00acda80 @yo2 0x00acdab0 @yo2 0x00acdae0
//   @yo2 0x00acdb10 @yo2 0x00acdb40 @yo2 0x00acdb70 @yo2 0x00acdba0
//   @yo2 0x00acdbd0 @yo2 0x00acdc00 @yo2 0x00acdc30 @yo2 0x00acdc60
//   @yo2 0x00acdc90 @yo2 0x00acdcc0 @yo2 0x00acdcf0 @yo2 0x00acdd20
//   @yo2 0x00acdd50 @yo2 0x00adaa60 @yo2 0x00ae20d0 @yo2 0x00ae2100
//   @yo2 0x00b024d0 @yo2 0x00b02500 @yo2 0x00b02530 @yo2 0x00b02560
//   @yo2 0x00b02590 @yo2 0x00b025c0 @yo2 0x00b07400
template <class T>
class CTaskPtr : public CTaskPtrBase {
public:
    T* get() const;
    void set(T* task);
    T* operator->() const { return get(); }
    explicit operator bool() const { return task_ != nullptr; }
};

// CTaskPtr<T>::get (205 copies):
//   @yo2 0x00599700 @yo2 0x00599930 @yo2 0x00599b60 @yo2 0x00599dd0
//   @yo2 0x005d82a0 @yo2 0x005d84d0 @yo2 0x005d8740 @yo2 0x005d8970
//   @yo2 0x005d8ba0 @yo2 0x005d8e90 @yo2 0x005d90c0 @yo2 0x005d92f0
//   @yo2 0x005d9520 @yo2 0x005e0b60 @yo2 0x005fd6c0 @yo2 0x005fd8f0
//   @yo2 0x005fdb20 @yo2 0x005fdd50 @yo2 0x005fdf80 @yo2 0x005fe1b0
//   @yo2 0x005fe3e0 @yo2 0x005fe610 @yo2 0x005fe840 @yo2 0x005fea70
//   @yo2 0x005fed60 @yo2 0x005fef90 @yo2 0x005ff1c0 @yo2 0x005ff3f0
//   @yo2 0x005ff620 @yo2 0x0061e360 @yo2 0x0061e590 @yo2 0x006316f0
//   @yo2 0x0063d280 @yo2 0x0063d4b0 @yo2 0x0063d6e0 @yo2 0x0064d580
//   @yo2 0x0064d7b0 @yo2 0x006529a0 @yo2 0x0065ffd0 @yo2 0x00660200
//   @yo2 0x00689ae0 @yo2 0x006a71c0 @yo2 0x006a7420 @yo2 0x006e0d80
//   @yo2 0x006e1200 @yo2 0x006e1430 @yo2 0x0076b8f0 @yo2 0x0076bb20
//   @yo2 0x0076bd50 @yo2 0x0077ef50 @yo2 0x00784d80 @yo2 0x00786d50
//   @yo2 0x0078f060 @yo2 0x0079da30 @yo2 0x0079dc60 @yo2 0x0079dfa0
//   @yo2 0x0079e200 @yo2 0x0079e430 @yo2 0x007cf410 @yo2 0x007eb710
//   @yo2 0x007eb9a0 @yo2 0x007f7a80 @yo2 0x007fd810 @yo2 0x008032a0
//   @yo2 0x008086e0 @yo2 0x00808910 @yo2 0x00808b40 @yo2 0x00822820
//   @yo2 0x00822a50 @yo2 0x0082a240 @yo2 0x0082a470 @yo2 0x0082a6a0
//   @yo2 0x0082a8d0 @yo2 0x0082ab00 @yo2 0x0082eff0 @yo2 0x0082f2e0
//   @yo2 0x0083e500 @yo2 0x0083e7a0 @yo2 0x00846b80 @yo2 0x0084ba30
//   @yo2 0x0084bc60 @yo2 0x00859410 @yo2 0x0085ae30 @yo2 0x0085b060
//   @yo2 0x00880fc0 @yo2 0x008812a0 @yo2 0x008814d0 @yo2 0x00881700
//   @yo2 0x00881930 @yo2 0x00881b60 @yo2 0x00881d90 @yo2 0x00881fc0
//   @yo2 0x008821f0 @yo2 0x00882420 @yo2 0x00882650 @yo2 0x00882880
//   @yo2 0x00882ab0 @yo2 0x00882ce0 @yo2 0x008a04f0 @yo2 0x008b2d20
//   @yo2 0x008b5c80 @yo2 0x008c44f0 @yo2 0x008c4720 @yo2 0x008c4950
//   @yo2 0x008d55a0 @yo2 0x008d57d0 @yo2 0x008d5a00 @yo2 0x008ea460
//   @yo2 0x008ea690 @yo2 0x008f0480 @yo2 0x008f5300 @yo2 0x00903960
//   @yo2 0x00933690 @yo2 0x00953190 @yo2 0x009533c0 @yo2 0x009535f0
//   @yo2 0x00953820 @yo2 0x009782f0 @yo2 0x00978520 @yo2 0x00978750
//   @yo2 0x00978980 @yo2 0x00978bb0 @yo2 0x00978de0 @yo2 0x00979040
//   @yo2 0x00979270 @yo2 0x009794a0 @yo2 0x009796d0 @yo2 0x00979900
//   @yo2 0x00979b30 @yo2 0x00979d60 @yo2 0x00981af0 @yo2 0x009bb440
//   @yo2 0x009bb670 @yo2 0x009bb8a0 @yo2 0x009bbad0 @yo2 0x009bbd00
//   @yo2 0x009bbf30 @yo2 0x009bc160 @yo2 0x009c6190 @yo2 0x009c63c0
//   @yo2 0x009c65f0 @yo2 0x009d4b60 @yo2 0x009da340 @yo2 0x009e0d90
//   @yo2 0x009f84f0 @yo2 0x009f8750 @yo2 0x00a036a0 @yo2 0x00a038d0
//   @yo2 0x00a23530 @yo2 0x00a23760 @yo2 0x00a23990 @yo2 0x00a23bc0
//   @yo2 0x00a23df0 @yo2 0x00a241a0 @yo2 0x00a243d0 @yo2 0x00a24600
//   @yo2 0x00a24830 @yo2 0x00a24a60 @yo2 0x00a24c90 @yo2 0x00a24f00
//   @yo2 0x00a2c790 @yo2 0x00a2c9c0 @yo2 0x00a2cbf0 @yo2 0x00a2ce20
//   @yo2 0x00a347f0 @yo2 0x00a4b4c0 @yo2 0x00a4b6f0 @yo2 0x00a4b920
//   @yo2 0x00a4bb50 @yo2 0x00a5aa00 @yo2 0x00a5ac30 @yo2 0x00a5ae60
//   @yo2 0x00a5b090 @yo2 0x00a5b2c0 @yo2 0x00a5b4f0 @yo2 0x00a5b720
//   @yo2 0x00a60560 @yo2 0x00acaa50 @yo2 0x00acac80 @yo2 0x00acaeb0
//   @yo2 0x00acb0e0 @yo2 0x00acb310 @yo2 0x00acb580 @yo2 0x00acb7b0
//   @yo2 0x00acba60 @yo2 0x00acbed0 @yo2 0x00acc170 @yo2 0x00acc440
//   @yo2 0x00acc6e0 @yo2 0x00acc9f0 @yo2 0x00accc20 @yo2 0x00acced0
//   @yo2 0x00acd140 @yo2 0x00acd370 @yo2 0x00acd5a0 @yo2 0x00ada830
//   @yo2 0x00ae1c70 @yo2 0x00ae1ea0 @yo2 0x00b01720 @yo2 0x00b01980
//   @yo2 0x00b01c10 @yo2 0x00b01e40 @yo2 0x00b02070 @yo2 0x00b022a0
//   @yo2 0x00b07180
template <class T>
T* CTaskPtr<T>::get() const {
    T* p = dynamic_cast<T*>(task_);
    if (CTask::isValid(p))
        return p;
    YO2_ASSERT(task_ != nullptr, "NULL access\n");
    YO2_ASSERT(task_ == nullptr, "Wild Task\n");
    return nullptr;
}

// CTaskPtr<T>::set (125 copies):
//   @yo2 0x0059a600 @yo2 0x005dcef0 @yo2 0x005dd0c0 @yo2 0x005dd290
//   @yo2 0x005dd460 @yo2 0x005dd630 @yo2 0x005dd800 @yo2 0x005dd9d0
//   @yo2 0x005ddba0 @yo2 0x005ddd70 @yo2 0x005ddf30 @yo2 0x00600870
//   @yo2 0x00600a40 @yo2 0x00600c10 @yo2 0x00600de0 @yo2 0x00600fb0
//   @yo2 0x00601180 @yo2 0x00601350 @yo2 0x00601520 @yo2 0x006016f0
//   @yo2 0x006018c0 @yo2 0x00601a90 @yo2 0x0063d9e0 @yo2 0x0064f690
//   @yo2 0x006a76b0 @yo2 0x006a7880 @yo2 0x006e1f80 @yo2 0x00747210
//   @yo2 0x00784fe0 @yo2 0x0079f740 @yo2 0x0079f910 @yo2 0x0079fae0
//   @yo2 0x0079fcb0 @yo2 0x0079fe80 @yo2 0x007a0050 @yo2 0x007a0220
//   @yo2 0x007a03f0 @yo2 0x007a05c0 @yo2 0x007a0790 @yo2 0x007a0960
//   @yo2 0x007a0b30 @yo2 0x007ccfc0 @yo2 0x007ebc00 @yo2 0x00803530
//   @yo2 0x00803700 @yo2 0x0080f3c0 @yo2 0x0080f590 @yo2 0x00815a80
//   @yo2 0x0082b3e0 @yo2 0x0082b5b0 @yo2 0x0082b780 @yo2 0x0082ff00
//   @yo2 0x0083eb00 @yo2 0x0083ecd0 @yo2 0x00847140 @yo2 0x0084c330
//   @yo2 0x008597b0 @yo2 0x0085b310 @yo2 0x00883430 @yo2 0x00883600
//   @yo2 0x008837d0 @yo2 0x008839a0 @yo2 0x008b5eb0 @yo2 0x008c4c40
//   @yo2 0x008d5cc0 @yo2 0x008d5e90 @yo2 0x008d6060 @yo2 0x008d6230
//   @yo2 0x008eaa70 @yo2 0x008eac40 @yo2 0x008eae10 @yo2 0x008f0710
//   @yo2 0x008f5560 @yo2 0x00903c20 @yo2 0x00954050 @yo2 0x00954220
//   @yo2 0x0097ad20 @yo2 0x0097aef0 @yo2 0x0097b0c0 @yo2 0x0097b290
//   @yo2 0x0097b460 @yo2 0x0097b630 @yo2 0x0097b800 @yo2 0x0097b9d0
//   @yo2 0x00982250 @yo2 0x009bc510 @yo2 0x009bc6e0 @yo2 0x009bc8b0
//   @yo2 0x009bca80 @yo2 0x009bcc50 @yo2 0x009c2ec0 @yo2 0x009c68c0
//   @yo2 0x009c6a90 @yo2 0x009c6c60 @yo2 0x009da880 @yo2 0x009e0ff0
//   @yo2 0x009f8f40 @yo2 0x009f9110 @yo2 0x00a04430 @yo2 0x00a08be0
//   @yo2 0x00a2d1b0 @yo2 0x00a2d380 @yo2 0x00a4be10 @yo2 0x00a4bfe0
//   @yo2 0x00a4c1b0 @yo2 0x00a4c380 @yo2 0x00a5bc50 @yo2 0x00a5be20
//   @yo2 0x00a5bff0 @yo2 0x00a5c1c0 @yo2 0x00ad1240 @yo2 0x00ad1410
//   @yo2 0x00ad15e0 @yo2 0x00ad17b0 @yo2 0x00ad1980 @yo2 0x00ad1b50
//   @yo2 0x00ad1d20 @yo2 0x00ad1ef0 @yo2 0x00ad20c0 @yo2 0x00adaac0
//   @yo2 0x00b02fd0 @yo2 0x00b031a0 @yo2 0x00b03370 @yo2 0x00b03540
//   @yo2 0x00b03710
template <class T>
void CTaskPtr<T>::set(T* task) {
    YO2_ASSERT(user_ != nullptr, "CTaskPtrはUserをセットしてから使う");  // set the user before use
    if (dynamic_cast<T*>(task_))
        task_->removeUser(this);
    task_ = task;
    if (task)
        task_->addUser(this);
}
