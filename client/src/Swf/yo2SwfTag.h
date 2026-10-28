// yo2SwfTag: what a Flash dump defines (CSwfDefTag_*, kept by character ID in a CSwfCharaDictionary) and what its
// timeline does (CSwfCtrlTag_*, in order in a CSwfCtrlTagTable, one per movie or DefineSprite).
//
// The game never reads .swf files. Its data is the text dump of the Perl module SWF::File (dumpswf.plx), with bitmaps
// pulled out to PNGs (the dump's PngFileTable), and yo2SwfReader.cpp turns that text into these objects. Shapes keep
// only what the game draws: a bitmap-filled rectangle (bounds, bitmap ID, bitmap matrix).
#pragma once
#include <cstdint>

#include "Swf/yo2SwfActionScript.h"
#include "Swf/yo2SwfVec.h"
#include "System/vc6.h"
#include "System/yo2Math.h"

// ---------------------------------------------------------------- character definitions

enum SwfDefType : int32_t {
    SWF_DEF_UNKNOWN = 0,
    SWF_DEF_BITS_LOSSLESS = 1,
    SWF_DEF_SHAPE = 2,
    SWF_DEF_SPRITE = 3,
    SWF_DEF_BUTTON2 = 4,
    SWF_DEF_EDIT_TEXT = 5,
    SWF_DEF_ANY = 6,   // CSwfCharaDictionary::get: accept any type
};

class CSwfDefTag {
public:
    CSwfDefTag(int32_t type, uint32_t characterId);
    virtual ~CSwfDefTag();

    int32_t type;           // 0x04 SwfDefType
    uint32_t characterId;   // 0x08 1-based; the dictionary's slot
};
YO2_AT(CSwfDefTag, type, 0x04);
YO2_AT(CSwfDefTag, characterId, 0x08);
YO2_SIZEOF(CSwfDefTag, 0x0c);

class CSwfDefTag_DefineBitsLossless : public CSwfDefTag {
public:
    CSwfDefTag_DefineBitsLossless(uint32_t characterId, int32_t fileName);
    ~CSwfDefTag_DefineBitsLossless() override;

    int32_t fileName;   // 0x0c index into the dump's PngFileTable
};
YO2_AT(CSwfDefTag_DefineBitsLossless, fileName, 0x0c);
YO2_SIZEOF(CSwfDefTag_DefineBitsLossless, 0x10);

// Two corners as D3DXVECTOR3s (z = 0), in pixels (the dump is in twips: x 0.05).
struct SwfBounds {
    Vec3 min, max;
};
static_assert(sizeof(SwfBounds) == 24, "6 floats");

class CSwfDefTag_DefineShape : public CSwfDefTag {
public:
    CSwfDefTag_DefineShape(uint32_t characterId, const SwfBounds& bounds, uint32_t bitmapId, const Mat4& bitmapMatrix);
    ~CSwfDefTag_DefineShape() override;

    uint32_t bitmapId;   // 0x0c the fill's DefineBitsLossless
    SwfBounds bounds;    // 0x10
    Mat4 bitmapMatrix;   // 0x28 scale/rotate in 1/20ths, translation in pixels
};
YO2_AT(CSwfDefTag_DefineShape, bitmapId, 0x0c);
YO2_AT(CSwfDefTag_DefineShape, bounds, 0x10);
YO2_AT(CSwfDefTag_DefineShape, bitmapMatrix, 0x28);
YO2_SIZEOF(CSwfDefTag_DefineShape, 0x68);

class CSwfCtrlTag;

// The timeline of a movie or sprite, in order. maxDepth is the deepest PlaceObject2 depth seen while reading.
class CSwfCtrlTagTable {
public:
    CSwfCtrlTagTable() = default;
    virtual ~CSwfCtrlTagTable();
    CSwfCtrlTagTable(const CSwfCtrlTagTable&) = delete;
    CSwfCtrlTagTable& operator=(const CSwfCtrlTagTable&) = delete;

    void addPlaceObject2(uint32_t flags, uint16_t depth, uint16_t characterId, const Mat4& matrix,
                         const vc6::string& name, const float cxform[8]);
    void addRemoveObject2(uint16_t depth);
    void addShowFrame();
    void addEnd();
    class CSwfCtrlTag_DoAction* addDoAction();
    void addFrameLabel(const vc6::string& name);

    vc6::vector<CSwfCtrlTag*> tags;   // 0x04
    int32_t maxDepth = 0;             // 0x14
};
YO2_AT(CSwfCtrlTagTable, tags, 0x04);
YO2_AT(CSwfCtrlTagTable, maxDepth, 0x14);
YO2_SIZEOF(CSwfCtrlTagTable, 0x18);

