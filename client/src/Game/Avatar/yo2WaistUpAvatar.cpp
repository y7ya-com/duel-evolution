#include "Game/Avatar/yo2WaistUpAvatar.h"

#include <cstdlib>
#include <cstring>

#include "Game/yo2GameData.h"
#include "System/yo2Debug.h"

// @yo2 0x009e2140 CWADictionary::create (priority 10000)
void CWADictionary::create(CTask* parent) { (new CWADictionary)->CTask::create(parent, 10000); }

// @yo2 0x009e2280 CWADictionary::~CWADictionary
// @yo2 0x009e2250 CWADictionary deleting destructor
CWADictionary::~CWADictionary() = default;

// @yo2 0x009e22a0 CWADictionary::onInit
bool CWADictionary::onInit() {
    if (load())
        return true;
    YO2_ASSERT(false, "A_DATA MakeError!");
    return false;
}

// @yo2 0x009e2400 CWADictionary::load: one part per non-empty, non-// line, columns kind, number, 7 images, rect
bool CWADictionary::load() {
    static const char* const kFiles[TYPES] = {"wm_data.csv", "ww_data.csv"};
    for (int type = 0; type < TYPES; type++) {
        vc6::string path = "data/Avatar/wu/";
        path += kFiles[type];
        GameFile file;
        file.read(path.c_str());
        int32_t n = 0;
        char line[0x100];
        for (int32_t r; (r = file.readLine(line, sizeof line)) != 1;) {
            if (r != 0)
                return false;
            if (line[0] == '\0' || (line[0] == '/' && line[1] == '/'))
                continue;
            WaistUpPart& p = parts_[type][n];
            int col = 0;
            for (char* tok = std::strtok(line, ",\n"); tok; tok = std::strtok(nullptr, ",\n"), col++) {
                switch (col) {
                case 0: p.kind = std::atoi(tok); break;
                case 1:
                    p.number = static_cast<uint8_t>(std::atoi(tok));
                    if (maxNumber_[type][p.kind] < p.number)   // the exe indexes kind + type * 13 unchecked
                        maxNumber_[type][p.kind] = p.number;
                    break;
                case 2: case 3: case 4: case 5: case 6: case 7: case 8:
                    // ponytail: the exe copies strlen + 1 bytes; bounded to the field here (names are ~20 chars)
                    std::strncpy(p.images[col - 2], tok, sizeof p.images[0] - 1);
                    break;
                case 9: case 10: case 11: case 12: p.rect[col - 9] = std::atoi(tok); break;
                }
            }
            n++;
            YO2_ASSERT(n <= 0x81, "アバターパーツ数オーバー");
        }
        count_[type] = n;
        yo2Trace("ウエストアップデータ生成。type=[%d]の総数=[%d]個\n", type, n);
    }
    return true;
}
