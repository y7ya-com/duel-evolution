// yo2InfoDlgCommon.cpp: CInfoDlgCommon, a task that shows a message box (CWindowModelDialogWithBtns) and plays the
// OK / cancel sound when it is answered. The message comes from the text table, a string, or a data file.
// onInit builds an OK dialog (SIMPLE) or a yes/no one (WITH_ARG); onMain waits for the answer.
#pragma once
#include <cstdint>

#include "System/yo2EasyTask.h"
#include "System/yo2Element.h"
#include "System/yo2TaskPtr.h"
#include "System/window/yo2WindowDialogs.h"

class CInfoDlgCommon : public CEasyTask {
public:
    // flags_: the dialog (SIMPLE: OK with text kind; WITH_ARG: yes/no with texts kind, arg), its place (1/2: left /
    // right, 4/8: top / bottom, none of them: centred), its size (0x1000..0x8000, else 480 x 272) and 0x100: the
    // message aligned 1 instead of 0
    enum : uint32_t { SIMPLE = 0x10, WITH_ARG = 0x20 };

    // kind/arg: the button text ids (OK: kind; yes/no: kind, arg)
    static CInfoDlgCommon* createText(CTask* parent, CTask* owner, int32_t kind, uint32_t textId, uint32_t flags);
    static CInfoDlgCommon* create(CTask* parent, CTask* owner, int32_t kind, const vc6::string& message,
                                  uint32_t flags);
    static CInfoDlgCommon* createFile(CTask* parent, CTask* owner, int32_t kind, const vc6::string& path,
                                      uint32_t flags);
    static CInfoDlgCommon* createText(CTask* parent, CTask* owner, int32_t kind, int32_t arg, uint32_t textId,
                                      uint32_t flags);
    static CInfoDlgCommon* create(CTask* parent, CTask* owner, int32_t kind, int32_t arg,
                                  const vc6::string& message, uint32_t flags);
    static CInfoDlgCommon* createFile(CTask* parent, CTask* owner, int32_t kind, int32_t arg,
                                      const vc6::string& path, uint32_t flags);

    CInfoDlgCommon();
    ~CInfoDlgCommon() override;
    // @yo2 0x00a60540 CInfoDlgCommon::receive (forwards to CEasyTask)
    int32_t receive(CTaskMessage* msg) override { return CEasyTask::receive(msg); }
    bool onInit() override;
    bool onMain() override;

    CTask* owner_ = nullptr;                    // 0x70 parent of the dialog window
    CTaskPtr<CElement> unused74_;               // 0x74 never set
    CTaskPtr<CWindowModelDialogWithBtns> dialog_;   // 0x80 "CInfoDlgCommon::m_dialogOk"
    int32_t kind_ = 0;                          // 0x8c
    int32_t arg_ = 0;                           // 0x90
    vc6::string message_;                       // 0x94
    uint32_t flags_ = 0;                        // 0xa4

private:
    static CInfoDlgCommon* finish(CInfoDlgCommon* d, CTask* parent, uint32_t flags);
};
YO2_AT(CInfoDlgCommon, owner_, 0x70);
YO2_AT(CInfoDlgCommon, unused74_, 0x74);
YO2_AT(CInfoDlgCommon, dialog_, 0x80);
YO2_AT(CInfoDlgCommon, kind_, 0x8c);
YO2_AT(CInfoDlgCommon, arg_, 0x90);
YO2_AT(CInfoDlgCommon, message_, 0x94);
YO2_AT(CInfoDlgCommon, flags_, 0xa4);
YO2_SIZEOF(CInfoDlgCommon, 0xa8);
