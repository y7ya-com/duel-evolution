#include "Swf/yo2SwfReader.h"

#include <cstdlib>
#include <cstring>
#include <string_view>

#include "System/yo2Debug.h"
#include "System/yo2File.h"

using std::string_view;
static constexpr size_t npos = string_view::npos;

namespace {

bool has(const vc6::string& line, const char* s) { return string_view(line).find(s) != npos; }

// The dump's quoted strings: the value without its first and last character.
vc6::string unquote(const vc6::string& v) {
    string_view s(v);
    return vc6::string(s.size() >= 2 ? s.substr(1, s.size() - 2) : string_view());
}

// x87 at the exe's 53-bit precision: products are rounded to double, then stored as float.
float scaled(double v, float k) { return static_cast<float>(v * static_cast<double>(k)); }

const float TWIPS = 0.05f;           // 0x00beb010 (double 0.05) / 0x00be9d80 (float 0.05)
const float MULT_TERM = 1.0f / 256;  // 0x00be9ca8
const float ADD_TERM = 1.0f / 255;   // 0x00beb01c

// A handler's line loop: read, let `line` be handled, count its brackets; stop when they close or the file ends.
// `handle` returns true when it consumed a nested block (its closing line is now in `line`), which re-opens one
// level before the count, as every handler in the exe does.
template <class F>
vc6::string forEachLine(SwfLineSource& file, F handle) {
    vc6::string line;
    int32_t depth = 1;
    if (file.readLine(line)) {
        do {
            if (handle(line)) ++depth;
            if (!SwfReader::countNest(line, depth)) break;
        } while (file.readLine(line));
    }
    return line;
}

}  // namespace

namespace SwfReader {

// @yo2 0x0067a340 getValue: " key => " (or "\tkey => ") in the line; the value is the rest minus its last
// character (the dump's trailing comma). ponytail: an empty rest (no comma) throws length_error in the exe.
bool getValue(const vc6::string& line, vc6::string& value, const char* key) {
    string_view s(line);
    std::string pattern = std::string(" ") + key + " => ";
    size_t at = s.find(pattern);
    if (at == npos) {
        pattern[0] = '\t';
        at = s.find(pattern);
        if (at == npos) return false;
    }
    string_view rest = s.substr(at + pattern.size());
    value = vc6::string(rest.substr(0, rest.empty() ? 0 : rest.size() - 1));
    return true;
}

// @yo2 0x0067a6b0 countNest: "(" anywhere opens a level, ")" anywhere closes one; true while still open
bool countNest(const vc6::string& line, int32_t& depth) {
    if (has(line, "(")) ++depth;
    if (has(line, ")")) --depth;
    YO2_ASSERT(depth >= 0, "illegal nest");
    return depth != 0;
}

}  // namespace SwfReader

using SwfReader::countNest;
using SwfReader::getValue;

namespace {

int32_t toInt(const vc6::string& v) { return std::atoi(v.c_str()); }       // 0x00b0c267 atoi
double toDouble(const vc6::string& v) { return std::atof(v.c_str()); }     // 0x00b0cd09 atof

// @yo2 0x0067dc60 RECT: Xmin/Ymin into min, Xmax/Ymax into max, twips to pixels
vc6::string readRect(SwfLineSource& file, SwfBounds& b) {
    return forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "Xmin")) b.min.x = scaled(toDouble(v), TWIPS);
        else if (getValue(line, v, "Ymin")) b.min.y = scaled(toDouble(v), TWIPS);
        else if (getValue(line, v, "Xmax")) b.max.x = scaled(toDouble(v), TWIPS);
        else if (getValue(line, v, "Ymax")) b.max.y = scaled(toDouble(v), TWIPS);
        return false;
    });
}

// @yo2 0x0067e150 MATRIX: scale and skew as given, translation twips to pixels (row-vector D3DX layout)
vc6::string readMatrix(SwfLineSource& file, Mat4& m) {
    return forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "ScaleX")) m.m[0][0] = static_cast<float>(toDouble(v));
        else if (getValue(line, v, "ScaleY")) m.m[1][1] = static_cast<float>(toDouble(v));
        else if (getValue(line, v, "RotateSkew0")) m.m[0][1] = static_cast<float>(toDouble(v));
        else if (getValue(line, v, "RotateSkew1")) m.m[1][0] = static_cast<float>(toDouble(v));
        else if (getValue(line, v, "TranslateX")) m.m[3][0] = scaled(toDouble(v), TWIPS);
        else if (getValue(line, v, "TranslateY")) m.m[3][1] = scaled(toDouble(v), TWIPS);
        return false;
    });
}

