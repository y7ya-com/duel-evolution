// yo2SwfReader: reads the text dump of a Flash movie (Perl SWF::File's dumpswf.plx output plus a PngFileTable)
// into a CSwfCharaDictionary (the characters) and a CSwfCtrlTagTable (the timeline).
//
// The exe parses line by line, by substring, and counts brackets per line: a line containing "(" opens one level,
// a line containing ")" closes one, whatever else is on it. Each "->new(" a handler recognises is consumed by that
// handler up to its closing line, which the handler returns; the caller then adds one level back before counting
// that line again, so it nets out. Lines nobody recognises (Header fields, fill styles, shape records, ...) only
// count brackets. This file keeps that exact algorithm, so odd input fails the same way it did in the exe.
#pragma once
#include <cstdint>
#include <utility>
#include <vector>

#include "Swf/yo2SwfTag.h"
#include "Swf/yo2SwfVec.h"
#include "System/vc6.h"

// Where the lines come from: the game's CFile::ReadLine (yaneSDK, Konami's archive-aware CFile).
class SwfLineSource {
public:
    virtual ~SwfLineSource() = default;
    virtual bool readLine(vc6::string& line) = 0;   // false at the end of the file
};

// yaneSDK's CFile::ReadLine over a file read whole: lines end at CR LF only (a lone LF stays in the line).
class SwfBufferLines : public SwfLineSource {
    std::vector<uint8_t> data_;
    size_t pos_ = 0;

public:
    explicit SwfBufferLines(std::vector<uint8_t> data) : data_(std::move(data)) {}
    bool readLine(vc6::string& line) override;
};

namespace SwfReader {

// The dump `fileName` (a data path in merge.dat), whole. The exe asserts if it can't be read.
void load(const vc6::string& fileName, SwfVec<vc6::string>* pngTable, CSwfCharaDictionary* dict,
          CSwfCtrlTagTable* timeline);

// Only its PngFileTable: the lines before it are skipped, the rest of the file is not read. Empty if it can't be read.
SwfVec<vc6::string> loadPngTable(const vc6::string& fileName);

// The whole dump, or (recursively) one DefineSprite's ControlTags: tags until the brackets close or the file ends.
// Returns the last line read. pngTable/dict may be null for a sprite's timeline (it only holds control tags).
vc6::string readTags(SwfLineSource& file, SwfVec<vc6::string>* pngTable, CSwfCharaDictionary* dict,
                     CSwfCtrlTagTable* timeline);

// Building blocks, exposed for the tests.
bool getValue(const vc6::string& line, vc6::string& value, const char* key);
bool countNest(const vc6::string& line, int32_t& depth);

}  // namespace SwfReader
