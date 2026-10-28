#include "Swf/yo2SwfActionScript.h"

#include "System/yo2Debug.h"

// ---------------------------------------------------------------- records

// @yo2 0x00665b30 CSwfACTIONRECORD::CSwfACTIONRECORD
CSwfACTIONRECORD::CSwfACTIONRECORD(int32_t type, const vc6::string& localLabel)
    : type(type), localLabel(localLabel) {}

// @yo2 0x00665ce0 CSwfACTIONRECORD deleting destructor
// @yo2 0x00665d10 CSwfACTIONRECORD::~CSwfACTIONRECORD
CSwfACTIONRECORD::~CSwfACTIONRECORD() {}

// @yo2 0x006664e0 CSwfAR_ActionDefineFunction::CSwfAR_ActionDefineFunction
CSwfAR_ActionDefineFunction::CSwfAR_ActionDefineFunction(const vc6::string& localLabel, const vc6::string& name,
                                                         const vc6::string& codeSize)
    : CSwfACTIONRECORD(SWF_ACT_DEFINE_FUNCTION, localLabel), name(name), codeSize(codeSize) {}

// @yo2 0x006665f0 CSwfAR_ActionDefineFunction deleting destructor
// @yo2 0x00666620 CSwfAR_ActionDefineFunction::~CSwfAR_ActionDefineFunction
CSwfAR_ActionDefineFunction::~CSwfAR_ActionDefineFunction() {}

// @yo2 0x00666170 CSwfAR_ActionConstantPool::CSwfAR_ActionConstantPool
CSwfAR_ActionConstantPool::CSwfAR_ActionConstantPool(const vc6::string& localLabel, const SwfVec<vc6::string>& pool)
    : CSwfACTIONRECORD(SWF_ACT_CONSTANT_POOL, localLabel), pool(pool) {}

// @yo2 0x006663e0 CSwfAR_ActionConstantPool deleting destructor
// @yo2 0x00666410 CSwfAR_ActionConstantPool::~CSwfAR_ActionConstantPool
CSwfAR_ActionConstantPool::~CSwfAR_ActionConstantPool() {}

// @yo2 0x00665d80 CSwfAR_ActionPush::CSwfAR_ActionPush
// @yo2 0x00665fe0 char_traits<char>::assign (the terminator of each copied string)
CSwfAR_ActionPush::CSwfAR_ActionPush(const vc6::string& localLabel, const SwfVec<CSwfACTIONDATA>& data)
    : CSwfACTIONRECORD(SWF_ACT_PUSH, localLabel), data(data) {}

// @yo2 0x00666000 CSwfAR_ActionPush deleting destructor
// @yo2 0x00666030 CSwfAR_ActionPush::~CSwfAR_ActionPush
CSwfAR_ActionPush::~CSwfAR_ActionPush() {}

// @yo2 0x00666730 CSwfAR_ActionGotoLabel::CSwfAR_ActionGotoLabel
CSwfAR_ActionGotoLabel::CSwfAR_ActionGotoLabel(const vc6::string& localLabel, const vc6::string& label)
    : CSwfACTIONRECORD(SWF_ACT_GOTO_LABEL, localLabel), label(label) {}

// @yo2 0x006668f0 CSwfAR_ActionGotoLabel deleting destructor
// @yo2 0x00666920 CSwfAR_ActionGotoLabel::~CSwfAR_ActionGotoLabel
CSwfAR_ActionGotoLabel::~CSwfAR_ActionGotoLabel() {}

// ---------------------------------------------------------------- CSwfACTIONRECORDARRAY

// @yo2 0x006665c0 CSwfACTIONRECORDARRAY deleting destructor
// @yo2 0x006669c0 CSwfACTIONRECORDARRAY::~CSwfACTIONRECORDARRAY
// @yo2 0x00667330 destroy one CSwfACTIONRECORD* (virtual delete, then null the slot)
CSwfACTIONRECORDARRAY::~CSwfACTIONRECORDARRAY() {
    for (CSwfACTIONRECORD*& r : records) {
        delete r;
        r = nullptr;
    }
}

// The exe asserts (with an empty message) if `new` returned null; ours throws instead.
// @yo2 0x0066b200 vector<CSwfACTIONRECORD*>::insert(end, 1, record)

// @yo2 0x00666fa0 CSwfACTIONRECORDARRAY::addDefineFunction
void CSwfACTIONRECORDARRAY::addDefineFunction(const vc6::string& localLabel, const vc6::string& name,
                                              const vc6::string& codeSize) {
    records.push_back(new CSwfAR_ActionDefineFunction(localLabel, name, codeSize));
}

// @yo2 0x00666c20 CSwfACTIONRECORDARRAY::addConstantPool
void CSwfACTIONRECORDARRAY::addConstantPool(const vc6::string& localLabel, const SwfVec<vc6::string>& pool) {
    records.push_back(new CSwfAR_ActionConstantPool(localLabel, pool));
}

// @yo2 0x00666a60 CSwfACTIONRECORDARRAY::addPush
void CSwfACTIONRECORDARRAY::addPush(const vc6::string& localLabel, const SwfVec<CSwfACTIONDATA>& data) {
    records.push_back(new CSwfAR_ActionPush(localLabel, data));
}

// @yo2 0x00666de0 CSwfACTIONRECORDARRAY::addGotoLabel
void CSwfACTIONRECORDARRAY::addGotoLabel(const vc6::string& localLabel, const vc6::string& label) {
    records.push_back(new CSwfAR_ActionGotoLabel(localLabel, label));
}

// @yo2 0x00667170 CSwfACTIONRECORDARRAY::add: a record with no operands (Pop, GetMember, Stop, End, ...)
void CSwfACTIONRECORDARRAY::add(int32_t type, const vc6::string& localLabel) {
    records.push_back(new CSwfACTIONRECORD(type, localLabel));
}