// @yo2 0x0067e820 CXFORMWITHALPHA: multiply terms /256, add terms /255. The exe looks for "AlpahAddTerm"
// (sic), so the alpha add term of the dumps is never read.
vc6::string readCxform(SwfLineSource& file, float cx[8]) {
    static const char* const KEYS[8] = {"RedMultTerm", "GreenMultTerm", "BlueMultTerm", "AlphaMultTerm",
                                        "RedAddTerm",  "GreenAddTerm",  "BlueAddTerm",  "AlpahAddTerm"};
    return forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        for (int i = 0; i < 8; i++)
            if (getValue(line, v, KEYS[i])) {
                cx[i] = scaled(static_cast<float>(toInt(v)), i < 4 ? MULT_TERM : ADD_TERM);
                break;
            }
        return false;
    });
}

// @yo2 0x00681870 readActionData: the value of "SWF::Element::ACTIONDATA::<kind>->new(...)", up to the line's
// last ")"
bool actionData(const vc6::string& line, vc6::string& value, const char* kind) {
    string_view s(line);
    std::string pattern = std::string("SWF::Element::ACTIONDATA::") + kind + "->new(";
    size_t at = s.find(pattern);
    if (at == npos) return false;
    size_t from = at + pattern.size();
    // @yo2 0x00681b30 string::find_last_of
    size_t close = s.find_last_of(')');
    value = vc6::string(s.substr(from, close - from));
    return true;
}

// @yo2 0x00680930 ACTIONDATAARRAY: one template entry, reused: each value overwrites only its own field and type
// @yo2 0x00681bc0 vector<CSwfACTIONDATA>::push_back
// @yo2 0x00681e00 vector<CSwfACTIONDATA>::insert(end, 1, data)
// @yo2 0x006821c0 CSwfACTIONDATA::operator=
// @yo2 0x00682380 vector<CSwfACTIONDATA>::size
// @yo2 0x006823b0 uninitialized_copy<CSwfACTIONDATA*>
// @yo2 0x00682400 uninitialized_fill_n<CSwfACTIONDATA*>
// @yo2 0x00682440 copy_backward<CSwfACTIONDATA*>
// @yo2 0x00682620 copy<CSwfACTIONDATA*>
// @yo2 0x00681dc0 destroy<CSwfACTIONDATA*>
// @yo2 0x00681ae0 vector<CSwfACTIONDATA>::~vector
vc6::string readActionDataArray(SwfLineSource& file, SwfVec<CSwfACTIONDATA>& out) {
    CSwfACTIONDATA d;
    return forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (actionData(line, v, "Integer")) {
            d.integer = toInt(v);
            d.type = CSwfACTIONDATA::INTEGER;
            out.push_back(d);
        } else if (actionData(line, v, "String")) {
            d.str = unquote(v);
            d.type = CSwfACTIONDATA::STRING;
            out.push_back(d);
        } else if (actionData(line, v, "Lookup")) {
            d.lookup = toInt(v);
            d.type = CSwfACTIONDATA::LOOKUP;
            out.push_back(d);
        }
        return false;
    });
}

// @yo2 0x006800a0 ActionPush: LocalLabel and the DataList
vc6::string readPush(SwfLineSource& file, CSwfACTIONRECORDARRAY& actions) {
    vc6::string label;
    SwfVec<CSwfACTIONDATA> data;
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "LocalLabel")) {
            label = unquote(v);
        } else if (has(line, "DataList => SWF::Element::Array::ACTIONDATAARRAY->new([")) {
            line = readActionDataArray(file, data);
            return true;
        }
        return false;
    });
    actions.addPush(label, data);
    return last;
}

// @yo2 0x006804d0 ActionGotoLabel: LocalLabel and Label
vc6::string readGotoLabel(SwfLineSource& file, CSwfACTIONRECORDARRAY& actions) {
    vc6::string label, target;
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "LocalLabel")) label = unquote(v);
        else if (getValue(line, v, "Label")) target = unquote(v);
        return false;
    });
    actions.addGotoLabel(label, target);
    return last;
}

