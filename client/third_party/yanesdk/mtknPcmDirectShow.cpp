#include "stdafx.h"

#include "mtknPcmreader.h"
#include "yanecombase.h"
//--- 追加 '01/11/19  by enra---
#include "enraPCMReaderFactory.h"
//------------------------------

#ifndef _WIN32	// [portable] no DirectShow off Windows: the factory gets NULL and falls back to its other readers
mtknLib::IkmPCMstream* CPCMReaderFactory::CreateDirectShow(::IMultiMediaStream *) { return NULL; }
#else

#include <amstream.h>
#pragma comment(lib,"AMSTRMID.lib")

namespace mtknLib {
class kmDirectShowAudio :public virtual IkmPCMstream
{
protected:
	WAVEFORMATEX	m_destWFormat;	

	::IAMMultiMediaStream *pAMStream;
	::IMultiMediaStream	*pMMStream;
    ::IMediaStream		*pStream;
    ::IAudioStreamSample  *pSample;
    ::IAudioMediaStream   *pAudioStream;
    ::IAudioData		    *pAudioData;
	::IGraphBuilder		*pGraphBuilder;

	bool CreateMMStream();

	bool m_bLoop;
	LONG	m_lLoopPos;		// [Konami] added: loop restart position passed to Seek (name is ours)
	HANDLE	m_hEvent;		// [Konami] added: event for IStreamSample::Update (name is ours)
public:
	kmDirectShowAudio(::IMultiMediaStream *a_pMMStream)
	{
		pAMStream=NULL;
		pMMStream=NULL;
	    pStream=NULL;
	    pSample=NULL;	
	    pAudioStream=NULL;
	    pAudioData=NULL;
		pGraphBuilder=NULL;

		if( !a_pMMStream )
		{
			if(! CreateMMStream() )
				throw "InitDirectShow Failed";
		}else{
			a_pMMStream->QueryInterface(IID_IAMMultiMediaStream, (void**)&pAMStream);
			pMMStream = (a_pMMStream);
			pMMStream->AddRef();
			Open(NULL);
		}

		m_bLoop=true;
		m_lLoopPos = 0;										// [Konami] added
		m_hEvent = ::CreateEvent(NULL,FALSE,FALSE,NULL);	// [Konami] added
//		Err.Out("CStreamSound Create DirectShow");
	}

#define COM_FREE( x ) \
	do{\
	if(x){\
	   x->Release();\
	   x=NULL;\
	}\
	}while(0)

	~kmDirectShowAudio()
	{
		pMMStream->SetState(STREAMSTATE_STOP);

		COM_FREE(pAMStream);
		COM_FREE(pMMStream);
    	COM_FREE(pStream);
    	COM_FREE(pAudioStream);
    	COM_FREE(pAudioData);
    	COM_FREE(pSample);
		COM_FREE(pGraphBuilder);
		::CloseHandle(m_hEvent);	// [Konami] added
	}
#undef COM_FREE

	bool SetLoop(bool f, LONG lLoopPos)	// [Konami] added lLoopPos
	{
		bool old=m_bLoop;
		m_bLoop=f;
		m_lLoopPos = lLoopPos;	// [Konami] added
		return old;
	}

	bool Open(const char *filename);
	
	DWORD 			Read(BYTE *pDestBuf,DWORD destSize)
	{
		// [Konami] rewritten: Update() is given m_hEvent and waited on; at end of stream it always
		//          seeks to m_lLoopPos and reads once more (no m_bLoop / FAILED(hr) checks any more)
		pAudioData->SetBuffer(destSize, pDestBuf, 0);
		HRESULT hr=pSample->Update(0,m_hEvent,NULL,0);
		::WaitForSingleObject(m_hEvent,INFINITE);
		DWORD writtenByte;
		pAudioData->GetInfo(NULL,NULL,&writtenByte);

		if( hr == MS_S_ENDOFSTREAM)
		{
			pMMStream->Seek(m_lLoopPos);
			pSample->Update(0,m_hEvent,NULL,0);
			::WaitForSingleObject(m_hEvent,INFINITE);
			DWORD writtenByte2;
			pAudioData->GetInfo(NULL,NULL,&writtenByte2);
			return writtenByte + writtenByte2;
		}
		return writtenByte;
		// [Konami] removed: if(m_bLoop){ pMMStream->Seek(0); return Read(pDestBuf, destSize); } return 0;
		// [Konami] removed: if FAILED(hr) { pMMStream->SetState(STREAMSTATE_STOP); return 0; }
	}

	WAVEFORMATEX* GetFormat(void)
	{	return &m_destWFormat;	}

	DWORD GetBlockAlignedBufferSize(DWORD time)
	{
		DWORD destSize= m_destWFormat.nSamplesPerSec 
					  * m_destWFormat.nBlockAlign
					  * time ;
		return destSize;
	}

