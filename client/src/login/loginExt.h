// What src/login calls in other folders that main doesn't have yet (tests/misc doubles them). Each says the exe function
// it stands for. Names shared with other folders' seam headers (titleExt.h, cautionEntry.h) keep their signatures.
#pragma once
#include <cstdint>

#include "System/vc6.h"

class CTask;
class CElement;
class CEasyTask;
class IWindowTaskMediator;
class CWindowTaskControll;

// ---- src/System: CBgCommon, the world UI's menu ----
CEasyTask* bgCommonNew(CTask* parent, CElement* layer, int32_t bg, int32_t arg);   // CBgCommon::New 0xa0a030
CTask* gameWorld();                         // DAT_012bb6b0, null before the first login
CElement* gameWorldMenu(CTask* world);      // 0xa564e0 CWindowModelMenu
void menuWindowReset(CElement* menu);       // 0xa7fb40
void menuWindowClose(CElement* menu);       // 0xa7ff10

// ---- src/System: the two config singletons ----
// CSystemConfigManager (DAT_0127188c)
vc6::string systemConfigLastLoginId();           // vf23 (0x5c)
void systemConfigSetLastLoginId(vc6::string id); // vf22 (0x58)
bool systemConfigSave();                         // vf0
bool systemConfigLoginIdLocked();                // vf37 (0x94): the launcher gave the ID; it can't be changed
// CUserConfigManager (DAT_01271b10, 0x58 bytes): the saved password, per user, in a .bin file of its own.
struct CUserConfigManager;
CUserConfigManager* userConfig();                // 0x00806540 (inline here) returns DAT_01271b10
void userConfigSetUser(CUserConfigManager* u, vc6::string user);   // 0x00637e70: picks <dir>\<user>.bin
bool userConfigLoad(CUserConfigManager* u);      // vf1
bool userConfigSave(CUserConfigManager* u);      // vf0
vc6::string userConfigEncode(CUserConfigManager* u, vc6::string password);   // 0x006375f0 ("jinjin" + crypt)
// The pre-config-manager login file: <folder>\yugi_usr.dat, a CCryptFile ("nameko!") of user[16] password[16].
bool legacyLoginFileEnabled();                   // DAT_0126fb54 +0x10
vc6::string legacyLoginFileFolder();             // DAT_0126fb54 +0x00
bool legacyLoginFileRead(const vc6::string& path, uint8_t record[32]);   // CCryptFile 0x0060c780..0x0060cb30

// ---- src/System: the two widgets the login window needs and main's window toolkit doesn't have yet ----
// CWindowTaskInput (0x005c1690 ...): a one-line text input.
CWindowTaskControll* inputCreate(CTask* parent, IWindowTaskMediator* mediator, int32_t style);   // 0x005c1690
void inputSetRect(CWindowTaskControll* in, float x, float y, float w, float h);   // +0x3c8..+0x3d4, then layout
void inputSetMaxLength(CWindowTaskControll* in, int32_t n);                        // +0x3f0
void inputSetPassword(CWindowTaskControll* in, bool on);                           // +0x3f4: shown as '*'
void inputSetFlags3f6_3fd(CWindowTaskControll* in);                                // +0x3f6 = +0x3fd = 1
bool inputEntered(CWindowTaskControll* in);                                        // +0x3fe: Enter was pressed
vc6::wstring inputText(CWindowTaskControll* in);                                   // 0x005e9e40 (+0x39c)
void inputSetText(CWindowTaskControll* in, const vc6::wstring& s);                 // 0x005c1f00
// CWindowTaskCheckbox (0x005bde60 ...)
CWindowTaskControll* checkboxCreate(CTask* parent, IWindowTaskMediator* mediator);   // 0x005bde60
bool checkboxChecked(CWindowTaskControll* c);                                        // +0x388
void checkboxSetChecked(CWindowTaskControll* c, bool on);                            // 0x005beaf0

// ---- the rest ----
bool soundPlay(uint32_t id, int32_t fadeFrames);   // 0x686560 (same as titleExt.h)
enum : uint32_t { SE_CHECK = 0x10000000, SE_ENTER = 0x10000001, SE_BACK = 0x10000002 };
vc6::wstring widen(const vc6::string& s);          // 0x006054c0 mbstowcs into a 512-wchar buffer
vc6::string narrow(const vc6::wstring& s);         // 0x006056b0 wcstombs into a 512-byte buffer