// @yo2 0x00680de0 ActionConstantPool: LocalLabel, then every line with a quoted string is one entry
// @yo2 0x0056a7a0 vector<string>::insert(end, 1, s)
vc6::string readConstantPool(SwfLineSource& file, CSwfACTIONRECORDARRAY& actions) {
    vc6::string label;
    SwfVec<vc6::string> pool;
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "LocalLabel")) {
            label = unquote(v);
        } else {
            string_view s(line);
            size_t open = s.find('"');
            if (open != npos) {
                size_t close = s.find_last_of('"');
                pool.push_back(vc6::string(s.substr(open + 1, close - (open + 1))));
            }
        }
        return false;
    });
    actions.addConstantPool(label, pool);
    return last;
}

// @yo2 0x006811f0 ActionDefineFunction: LocalLabel, FunctionName, CodeSize (up to its "#" comment). The function's
// body is the records that follow it in the same array.
vc6::string readDefineFunction(SwfLineSource& file, CSwfACTIONRECORDARRAY& actions) {
    vc6::string label, name, codeSize;
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "LocalLabel")) {
            label = unquote(v);
        } else if (getValue(line, v, "FunctionName")) {
            name = unquote(v);
        } else if (getValue(line, v, "CodeSize")) {
            string_view s(v);
            size_t hash = s.find('#');
            codeSize = vc6::string(hash == npos ? s.substr(1, s.size() - 2) : s.substr(1, hash - 1));
        }
        return false;
    });
    actions.addDefineFunction(label, name, codeSize);
    return last;
}

// @yo2 0x0067f9f0 ACTIONRECORD: LocalLabel and Tag; only the actions the player knows are kept
// @yo2 0x00457700 string::compare(const char*)
// @yo2 0x00426690 string::compare(pos, n, const char*, n)
vc6::string readActionRecord(SwfLineSource& file, CSwfACTIONRECORDARRAY& actions) {
    vc6::string label, tag;
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "LocalLabel")) label = unquote(v);
        else if (getValue(line, v, "Tag")) tag = unquote(v);
        return false;
    });
    static const struct { const char* name; int32_t type; } KNOWN[] = {
        {"ActionGetVariable", SWF_ACT_GET_VARIABLE}, {"ActionSetMember", SWF_ACT_SET_MEMBER},
        {"ActionGetMember", SWF_ACT_GET_MEMBER},     {"ActionEnd", SWF_ACT_END},
        {"ActionStop", SWF_ACT_STOP},                {"ActionCallMethod", SWF_ACT_CALL_METHOD},
        {"ActionPop", SWF_ACT_POP},                  {"ActionSubtract", SWF_ACT_SUBTRACT},
    };
    for (const auto& k : KNOWN)
        if (tag == k.name) {
            actions.add(k.type, label);
            return last;
        }
    yo2Trace("未対応のAction %s\n", tag.c_str());   // unsupported action (ActionPlay, ActionGotoFrame, ...)
    return last;
}

// @yo2 0x0067d7c0 ACTIONRECORDARRAY. The exe hands down the owner's name ("ROOT", "BUTTONCONDACTION"); no
// record reader uses it.
vc6::string readActions(SwfLineSource& file, CSwfACTIONRECORDARRAY& actions) {
    return forEachLine(file, [&](vc6::string& line) {
        if (has(line, "SWF::Element::ACTIONRECORD::ActionDefineFunction->new(")) {
            line = readDefineFunction(file, actions);
        } else if (has(line, "SWF::Element::ACTIONRECORD::ActionConstantPool->new(")) {
            line = readConstantPool(file, actions);
        } else if (has(line, "SWF::Element::ACTIONRECORD::ActionPush->new(")) {
            line = readPush(file, actions);
        } else if (has(line, "SWF::Element::ACTIONRECORD::ActionGotoLabel->new(")) {
            line = readGotoLabel(file, actions);
        } else if (has(line, "SWF::Element::ACTIONRECORD->new(")) {
            line = readActionRecord(file, actions);
        } else {
            return false;
        }
        return true;
    });
}

// ---------------------------------------------------------------- tag handlers

// @yo2 0x0067a9a0 PngFileTable: every "png => name," line, in order (DefineBitsLossless FileName indexes it)
vc6::string readPngTable(SwfLineSource& file, SwfVec<vc6::string>* png) {
    return forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "png")) png->push_back(v);
        return false;
    });
}

// @yo2 0x0067ac00 DefineBitsLossless: CharacterID and FileName (format and size are read but unused)
vc6::string readBitsLossless(SwfLineSource& file, CSwfCharaDictionary* dict) {
    uint32_t id = 1;
    int32_t fileName = 0;
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "CharacterID")) id = toInt(v);
        else if (getValue(line, v, "FileName")) fileName = toInt(v);
        else if (getValue(line, v, "BitmapFormat") || getValue(line, v, "BitmapWidth")) {
        } else {
            getValue(line, v, "BitmapHeight");
        }
        return false;
    });
    dict->addDefineBitsLossless(id & 0xffff, fileName);
    return last;
}