class CSwfDefTag_DefineSprite : public CSwfDefTag {
public:
    CSwfDefTag_DefineSprite(uint32_t characterId, uint32_t frameCount);
    ~CSwfDefTag_DefineSprite() override;

    uint32_t frameCount;               // 0x0c
    CSwfCtrlTagTable timeline;         // 0x10
    CSwfACTIONRECORDARRAY actions;     // 0x28
};
YO2_AT(CSwfDefTag_DefineSprite, frameCount, 0x0c);
YO2_AT(CSwfDefTag_DefineSprite, timeline, 0x10);
YO2_AT(CSwfDefTag_DefineSprite, actions, 0x28);
YO2_SIZEOF(CSwfDefTag_DefineSprite, 0x3c);

// One character of a button: which states show it, where, how coloured.
struct CSwfBUTTONRECORD2 {
    uint8_t states = 0;       // 0x00 ButtonStates: 1 up, 2 over, 4 down, 8 hit test
    uint32_t characterId = 0; // 0x04
    uint32_t depth = 0;       // 0x08 PlaceDepth
    Mat4 matrix;              // 0x0c PlaceMatrix
    float cxform[8];          // 0x4c ColorTransform: rgba multiply, rgba add
};
YO2_AT(CSwfBUTTONRECORD2, characterId, 0x04);
YO2_AT(CSwfBUTTONRECORD2, matrix, 0x0c);
YO2_AT(CSwfBUTTONRECORD2, cxform, 0x4c);
YO2_SIZEOF(CSwfBUTTONRECORD2, 0x6c);

struct CSwfBUTTONCONDACTION {
    uint32_t condition = 0;              // 0x00 BUTTONCONDACTION Condition bits
    CSwfACTIONRECORDARRAY actions;       // 0x04
};
YO2_AT(CSwfBUTTONCONDACTION, actions, 0x04);
YO2_SIZEOF(CSwfBUTTONCONDACTION, 0x18);

class CSwfBUTTONCONDACTIONARRAY {
public:
    CSwfBUTTONCONDACTIONARRAY() = default;
    virtual ~CSwfBUTTONCONDACTIONARRAY();
    CSwfBUTTONCONDACTIONARRAY(const CSwfBUTTONCONDACTIONARRAY&) = delete;
    CSwfBUTTONCONDACTIONARRAY& operator=(const CSwfBUTTONCONDACTIONARRAY&) = delete;

    CSwfBUTTONCONDACTION* add();

    vc6::vector<CSwfBUTTONCONDACTION*> conds;   // 0x04
};
YO2_SIZEOF(CSwfBUTTONCONDACTIONARRAY, 0x14);

class CSwfDefTag_DefineButton2 : public CSwfDefTag {
public:
    explicit CSwfDefTag_DefineButton2(uint32_t characterId);
    ~CSwfDefTag_DefineButton2() override;

    SwfVec<CSwfBUTTONRECORD2> records;     // 0x0c
    CSwfBUTTONCONDACTIONARRAY conds;       // 0x1c
};
YO2_AT(CSwfDefTag_DefineButton2, records, 0x0c);
YO2_AT(CSwfDefTag_DefineButton2, conds, 0x1c);
YO2_SIZEOF(CSwfDefTag_DefineButton2, 0x30);

class CSwfDefTag_DefineEditText : public CSwfDefTag {
public:
    CSwfDefTag_DefineEditText(uint32_t characterId, const vc6::string& initialText);
    ~CSwfDefTag_DefineEditText() override;

    vc6::string initialText;   // 0x0c the text between the first '>' and the next '<' of the HTML
};
YO2_AT(CSwfDefTag_DefineEditText, initialText, 0x0c);
YO2_SIZEOF(CSwfDefTag_DefineEditText, 0x1c);

// Every character of one dump, by ID (IDs run 1, 2, 3, ...: slot id-1).
class CSwfCharaDictionary {
public:
    CSwfCharaDictionary() = default;
    virtual ~CSwfCharaDictionary();
    CSwfCharaDictionary(const CSwfCharaDictionary&) = delete;
    CSwfCharaDictionary& operator=(const CSwfCharaDictionary&) = delete;

    CSwfDefTag* get(uint32_t characterId, int32_t type) const;
    void addDefineBitsLossless(uint32_t characterId, int32_t fileName);
    void addDefineShape(uint32_t characterId, const SwfBounds& bounds, uint32_t bitmapId, const Mat4& matrix);
    CSwfDefTag_DefineSprite* addDefineSprite();
    CSwfDefTag_DefineButton2* addDefineButton2();
    void addDefineEditText(uint32_t characterId, const vc6::string& initialText);
    void addUnknown(uint32_t characterId);

