#include "Swf/yo2SwfTag.h"

#include <cstring>

#include "System/yo2Debug.h"

// ---------------------------------------------------------------- CSwfDefTag and the defined characters

// @yo2 0x00682ba0 CSwfDefTag::CSwfDefTag
CSwfDefTag::CSwfDefTag(int32_t type, uint32_t characterId) : type(type), characterId(characterId) {}

// @yo2 0x00682bd0 CSwfDefTag deleting destructor
// @yo2 0x00682e60 CSwfDefTag::~CSwfDefTag (out-of-line copy)
CSwfDefTag::~CSwfDefTag() {}

// @yo2 0x00682c00 CSwfDefTag_DefineBitsLossless::CSwfDefTag_DefineBitsLossless
CSwfDefTag_DefineBitsLossless::CSwfDefTag_DefineBitsLossless(uint32_t characterId, int32_t fileName)
    : CSwfDefTag(SWF_DEF_BITS_LOSSLESS, characterId), fileName(fileName) {}

// @yo2 0x00682c40 CSwfDefTag_DefineBitsLossless deleting destructor
// @yo2 0x00682c70 CSwfDefTag_DefineBitsLossless::~CSwfDefTag_DefineBitsLossless
CSwfDefTag_DefineBitsLossless::~CSwfDefTag_DefineBitsLossless() {}

// @yo2 0x00682c90 CSwfDefTag_DefineShape::CSwfDefTag_DefineShape
CSwfDefTag_DefineShape::CSwfDefTag_DefineShape(uint32_t characterId, const SwfBounds& bounds, uint32_t bitmapId,
                                               const Mat4& bitmapMatrix)
    : CSwfDefTag(SWF_DEF_SHAPE, characterId), bitmapId(bitmapId), bounds(bounds), bitmapMatrix(bitmapMatrix) {}

// @yo2 0x00682d00 CSwfDefTag_DefineShape deleting destructor
// @yo2 0x00682d30 CSwfDefTag_DefineShape::~CSwfDefTag_DefineShape
CSwfDefTag_DefineShape::~CSwfDefTag_DefineShape() {}

// @yo2 0x00682dc0 CSwfDefTag_DefineSprite::CSwfDefTag_DefineSprite
CSwfDefTag_DefineSprite::CSwfDefTag_DefineSprite(uint32_t characterId, uint32_t frameCount)
    : CSwfDefTag(SWF_DEF_SPRITE, characterId), frameCount(frameCount) {}

// @yo2 0x00682e80 CSwfDefTag_DefineSprite deleting destructor
// @yo2 0x00682eb0 CSwfDefTag_DefineSprite::~CSwfDefTag_DefineSprite (the action array, then the timeline)
CSwfDefTag_DefineSprite::~CSwfDefTag_DefineSprite() {}

// @yo2 0x00682f20 CSwfDefTag_DefineButton2::CSwfDefTag_DefineButton2
CSwfDefTag_DefineButton2::CSwfDefTag_DefineButton2(uint32_t characterId)
    : CSwfDefTag(SWF_DEF_BUTTON2, characterId) {}

// @yo2 0x00682f90 CSwfDefTag_DefineButton2 deleting destructor
// @yo2 0x00682fc0 CSwfDefTag_DefineButton2::~CSwfDefTag_DefineButton2 (the conditions, then the record storage)
CSwfDefTag_DefineButton2::~CSwfDefTag_DefineButton2() {}

// @yo2 0x00683040 CSwfDefTag_DefineEditText::CSwfDefTag_DefineEditText
CSwfDefTag_DefineEditText::CSwfDefTag_DefineEditText(uint32_t characterId, const vc6::string& initialText)
    : CSwfDefTag(SWF_DEF_EDIT_TEXT, characterId), initialText(initialText) {}

// @yo2 0x00683200 CSwfDefTag_DefineEditText deleting destructor
// @yo2 0x00683230 CSwfDefTag_DefineEditText::~CSwfDefTag_DefineEditText
CSwfDefTag_DefineEditText::~CSwfDefTag_DefineEditText() {}

// ---------------------------------------------------------------- button condition actions

// @yo2 0x00682b70 CSwfBUTTONCONDACTIONARRAY deleting destructor
// @yo2 0x00682ab0 CSwfBUTTONCONDACTIONARRAY::~CSwfBUTTONCONDACTIONARRAY
CSwfBUTTONCONDACTIONARRAY::~CSwfBUTTONCONDACTIONARRAY() {
    for (CSwfBUTTONCONDACTION* c : conds) delete c;
}