	virtual DWORD GetPCMLength(void)
	{
		STREAM_TIME Duration;
		if( !pMMStream)
			return 0;
		if FAILED( pMMStream->GetDuration(&Duration) )
			return 0;

			DWORD size=m_destWFormat.nSamplesPerSec
				   * m_destWFormat.nBlockAlign
				   * Duration
				   /1000/1000/10 ;
			if(m_destWFormat.nBlockAlign)
			{//どうせ、２の乗数やろ。(うわぁ～)
				size += m_destWFormat.nBlockAlign-1;
				size &= ~(m_destWFormat.nBlockAlign-1);
			}
			return size;
	}

	virtual LONG GetLength(void){
		STREAM_TIME Duration;
		if( !pMMStream)
			return 0;
		if FAILED( pMMStream->GetDuration(&Duration) )	return 0;
		return Duration/10000;
	}

	// posBytesから再生する。
	// ただしこの値は、出力フォーマットによる。
	virtual bool SetPos( DWORD posByte )
	{
		if FAILED(pMMStream->Seek( 
			(__int64)( posByte) * 10000000	// [portable] was __int64( posByte) 
			/ m_destWFormat.nAvgBytesPerSec)
			)
			return false;
		return true;
	}

	virtual LONG GetCurrentPos(void)
	{
		HRESULT hr;
		STREAM_TIME st,ed,cur;
		st=ed=cur=0;
		if ( pSample == NULL ) return -1;
		hr = pSample->GetSampleTimes(&st,&ed,&cur);
		if ( hr != 0 ){
			return -1;
		}
/*		Err.Out("st:%d",st/10000);
		Err.Out("ed:%d",ed/10000);
		Err.Out("cr:%d",cur/10000);
		*/
		return ed/10000;
	}

	virtual DWORD GetPosToByte( LONG lPos )
	{
		DWORD	dwBytes;
		dwBytes = lPos / 1000 * m_destWFormat.nAvgBytesPerSec;
		return dwBytes;
	}
	virtual LONG GetByteToPos(DWORD dwByte) 
	{
		LONG lPos;
		lPos = (LONG)( (DWORDLONG)dwByte * 1000 / m_destWFormat.nAvgBytesPerSec);
		return lPos;
	}

};
#define ERROR_COMFUNC(hr)\
	do{\
		Err.Out( "%s(%d) : %x",__FILE__, __LINE__, hr );\
		return  false;\
	}while(0)


// @yo2 0x00427b90 feat
bool kmDirectShowAudio::CreateMMStream()
{
	HRESULT hr;
	if FAILED( hr=CoCreateInstance(
		CLSID_AMMultiMediaStream, 
		NULL,
		CLSCTX_INPROC_SERVER,
		IID_IAMMultiMediaStream,
		(void**)&pAMStream
	) )
		ERROR_COMFUNC(hr);

	if FAILED( hr=pAMStream->Initialize(STREAMTYPE_READ, 0, NULL) )
		ERROR_COMFUNC(hr);

	if FAILED( hr=pAMStream->AddMediaStream(NULL, &MSPID_PrimaryAudio, 0, NULL) )
		ERROR_COMFUNC(hr);
	
	if FAILED( hr=pAMStream->QueryInterface(IID_IMultiMediaStream, (void**)&pMMStream) )
		ERROR_COMFUNC(hr);
	return true;
}

// @yo2 0x00427c20 feat
bool kmDirectShowAudio::Open(const char *filename)
{
	HRESULT hr;

	if(filename)
	{
		if(! CreateMMStream() )
			return false;
		WCHAR wszName[MAX_PATH];
		MultiByteToWideChar(CP_ACP, 0,filename,-1,
							wszName, MAX_PATH);
		if FAILED( hr=pAMStream->OpenFile(wszName, AMMSF_RUN|AMMSF_NOCLOCK ) ){
			Err.Out("%s:File OpenError.",filename);
			ERROR_COMFUNC(hr);
		}
	}

	if FAILED(hr=pMMStream->GetMediaStream(MSPID_PrimaryAudio, &pStream) )
		ERROR_COMFUNC(hr);
	
	if FAILED(hr=pStream->QueryInterface(IID_IAudioMediaStream, (void **)&pAudioStream) )
		ERROR_COMFUNC(hr);

	if FAILED(hr=pAudioStream->GetFormat(&m_destWFormat))
		ERROR_COMFUNC(hr);

	if FAILED(hr=CoCreateInstance(CLSID_AMAudioData, NULL, CLSCTX_INPROC_SERVER,
		                           IID_IAudioData, (void **)&pAudioData) )
		ERROR_COMFUNC(hr);

	if FAILED(hr=pAudioData->SetFormat(&m_destWFormat) )
		ERROR_COMFUNC(hr);

	if FAILED(hr=pAudioStream->CreateSample(pAudioData, 0, &pSample) )
		ERROR_COMFUNC(hr);

	if FAILED(hr=pAMStream->GetFilterGraph(&pGraphBuilder) )
		ERROR_COMFUNC(hr);

	return true;
}
};

//--- 修正 '01/11/19  by enra---
// @yo2 0x00427de0 review
mtknLib::IkmPCMstream* CPCMReaderFactory::CreateDirectShow(::IMultiMediaStream *a_pMMStream)
{
	try{
		return new mtknLib::kmDirectShowAudio( a_pMMStream );
	}catch( char *)
	{
		return NULL;
	}
}
#endif	// [portable] _WIN32
