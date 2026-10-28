// yo2SwfActionScript: the ActionScript records a Flash dump carries (DoAction tags, button conditions, functions).
// The reader (yo2SwfReader.cpp) builds them from the text dump; CSwfACTIONRECORDPlayer runs them.
//
// Record types are the game's own numbering, not Flash action codes. Only these are parsed: everything else in a
// dump ("ActionPlay", "ActionGotoFrame", ...) prints "未対応のAction" and is dropped by the reader.
#pragma once
#include <cstdint>

#include "Swf/yo2SwfVec.h"
#include "System/vc6.h"

enum SwfActionType : int32_t {
    SWF_ACT_DEFINE_FUNCTION = 0,
    SWF_ACT_CONSTANT_POOL = 1,
    SWF_ACT_PUSH = 2,
    SWF_ACT_POP = 3,
    SWF_ACT_GET_VARIABLE = 4,
    SWF_ACT_GET_MEMBER = 5,
    SWF_ACT_SET_MEMBER = 6,
    SWF_ACT_STOP = 7,
    SWF_ACT_CALL_METHOD = 8,
    SWF_ACT_SUBTRACT = 10,
    SWF_ACT_GOTO_LABEL = 13,
    SWF_ACT_END = 14,
};

// One value of an ActionPush (SWF::Element::ACTIONDATA::Integer / String / Lookup).
struct CSwfACTIONDATA {
    enum : int32_t { INTEGER = 0, STRING = 1, LOOKUP = 2 };
    // defaults: the reader's template (0x680930); each value it reads only overwrites its own field and the type
    int32_t type = 4;      // 0x00
    int32_t integer = -1;  // 0x04 Integer value
    vc6::string str;       // 0x08 String value, quotes stripped
    int32_t lookup = -1;   // 0x18 Lookup: index into the ActionConstantPool
    int32_t unused = 0;    // 0x1c
};
YO2_AT(CSwfACTIONDATA, str, 0x08);
YO2_AT(CSwfACTIONDATA, lookup, 0x18);
YO2_SIZEOF(CSwfACTIONDATA, 0x20);

class CSwfACTIONRECORD {
public:
    CSwfACTIONRECORD(int32_t type, const vc6::string& localLabel);
    virtual ~CSwfACTIONRECORD();

    int32_t type;            // 0x04 SwfActionType
    vc6::string localLabel;  // 0x08 the dump's LocalLabel, quotes stripped (a jump target)
};
YO2_AT(CSwfACTIONRECORD, type, 0x04);
YO2_AT(CSwfACTIONRECORD, localLabel, 0x08);
YO2_SIZEOF(CSwfACTIONRECORD, 0x18);

class CSwfACTIONRECORDARRAY {
public:
    CSwfACTIONRECORDARRAY() = default;
    virtual ~CSwfACTIONRECORDARRAY();
    CSwfACTIONRECORDARRAY(const CSwfACTIONRECORDARRAY&) = delete;
    CSwfACTIONRECORDARRAY& operator=(const CSwfACTIONRECORDARRAY&) = delete;

    void addDefineFunction(const vc6::string& localLabel, const vc6::string& name, const vc6::string& codeSize);
    void addConstantPool(const vc6::string& localLabel, const SwfVec<vc6::string>& pool);
    void addPush(const vc6::string& localLabel, const SwfVec<CSwfACTIONDATA>& data);
    void addGotoLabel(const vc6::string& localLabel, const vc6::string& label);
    void add(int32_t type, const vc6::string& localLabel);

    vc6::vector<CSwfACTIONRECORD*> records;   // 0x04
};
YO2_AT(CSwfACTIONRECORDARRAY, records, 0x04);
YO2_SIZEOF(CSwfACTIONRECORDARRAY, 0x14);

class CSwfAR_ActionDefineFunction : public CSwfACTIONRECORD {
public:
    CSwfAR_ActionDefineFunction(const vc6::string& localLabel, const vc6::string& name, const vc6::string& codeSize);
    ~CSwfAR_ActionDefineFunction() override;

    vc6::string name;                // 0x18
    vc6::string codeSize;            // 0x28
    CSwfACTIONRECORDARRAY body;      // 0x38 filled by the actions that follow, up to CodeSize
};
YO2_AT(CSwfAR_ActionDefineFunction, name, 0x18);
YO2_AT(CSwfAR_ActionDefineFunction, codeSize, 0x28);
YO2_AT(CSwfAR_ActionDefineFunction, body, 0x38);
YO2_SIZEOF(CSwfAR_ActionDefineFunction, 0x4c);

class CSwfAR_ActionConstantPool : public CSwfACTIONRECORD {
public:
    CSwfAR_ActionConstantPool(const vc6::string& localLabel, const SwfVec<vc6::string>& pool);
    ~CSwfAR_ActionConstantPool() override;

    SwfVec<vc6::string> pool;   // 0x18
};
YO2_AT(CSwfAR_ActionConstantPool, pool, 0x18);
YO2_SIZEOF(CSwfAR_ActionConstantPool, 0x28);

class CSwfAR_ActionPush : public CSwfACTIONRECORD {
public:
    CSwfAR_ActionPush(const vc6::string& localLabel, const SwfVec<CSwfACTIONDATA>& data);
    ~CSwfAR_ActionPush() override;

    SwfVec<CSwfACTIONDATA> data;   // 0x18
};
YO2_AT(CSwfAR_ActionPush, data, 0x18);
YO2_SIZEOF(CSwfAR_ActionPush, 0x28);

class CSwfAR_ActionGotoLabel : public CSwfACTIONRECORD {
public:
    CSwfAR_ActionGotoLabel(const vc6::string& localLabel, const vc6::string& label);
    ~CSwfAR_ActionGotoLabel() override;

    vc6::string label;   // 0x18
};
YO2_AT(CSwfAR_ActionGotoLabel, label, 0x18);
YO2_SIZEOF(CSwfAR_ActionGotoLabel, 0x28);