// @yo2 0x00682880 CSwfBUTTONCONDACTIONARRAY::add: a new empty condition at the end
// @yo2 0x006858b0 uninitialized_copy<CSwfBUTTONCONDACTION**>
// @yo2 0x006858f0 uninitialized_fill_n<CSwfBUTTONCONDACTION**>
// @yo2 0x00685880 vector<CSwfBUTTONCONDACTION*>::size
// @yo2 0x006855c0 destroy<CSwfBUTTONCONDACTION**> (empty for pointers)
CSwfBUTTONCONDACTION* CSwfBUTTONCONDACTIONARRAY::add() {
    CSwfBUTTONCONDACTION* c = new CSwfBUTTONCONDACTION;
    conds.push_back(c);
    return c;
}

// ---------------------------------------------------------------- CSwfCharaDictionary

// @yo2 0x00670410 CSwfCharaDictionary deleting destructor
// @yo2 0x006832a0 CSwfCharaDictionary::~CSwfCharaDictionary
// @yo2 0x00684410 destroy one CSwfDefTag* (virtual delete, then null the slot)
// @yo2 0x00685540 vector<CSwfDefTag*> storage release
CSwfCharaDictionary::~CSwfCharaDictionary() {
    for (CSwfDefTag*& t : chars) {
        delete t;
        t = nullptr;
    }
}

// @yo2 0x00683380 CSwfCharaDictionary::get: the character with this ID, of this type (SWF_DEF_ANY: any type)
CSwfDefTag* CSwfCharaDictionary::get(uint32_t characterId, int32_t type) const {
    if (chars.size() < characterId) {
        YO2_ASSERT(false, "illegal CharacterID");
        return nullptr;
    }
    CSwfDefTag* t = chars[characterId - 1];   // ponytail: ID 0 reads slot -1, as in the exe; IDs start at 1
    if (t->characterId != characterId) {
        YO2_ASSERT(false, "Dictionary Error");
        return nullptr;
    }
    if (type == SWF_DEF_ANY || t->type == type) return t;
    YO2_ASSERT(false, "illegal Type");
    return nullptr;
}

// Every add appends; IDs come in order, so the new count must be the ID (the exe checks it after most adds).
// @yo2 0x006855e0 vector<CSwfDefTag*>::insert(end, 1, tag)
static void checkCount(const CSwfCharaDictionary* d, uint32_t characterId) {
    YO2_ASSERT(d->chars.size() == characterId, "Dictionaryの数が合ってない");
}

// @yo2 0x00683680 CSwfCharaDictionary::addDefineBitsLossless
void CSwfCharaDictionary::addDefineBitsLossless(uint32_t characterId, int32_t fileName) {
    chars.push_back(new CSwfDefTag_DefineBitsLossless(characterId, fileName));
    checkCount(this, characterId);
}

// @yo2 0x00683900 CSwfCharaDictionary::addDefineShape
void CSwfCharaDictionary::addDefineShape(uint32_t characterId, const SwfBounds& bounds, uint32_t bitmapId,
                                         const Mat4& matrix) {
    chars.push_back(new CSwfDefTag_DefineShape(characterId, bounds, bitmapId, matrix));
    checkCount(this, characterId);
}

// @yo2 0x00683b80 CSwfCharaDictionary::addDefineSprite: ID 0 for now, the reader sets it from SpriteID
CSwfDefTag_DefineSprite* CSwfCharaDictionary::addDefineSprite() {
    CSwfDefTag_DefineSprite* s = new CSwfDefTag_DefineSprite(0, 0);
    chars.push_back(s);
    return s;
}

// @yo2 0x00683d40 CSwfCharaDictionary::addDefineButton2: ID 0 for now, the reader sets it from ButtonID
CSwfDefTag_DefineButton2* CSwfCharaDictionary::addDefineButton2() {
    CSwfDefTag_DefineButton2* b = new CSwfDefTag_DefineButton2(0);
    chars.push_back(b);
    return b;
}

// @yo2 0x00683ef0 CSwfCharaDictionary::addDefineEditText
void CSwfCharaDictionary::addDefineEditText(uint32_t characterId, const vc6::string& initialText) {
    chars.push_back(new CSwfDefTag_DefineEditText(characterId, initialText));
    checkCount(this, characterId);
}

// @yo2 0x00684190 CSwfCharaDictionary::addUnknown: a placeholder that keeps the IDs in step
void CSwfCharaDictionary::addUnknown(uint32_t characterId) {
    chars.push_back(new CSwfDefTag(SWF_DEF_UNKNOWN, characterId));
    checkCount(this, characterId);
}

// ---------------------------------------------------------------- timeline tags

// @yo2 0x00684660 CSwfCtrlTag deleting destructor
// @yo2 0x00684640 CSwfCtrlTag::~CSwfCtrlTag
CSwfCtrlTag::~CSwfCtrlTag() {}