// @yo2 0x0067b170 DefineShape / DefineShape2: ShapeID, ShapeBounds, and the fill's BitmapID and BitmapMatrix. Fill
// styles and shape records are skipped: every shape the game uses is a bitmap-filled rectangle.
// @yo2 0x0067b6a0 D3DXVECTOR3::D3DXVECTOR3(x, y, z)
// @yo2 0x0066fef0 D3DXMatrixIdentity
vc6::string readShape(SwfLineSource& file, CSwfCharaDictionary* dict) {
    uint32_t id = 0, bitmapId = 1;
    SwfBounds bounds{};
    Mat4 m = Mat4::identity();
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "ShapeID")) {
            id = toInt(v);
        } else if (has(line, "ShapeBounds => SWF::Element::RECT->new(")) {
            line = readRect(file, bounds);
            return true;
        } else if (getValue(line, v, "BitmapID")) {
            bitmapId = toInt(v);
        } else if (has(line, "BitmapMatrix => SWF::Element::MATRIX->new(")) {
            line = readMatrix(file, m);
            // the bitmap is in twips too: its scale and skew become pixel units
            m.m[0][0] = scaled(m.m[0][0], TWIPS);
            m.m[1][1] = scaled(m.m[1][1], TWIPS);
            m.m[0][1] = scaled(m.m[0][1], TWIPS);
            m.m[1][0] = scaled(m.m[1][0], TWIPS);
            return true;
        }
        return false;
    });
    dict->addDefineShape(id & 0xffff, bounds, bitmapId & 0xffff, m);
    return last;
}

// @yo2 0x0067b6d0 DefineSprite: created first (ID 0), then SpriteID, and ControlTags read as a nested timeline
vc6::string readSprite(SwfLineSource& file, CSwfCharaDictionary* dict) {
    CSwfDefTag_DefineSprite* sprite = dict->addDefineSprite();
    return forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "SpriteID")) {
            sprite->characterId = toInt(v) & 0xffff;
        } else if (has(line, "ControlTags => SWF::Element::Array::TAGARRAY->new([")) {
            line = SwfReader::readTags(file, nullptr, nullptr, &sprite->timeline);
            return true;
        }
        return false;
    });
}

// @yo2 0x0067f130 BUTTONRECORD2: ButtonStates, CharacterID, PlaceDepth, PlaceMatrix, ColorTransform
vc6::string readButtonRecord(SwfLineSource& file, CSwfBUTTONRECORD2& r) {
    return forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "ButtonStates")) {
            r.states = static_cast<uint8_t>(toInt(v));
        } else if (getValue(line, v, "CharacterID")) {
            r.characterId = toInt(v);
        } else if (getValue(line, v, "PlaceDepth")) {
            r.depth = toInt(v);
        } else if (has(line, "PlaceMatrix => SWF::Element::MATRIX->new(")) {
            line = readMatrix(file, r.matrix);
            return true;
        } else if (has(line, "ColorTransform => SWF::Element::CXFORMWITHALPHA->new(")) {
            line = readCxform(file, r.cxform);
            return true;
        }
        return false;
    });
}

// @yo2 0x0067f630 BUTTONCONDACTION: Condition and its Actions
vc6::string readCondAction(SwfLineSource& file, CSwfBUTTONCONDACTION& c) {
    return forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "Condition")) {
            c.condition = toInt(v);
        } else if (has(line, "Actions => SWF::Element::Array::ACTIONRECORDARRAY->new([")) {
            line = readActions(file, c.actions);
            return true;
        }
        return false;
    });
}

// @yo2 0x0067b9f0 DefineButton2: created first (ID 0), then ButtonID, its records and its condition actions
// @yo2 0x0066feb0 default CXFORMWITHALPHA (multiply 1, add 0)
// @yo2 0x00671bf0 vector<CSwfBUTTONRECORD2>::insert(end, 1, record)
vc6::string readButton(SwfLineSource& file, CSwfCharaDictionary* dict) {
    CSwfDefTag_DefineButton2* button = dict->addDefineButton2();
    return forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "ButtonID")) {
            button->characterId = toInt(v) & 0xffff;
        } else if (has(line, "SWF::Element::BUTTONRECORD2->new(")) {
            CSwfBUTTONRECORD2 r;
            r.matrix = Mat4::identity();
            const float defaults[8] = {1, 1, 1, 1, 0, 0, 0, 0};
            std::memcpy(r.cxform, defaults, sizeof defaults);
            line = readButtonRecord(file, r);
            button->records.push_back(r);
            return true;
        } else if (has(line, "SWF::Element::BUTTONCONDACTION->new(")) {
            line = readCondAction(file, *button->conds.add());
            return true;
        }
        return false;
    });
}

