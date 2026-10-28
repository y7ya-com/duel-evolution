// CHttpDownload is src/Net's (0x69fee0..0x6a0470, not ported in this branch): a worker thread that GETs a URL into
// memory. CCautionScene embeds three by value, so the layout is kept here; the out-of-line members are declared
// only (tests/ui_caution doubles them). Its inline data() was emitted in cautionEntry.obj and is ported here.
#pragma once
#include <cstdint>

#include "System/vc6.h"

class CHttpDownload {
public:
    enum Status : int32_t { IDLE = 0, RUNNING = 1, DONE = 2, FAILED = 3 };

    CHttpDownload();                       // 0x0069fee0
    virtual ~CHttpDownload();              // 0x0069ff30 (deleting) / 0x0069ff60
    int32_t start(vc6::string url);        // 0x006a0180: -1 if a download is still running or no thread starts
    int32_t status() const;                // 0x006a0450
    // @yo2 0x007fd780 CHttpDownload::data: the downloaded bytes (NUL-terminated text for the .html pages)
    const char* data() const { return data_; }

    intptr_t thread_ = -1;   // 0x04 _beginthread handle
    vc6::string url_;        // 0x08
    vc6::string unk18_;      // 0x18
    int32_t status_ = IDLE;  // 0x28 Status
    char* data_ = nullptr;   // 0x2c
    uint32_t size_ = 0;      // 0x30
    uint32_t unk34_ = 0;     // 0x34
    bool cancel_ = false;    // 0x38
};
YO2_AT(CHttpDownload, thread_, 0x04);
YO2_AT(CHttpDownload, url_, 0x08);
YO2_AT(CHttpDownload, status_, 0x28);
YO2_AT(CHttpDownload, data_, 0x2c);
YO2_AT(CHttpDownload, cancel_, 0x38);
YO2_SIZEOF(CHttpDownload, 0x3c);
