// The VC6 template instances the linker left in 0x00a60000..0x00b3ffff (game-b's range): one copy per object file of
// the same CTaskPtr<T> / vector<T> / list<T> inlines. They carry no logic of their own; System/yo2TaskPtr.h and the
// vc6 containers are the C++ that replaces them, so the markers sit here as a list.

// CTaskPtr<T>::CTaskPtr() (base ctor 0x004057ef, then the T's vtable):
//   @yo2 0x00aca820 @yo2 0x00aca980 @yo2 0x00acbce0 @yo2 0x00acbe60 @yo2 0x00acc100 @yo2 0x00acc3d0
//   @yo2 0x00acc670 @yo2 0x00acc910
// CTaskPtr<T>::operator!:
//   @yo2 0x00acbd10 @yo2 0x00acc940
// CTaskPtr<T>::operator!=(T*):
//   @yo2 0x00aca9b0 @yo2 0x00acbd80 @yo2 0x00acbe20 @yo2 0x00acbe90 @yo2 0x00acc130 @yo2 0x00acc400
//   @yo2 0x00acc6a0 @yo2 0x00acc9b0
// CTaskPtr<T>::operator==(T*):
//   @yo2 0x00acbd40 @yo2 0x00acc970
// CTaskPtr<T>::get (dynamic_cast, result in EAX):
//   @yo2 0x00aa7fb0 @yo2 0x00acc3a0
// vector<T*>::operator[]:
//   @yo2 0x00acbdc0 @yo2 0x00acbde0 @yo2 0x00acbe00
// list<Rec> of 0x1d8c-byte trivially copyable records, used only by FUN_00a9eec0: end(), begin(), push_back
// (node 0x1d94, rep movs 0x763 dwords), clear() (no element destructors), iterator operator--(int):
//   @yo2 0x00aca850 @yo2 0x00aca870 @yo2 0x00aca890 @yo2 0x00aca910 @yo2 0x00aca960
// CTaskPtr<CShopConfirmWindow> deleting destructor:
//   @yo2 0x00b02530