// @yo2 0x0067bdf0 DefineEditText: CharacterID, and InitialText's HTML reduced to the text of its first element
vc6::string readEditText(SwfLineSource& file, CSwfCharaDictionary* dict) {
    uint32_t id = 0;
    vc6::string text;
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "CharacterID")) {
            id = toInt(v);
        } else if (getValue(line, v, "InitialText")) {
            string_view s(v);
            size_t lt = s.find('<');
            if (lt != npos) {
                size_t gt = s.find('>', lt);
                if (gt != npos) {
                    size_t end = s.find('<', gt + 1);
                    if (end != npos) text = vc6::string(s.substr(gt + 1, end - (gt + 1)));
                }
            }
        }
        return false;
    });
    dict->addDefineEditText(id & 0xffff, text);
    return last;
}

// @yo2 0x0067c250 any other Define*: only its ID (the first one seen), to keep the dictionary's IDs in step
vc6::string readUnknownDefine(SwfLineSource& file, CSwfCharaDictionary* dict) {
    uint16_t id = 0;
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "ID") && id == 0) id = static_cast<uint16_t>(toInt(v));
        return false;
    });
    dict->addUnknown(id);
    return last;
}

// @yo2 0x0067c4d0 PlaceObject2: Flags, Depth (tracked as the timeline's deepest), CharacterID, Matrix, Name,
// ColorTransform
vc6::string readPlaceObject(SwfLineSource& file, CSwfCtrlTagTable* timeline) {
    uint32_t flags = 0, depth = 0, id = 0;
    Mat4 m = Mat4::identity();
    vc6::string name;
    float cx[8] = {1, 1, 1, 1, 0, 0, 0, 0};
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "Flags")) {
            flags = toInt(v);
        } else if (getValue(line, v, "Depth")) {
            depth = toInt(v);
            if (timeline->maxDepth < static_cast<int32_t>(depth & 0xffff))
                timeline->maxDepth = depth & 0xffff;
        } else if (getValue(line, v, "CharacterID")) {
            id = toInt(v);
        } else if (has(line, "Matrix => SWF::Element::MATRIX->new(")) {
            line = readMatrix(file, m);
            return true;
        } else if (getValue(line, v, "Name")) {
            name = unquote(v);
        } else if (has(line, "ColorTransform => SWF::Element::CXFORMWITHALPHA->new(")) {
            line = readCxform(file, cx);
            return true;
        }
        return false;
    });
    timeline->addPlaceObject2(flags, depth & 0xffff, id & 0xffff, m, name, cx);
    return last;
}

// @yo2 0x0067ccd0 RemoveObject2: Depth
vc6::string readRemoveObject(SwfLineSource& file, CSwfCtrlTagTable* timeline) {
    uint16_t depth = 0;
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "Depth")) depth = static_cast<uint16_t>(toInt(v));
        return false;
    });
    timeline->addRemoveObject2(depth);
    return last;
}

// @yo2 0x0067cf50 ShowFrame (no fields)
vc6::string readShowFrame(SwfLineSource& file, CSwfCtrlTagTable* timeline) {
    vc6::string last = forEachLine(file, [](vc6::string&) { return false; });
    timeline->addShowFrame();
    return last;
}

// @yo2 0x0067d080 End (no fields)
vc6::string readEnd(SwfLineSource& file, CSwfCtrlTagTable* timeline) {
    vc6::string last = forEachLine(file, [](vc6::string&) { return false; });
    timeline->addEnd();
    return last;
}

// @yo2 0x0067d1b0 FrameLabel: Name
vc6::string readFrameLabel(SwfLineSource& file, CSwfCtrlTagTable* timeline) {
    vc6::string name;
    vc6::string last = forEachLine(file, [&](vc6::string& line) {
        vc6::string v;
        if (getValue(line, v, "Name")) name = unquote(v);
        return false;
    });
    timeline->addFrameLabel(name);
    return last;
}