    vc6::vector<CSwfDefTag*> chars;   // 0x04
    vc6::string name;                 // 0x14 freed by the destructor; set by the engine (yo2SwfEngine.cpp)
};
YO2_AT(CSwfCharaDictionary, chars, 0x04);
YO2_AT(CSwfCharaDictionary, name, 0x14);
YO2_SIZEOF(CSwfCharaDictionary, 0x24);

// ---------------------------------------------------------------- timeline tags

enum SwfCtrlType : int32_t {
    SWF_CTRL_PLACE_OBJECT2 = 0,
    SWF_CTRL_REMOVE_OBJECT2 = 1,
    SWF_CTRL_SHOW_FRAME = 2,
    SWF_CTRL_END = 3,
    SWF_CTRL_DO_ACTION = 4,
    SWF_CTRL_FRAME_LABEL = 5,
};

class CSwfCtrlTag {
public:
    explicit CSwfCtrlTag(int32_t type) : type(type) {}
    virtual ~CSwfCtrlTag();

    int32_t type;   // 0x04 SwfCtrlType
};
YO2_AT(CSwfCtrlTag, type, 0x04);
YO2_SIZEOF(CSwfCtrlTag, 0x08);

class CSwfCtrlTag_PlaceObject2 : public CSwfCtrlTag {
public:
    CSwfCtrlTag_PlaceObject2(uint16_t flags, uint32_t depth, uint32_t characterId, const Mat4& matrix,
                             const vc6::string& name, const float cxform[8]);
    ~CSwfCtrlTag_PlaceObject2() override;

    uint16_t flags;          // 0x08 PlaceFlag bits as in the dump (1 move, 2 character, 4 matrix, 8 cxform, ...)
    uint32_t depth;          // 0x0c
    uint32_t characterId;    // 0x10
    Mat4 matrix;             // 0x14
    vc6::string name;        // 0x54 instance name, quotes stripped
    float cxform[8];         // 0x64 rgba multiply (1/256), rgba add (1/255)
};
YO2_AT(CSwfCtrlTag_PlaceObject2, flags, 0x08);
YO2_AT(CSwfCtrlTag_PlaceObject2, depth, 0x0c);
YO2_AT(CSwfCtrlTag_PlaceObject2, characterId, 0x10);
YO2_AT(CSwfCtrlTag_PlaceObject2, matrix, 0x14);
YO2_AT(CSwfCtrlTag_PlaceObject2, name, 0x54);
YO2_AT(CSwfCtrlTag_PlaceObject2, cxform, 0x64);
YO2_SIZEOF(CSwfCtrlTag_PlaceObject2, 0x84);

class CSwfCtrlTag_RemoveObject2 : public CSwfCtrlTag {
public:
    explicit CSwfCtrlTag_RemoveObject2(uint32_t depth) : CSwfCtrlTag(SWF_CTRL_REMOVE_OBJECT2), depth(depth) {}
    ~CSwfCtrlTag_RemoveObject2() override;

    uint32_t depth;   // 0x08
};
YO2_SIZEOF(CSwfCtrlTag_RemoveObject2, 0x0c);

class CSwfCtrlTag_ShowFrame : public CSwfCtrlTag {
public:
    CSwfCtrlTag_ShowFrame() : CSwfCtrlTag(SWF_CTRL_SHOW_FRAME) {}
    ~CSwfCtrlTag_ShowFrame() override;
};

class CSwfCtrlTag_End : public CSwfCtrlTag {
public:
    CSwfCtrlTag_End() : CSwfCtrlTag(SWF_CTRL_END) {}
    ~CSwfCtrlTag_End() override;
};

class CSwfCtrlTag_DoAction : public CSwfCtrlTag {
public:
    CSwfCtrlTag_DoAction() : CSwfCtrlTag(SWF_CTRL_DO_ACTION) {}
    ~CSwfCtrlTag_DoAction() override;

    CSwfACTIONRECORDARRAY actions;   // 0x08
};
YO2_AT(CSwfCtrlTag_DoAction, actions, 0x08);
YO2_SIZEOF(CSwfCtrlTag_DoAction, 0x1c);

class CSwfCtrlTag_FrameLabel : public CSwfCtrlTag {
public:
    explicit CSwfCtrlTag_FrameLabel(const vc6::string& name) : CSwfCtrlTag(SWF_CTRL_FRAME_LABEL), name(name) {}
    ~CSwfCtrlTag_FrameLabel() override;

    vc6::string name;   // 0x08
};
YO2_AT(CSwfCtrlTag_FrameLabel, name, 0x08);
YO2_SIZEOF(CSwfCtrlTag_FrameLabel, 0x18);