// @yo2 0x00684440 CSwfCtrlTag_PlaceObject2::CSwfCtrlTag_PlaceObject2
CSwfCtrlTag_PlaceObject2::CSwfCtrlTag_PlaceObject2(uint16_t flags, uint32_t depth, uint32_t characterId,
                                                   const Mat4& matrix, const vc6::string& name, const float cx[8])
    : CSwfCtrlTag(SWF_CTRL_PLACE_OBJECT2), flags(flags), depth(depth), characterId(characterId), matrix(matrix),
      name(name) {
    std::memcpy(cxform, cx, sizeof cxform);
}

// @yo2 0x00684690 CSwfCtrlTag_PlaceObject2 deleting destructor
// @yo2 0x006846c0 CSwfCtrlTag_PlaceObject2::~CSwfCtrlTag_PlaceObject2
CSwfCtrlTag_PlaceObject2::~CSwfCtrlTag_PlaceObject2() {}

// @yo2 0x00684730 CSwfCtrlTag_RemoveObject2::CSwfCtrlTag_RemoveObject2 (inline in the header)
// @yo2 0x00684760 CSwfCtrlTag_RemoveObject2 deleting destructor
// @yo2 0x00684790 CSwfCtrlTag_RemoveObject2::~CSwfCtrlTag_RemoveObject2
CSwfCtrlTag_RemoveObject2::~CSwfCtrlTag_RemoveObject2() {}

// @yo2 0x00684df0 CSwfCtrlTag_ShowFrame deleting destructor
// @yo2 0x00684e20 CSwfCtrlTag_ShowFrame::~CSwfCtrlTag_ShowFrame
CSwfCtrlTag_ShowFrame::~CSwfCtrlTag_ShowFrame() {}

// @yo2 0x00684ff0 CSwfCtrlTag_End deleting destructor
// @yo2 0x00685020 CSwfCtrlTag_End::~CSwfCtrlTag_End
CSwfCtrlTag_End::~CSwfCtrlTag_End() {}

// @yo2 0x00685210 CSwfCtrlTag_DoAction deleting destructor
// @yo2 0x00685240 CSwfCtrlTag_DoAction::~CSwfCtrlTag_DoAction
CSwfCtrlTag_DoAction::~CSwfCtrlTag_DoAction() {}

// @yo2 0x00685470 CSwfCtrlTag_FrameLabel deleting destructor
// @yo2 0x006854a0 CSwfCtrlTag_FrameLabel::~CSwfCtrlTag_FrameLabel
CSwfCtrlTag_FrameLabel::~CSwfCtrlTag_FrameLabel() {}

// ---------------------------------------------------------------- CSwfCtrlTagTable

// @yo2 0x006847b0 CSwfCtrlTagTable::CSwfCtrlTagTable (inline in the header)
// @yo2 0x006847e0 CSwfCtrlTagTable deleting destructor
// @yo2 0x00684810 CSwfCtrlTagTable::~CSwfCtrlTagTable
// @yo2 0x00685510 destroy one CSwfCtrlTag* (virtual delete, then null the slot)
// @yo2 0x00685580 vector<CSwfCtrlTag*> storage release
CSwfCtrlTagTable::~CSwfCtrlTagTable() {
    for (CSwfCtrlTag*& t : tags) {
        delete t;
        t = nullptr;
    }
}

// @yo2 0x0066d3d0 vector<CSwfCtrlTag*>::insert(end, 1, tag)
// @yo2 0x006848b0 CSwfCtrlTagTable::addPlaceObject2
void CSwfCtrlTagTable::addPlaceObject2(uint32_t flags, uint16_t depth, uint16_t characterId, const Mat4& matrix,
                                       const vc6::string& name, const float cxform[8]) {
    tags.push_back(new CSwfCtrlTag_PlaceObject2(static_cast<uint16_t>(flags), depth, characterId, matrix, name,
                                                cxform));
}

// @yo2 0x00684a90 CSwfCtrlTagTable::addRemoveObject2
void CSwfCtrlTagTable::addRemoveObject2(uint16_t depth) { tags.push_back(new CSwfCtrlTag_RemoveObject2(depth)); }

// @yo2 0x00684c40 CSwfCtrlTagTable::addShowFrame
void CSwfCtrlTagTable::addShowFrame() { tags.push_back(new CSwfCtrlTag_ShowFrame); }

// @yo2 0x00684e40 CSwfCtrlTagTable::addEnd
void CSwfCtrlTagTable::addEnd() { tags.push_back(new CSwfCtrlTag_End); }

// @yo2 0x00685040 CSwfCtrlTagTable::addDoAction: the reader fills its actions next
CSwfCtrlTag_DoAction* CSwfCtrlTagTable::addDoAction() {
    CSwfCtrlTag_DoAction* t = new CSwfCtrlTag_DoAction;
    tags.push_back(t);
    return t;
}

// @yo2 0x006852b0 CSwfCtrlTagTable::addFrameLabel
void CSwfCtrlTagTable::addFrameLabel(const vc6::string& name) { tags.push_back(new CSwfCtrlTag_FrameLabel(name)); }
