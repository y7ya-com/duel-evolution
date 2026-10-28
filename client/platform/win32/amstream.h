// DirectShow multimedia streams: not available off Windows. CDirectShow's CoCreateInstance(CLSID_AMMultiMediaStream)
// fails with REGDB_E_CLASSNOTREG, so CanUseDirectShow() is false, and mtknPcmDirectShow.cpp compiles to a NULL
// factory. IMultiMediaStream / IAMMultiMediaStream are declared in full (real method order) so CDirectShow
// compiles; nothing implements them. CMovieDS (USE_MovieDS) is off in Konami's configuration.
#pragma once
#include "windows.h"

struct IMultiMediaStream;
struct IAMMultiMediaStream;
struct IMediaStream;
struct IMediaStreamFilter;
struct IDirectDrawMediaStream;
struct IDirectDrawStreamSample;
struct IGraphBuilder;
struct IMediaControl;
struct IMediaEvent;
struct IMediaSeeking;
struct IBasicAudio;
struct IBindCtx;
struct IMoniker;
extern const GUID CLSID_AMMultiMediaStream, IID_IAMMultiMediaStream;

typedef LONGLONG STREAM_TIME;
typedef GUID MSPID;
typedef const MSPID& REFMSPID;
typedef enum { STREAMTYPE_READ = 0, STREAMTYPE_WRITE = 1, STREAMTYPE_TRANSFORM = 2 } STREAM_TYPE;
typedef enum { STREAMSTATE_STOP = 0, STREAMSTATE_RUN = 1 } STREAM_STATE;
#define AMMSF_ADDDEFAULTRENDERER 0x1
#define AMMSF_CREATEPEER 0x2
#define AMMSF_STOPIFNOSAMPLES 0x4
#define AMMSF_NOSTALL 0x8
#define MS_S_PENDING ((HRESULT)0x00040001)
#define MS_S_NOUPDATE ((HRESULT)0x00040002)
#define MS_S_ENDOFSTREAM ((HRESULT)0x00040003)

struct IMultiMediaStream : IUnknown {
    virtual HRESULT GetInformation(DWORD* flags, STREAM_TYPE* type) = 0;
    virtual HRESULT GetMediaStream(REFMSPID id, IMediaStream** out) = 0;
    virtual HRESULT EnumMediaStreams(long index, IMediaStream** out) = 0;
    virtual HRESULT GetState(STREAM_STATE* state) = 0;
    virtual HRESULT SetState(STREAM_STATE state) = 0;
    virtual HRESULT GetTime(STREAM_TIME* t) = 0;
    virtual HRESULT GetDuration(STREAM_TIME* t) = 0;
    virtual HRESULT Seek(STREAM_TIME t) = 0;
    virtual HRESULT GetEndOfStreamEventHandle(HANDLE* out) = 0;
};

struct IAMMultiMediaStream : IMultiMediaStream {
    virtual HRESULT Initialize(STREAM_TYPE type, DWORD flags, IGraphBuilder* graph) = 0;
    virtual HRESULT GetFilterGraph(IGraphBuilder** out) = 0;
    virtual HRESULT GetFilter(IMediaStreamFilter** out) = 0;
    virtual HRESULT AddMediaStream(IUnknown* stream, const MSPID* id, DWORD flags, IMediaStream** out) = 0;
    virtual HRESULT OpenFile(LPCWSTR name, DWORD flags) = 0;
    virtual HRESULT OpenMoniker(IBindCtx* ctx, IMoniker* moniker, DWORD flags) = 0;
    virtual HRESULT Render(DWORD flags) = 0;
};
