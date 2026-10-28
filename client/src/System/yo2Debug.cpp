#include "yo2Debug.h"

#include <cstdarg>
#include <cstdio>
#include <cstdlib>

namespace {
char g_formatBuf[0x400];  // DAT_012d2b60
}

// @yo2 0x0059abf0 Format: vsprintf into the shared buffer
const char* yo2Format(const char* fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    std::vsnprintf(g_formatBuf, sizeof g_formatBuf, fmt, ap);
    va_end(ap);
    return g_formatBuf;
}

// @yo2 0x0060cff0 assertion box (clipboard + MessageBox in the exe)
bool yo2AssertFailed(bool*, const char* msg, const char* file, int line) {
    std::fprintf(stderr, "%s(%d) %s\n", file, line, msg);
    return false;
}

// yaneSDK trace (0x0052c360, phase 1): empty in the shipped exe
void yo2Trace(const char*, ...) {}

void yo2Exit(int code) { std::exit(code); }

// @yo2 0x0060cda0 d3dErrorText
const char* d3dErrorText(int32_t hr) {
    struct Text {
        uint32_t hr;
        const char* text;
    };
    static const Text kTexts[] = {
        {0, "D3D_OK"},
        {0x88760b5a, "D3DXERR_LOADEDMESHASNODATA メッシュにデータが含まれていません"},
        {0x88760b59, "D3DXERR_INVALIDDATA データが無効です"},
        {0x88760b58, "D3DXERR_TOOMANYINFLUENCES 指定された影響が多すぎます"},
        {0x88760b57, "D3DXERR_SKINNINGNOTSUPPORTED スキニングがサポートされていません"},
        {0x88760b56, "D3DXERR_CANNOTATTRSORT 最適化テクニックとして、属性のソート (D3DXMESHOPT_ATTRSORT) はサポートされて"
                     "いません"},
        {0x88760b55, "D3DXERR_INVALIDMESH メッシュが無効です"},
        {0x88760b54, "D3DXERR_CANNOTMODIFYINDEXBUFFER インデックス バッファを変更できません"},
        {0x88760866, "D3DERR_NOTFOUND 要求された項目が見つかりませんでした"},
        {0x8876086a, "D3DERR_NOTAVAILABLE このデバイスは、照会されたテクニックをサポートしていません"},
        {0x88760867, "D3DERR_MOREDATA 指定されたバッファ サイズに保持できる以上のデータが存在します"},
        {0x8876086b, "D3DERR_INVALIDDEVICE 要求されたデバイスの種類が無効です"},
        {0x8876086c, "D3DERR_INVALIDCALL メソッドの呼び出しが無効です。メソッドのパラメータが有効なポインタではない可能"
                     "性があります"},
        {0x88760827, "D3DERR_DRIVERINTERNALERROR 内部ドライバ エラー。"},
        // the exe gives D3DERR_DEVICENOTRESET the same text
        {0x88760869, "D3DERR_DRIVERINTERNALERROR 内部ドライバ エラー。"},
        {0x88760868, "D3DERR_DEVICELOST デバイスは、消失しているが、現在リセットできません。したがって、レンダリングは不"
                     "可能です"},
        {0x88760822, "D3DERR_UNSUPPORTEDTEXTUREFILTER デバイスが指定されたテクスチャ フィルタをサポートしていません"},
        {0x8876081f, "D3DERR_UNSUPPORTEDFACTORVALUE デバイスが指定されたテクスチャ係数値をサポートしていません"},
        {0x8876081c, "D3DERR_UNSUPPORTEDALPHAARG アルファ チャンネルに対して指定されているテクスチャ ブレンディング引数を、"
                     "デバイスがサポートしていません"},
        {0x8876081d, "D3DERR_TOOMANYOPERATIONS デバイスがサポートしている数より多くのテクスチャ フィルタリング処理を、アプ"
                     "リケーションが要求しています"},
        {0x88760826, "D3DERR_CONFLICTINGTEXTUREPALETTE 現在のテクスチャは同時には使えません"},
        {0x8876081e, "D3DERR_CONFLICTINGTEXTUREFILTER 現在のテクスチャ フィルタは同時には使えません"},
        {0x88760821, "D3DERR_CONFLICTINGRENDERSTATE 現在設定されているレンダリング ステートは同時には使えません"},
        {0x8876081b, "D3DERR_UNSUPPORTEDALPHAOPERATION アルファ チャンネルに対して指定されているテクスチャ ブレンディング処"
                     "理を、デバイスがサポートしていません"},
        {0x88760818, "D3DERR_WRONGTEXTUREFORMAT テクスチャ サーフェイスのピクセル フォーマットが無効です"},
        {0x88760819, "D3DERR_UNSUPPORTEDCOLOROPERATION 色値に対して指定されているテクスチャ ブレンディング処理を、デバイス"
                     "がサポートしていません"},
        {0x8876081a, "D3DERR_UNSUPPORTEDCOLORARG 色値に対して指定されているテクスチャ ブレンディング引数を、デバイスがサポー"
                     "トしていません"},
        {0x8876017c, "D3DERR_OUTOFVIDEOMEMORY Direct3D が処理を行うのに十分なディスプレイ メモリがありません"},
        {0x80004005, "E_FAIL Direct3D サブシステム内で原因不明のエラーが発生しました"},
        {0x8007000e, "E_OUTOFMEMORY Direct3D が呼び出しを完了するための十分なメモリを割り当てることができませんでした"},
        {0x80070057, "E_INVALIDARG 無効なパラメータが関数に渡された。"},
    };
    for (const Text& t : kTexts)
        if (t.hr == static_cast<uint32_t>(hr))
            return t.text;
    return "";
}