// @yo2 0x0067d4b0 DoAction: created first, then its Actions
vc6::string readDoAction(SwfLineSource& file, CSwfCtrlTagTable* timeline) {
    CSwfCtrlTag_DoAction* tag = timeline->addDoAction();
    return forEachLine(file, [&](vc6::string& line) {
        if (has(line, "Actions => SWF::Element::Array::ACTIONRECORDARRAY->new([")) {
            line = readActions(file, tag->actions);
            return true;
        }
        return false;
    });
}

}  // namespace

// @yo2 0x006793d0 readTags: dispatch each line on the first tag it names
// @yo2 0x0067a230 the empty string a "Header:" line becomes
vc6::string SwfReader::readTags(SwfLineSource& file, SwfVec<vc6::string>* png, CSwfCharaDictionary* dict,
                                CSwfCtrlTagTable* timeline) {
    return forEachLine(file, [&](vc6::string& line) {
        if (has(line, "Header:")) {
            line = vc6::string();   // the header block's fields are only bracket-counted
            return false;
        }
        if (has(line, "PngFileTable")) line = readPngTable(file, png);
        else if (has(line, "SWF::Element::Tag::DefineBitsLossless->new(")) line = readBitsLossless(file, dict);
        else if (has(line, "SWF::Element::Tag::DefineShape->new(")) line = readShape(file, dict);
        else if (has(line, "SWF::Element::Tag::DefineShape2->new(")) line = readShape(file, dict);
        else if (has(line, "SWF::Element::Tag::DefineSprite->new(")) line = readSprite(file, dict);
        else if (has(line, "SWF::Element::Tag::DefineButton2->new(")) line = readButton(file, dict);
        else if (has(line, "SWF::Element::Tag::DefineEditText->new(")) line = readEditText(file, dict);
        else if (has(line, "SWF::Element::Tag::Define")) {
            yo2Trace("未対応のTag %s\n", line.c_str());   // unsupported tag
            line = readUnknownDefine(file, dict);
        } else if (has(line, "SWF::Element::Tag::PlaceObject2->new(")) line = readPlaceObject(file, timeline);
        else if (has(line, "SWF::Element::Tag::RemoveObject2->new(")) line = readRemoveObject(file, timeline);
        else if (has(line, "SWF::Element::Tag::ShowFrame->new(")) line = readShowFrame(file, timeline);
        else if (has(line, "SWF::Element::Tag::End->new(")) line = readEnd(file, timeline);
        else if (has(line, "SWF::Element::Tag::FrameLabel->new(")) line = readFrameLabel(file, timeline);
        else if (has(line, "SWF::Element::Tag::DoAction->new(")) line = readDoAction(file, timeline);
        else {
            // linkage set to import: the dump needs the assets, which the game cannot do
            YO2_ASSERT(!has(line, "SWF::Element::Tag::ImportAssets->new("),
                       "リンケージの設定が読み込みになってしまっているのがある");
            return false;
        }
        return true;
    });
}

// yaneSDK's CFile::ReadLine (0x52b540), on a buffer instead of the CFile's memory image
bool SwfBufferLines::readLine(vc6::string& line) {
    if (pos_ >= data_.size()) return false;
    string_view all(reinterpret_cast<const char*>(data_.data()), data_.size());
    size_t end = all.find("\r\n", pos_);
    if (end == npos) end = all.size();
    line = vc6::string(all.substr(pos_, end - pos_));
    pos_ = end + 2;
    return true;
}

// @yo2 0x00678ce0 load. The exe also cuts the directory off the name (up to its last '/') and never uses it.
void SwfReader::load(const vc6::string& fileName, SwfVec<vc6::string>* png, CSwfCharaDictionary* dict,
                     CSwfCtrlTagTable* timeline) {
    std::vector<uint8_t> data;
    bool ok = yo2LoadFile(fileName.c_str(), data);
    YO2_ASSERT(ok, "%s", fileName.c_str());
    SwfBufferLines file(std::move(data));
    readTags(file, png, dict, timeline);
}

// @yo2 0x00679040 loadPngTable
SwfVec<vc6::string> SwfReader::loadPngTable(const vc6::string& fileName) {
    SwfVec<vc6::string> png;
    std::vector<uint8_t> data;
    if (!yo2LoadFile(fileName.c_str(), data)) return png;
    SwfBufferLines file(std::move(data));
    for (vc6::string line; file.readLine(line);)
        if (has(line, "PngFileTable")) {
            readPngTable(file, &png);
            break;
        }
    return png;
}
