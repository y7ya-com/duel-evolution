#include "stdafx.h"

#include "yaneDirectSound.h"
#include "mtknPcmreader.h"
#include "mtknDshelper.h"
namespace mtknLib {

class kmStreamSoundHelper : public IkmStreamSoundHelper
{
	CDirectSound *cds;
	IDirectSoundBuffer *m_lpDSBuffer;
	IkmPCMstream *m_reader;

	DWORD m_differ;
	DWORD m_writepos;
	DWORD m_prevWritepos;
	DWORD m_bufferSize;
	
public:
	kmStreamSoundHelper(
			class CDirectSound *a_cds,
			class IkmPCMstream *a_reader
		)
		: cds( a_cds )
		, m_reader( a_reader)
		, m_lpDSBuffer(NULL)
	{
		CDirectSound::AddRef();
		init();
	}
	bool init()
	{
		m_differ=0;
		m_writepos=0;
		m_prevWritepos=0;
		m_bufferSize=0;
		return true;
	}
	~kmStreamSoundHelper()
	{
		if( m_lpDSBuffer ){
			m_lpDSBuffer->Stop();
			m_lpDSBuffer->Release();
			m_lpDSBuffer=NULL;
		}
		CDirectSound::DelRef();
	}

	DWORD getBufferSize()
	{	return m_bufferSize;	}

	int m_time;
	IDirectSoundBuffer *CreateDirectSoundBuffer(int time)
	{
		m_time=time;
		DSBUFFERDESC  dsbdDesc;
		ZeroMemory(&dsbdDesc, sizeof(DSBUFFERDESC));
		dsbdDesc.dwSize = sizeof(DSBUFFERDESC);
		//--- 修正 '01/11/21  by enra ---
		dsbdDesc.dwFlags = 
			DSBCAPS_CTRLVOLUME |
			// DSBCAPS_CTRLPOSITIONNOTIFYを指定するとVxDドライバでは
			// 強制的にソフトウェアバッファになる。
			// だからこのクラスでは最初からソフトウェアバッファを指定して良い。
			DSBCAPS_LOCSOFTWARE |
			DSBCAPS_GETCURRENTPOSITION2 |
			DSBCAPS_GLOBALFOCUS |
			//DSBCAPS_CTRLPOSITIONNOTIFY |
			0;
		//-------------------------------
		m_bufferSize			= m_reader->GetBlockAlignedBufferSize(time);
		dsbdDesc.dwBufferBytes	= m_bufferSize;
		dsbdDesc.lpwfxFormat	= m_reader->GetFormat();

		// DirectSoundバッファの作成
		HRESULT hr;
		if FAILED(hr=cds->m_lpDirectSound->CreateSoundBuffer
								(&dsbdDesc,&m_lpDSBuffer, NULL) )
		{
			Err.Out("kmStreamSoundHelper::CreateDirectSoundBufferのCreateSoundBuffer()で失敗！:%x",hr);
			return NULL;
		}
		ClearDSBuffer();
		return m_lpDSBuffer;
	}

	//--- 追加 '01/01/07  by enra ---
	LRESULT ClearDSBuffer(void)
	{
		// ロック
		BYTE* lpDSBuffData = NULL;
		DWORD dwBufferLength = 0;
		HRESULT hr;
		hr = m_lpDSBuffer->Lock(0, m_bufferSize, (void**)&lpDSBuffData, &dwBufferLength, NULL, 0, 0);
		if (hr==DSERR_BUFFERLOST){
			cds->CheckSoundLost(); 
			m_lpDSBuffer->Restore();
			hr = m_lpDSBuffer->Lock(0, m_bufferSize, (void**)&lpDSBuffData, &dwBufferLength, NULL, 0, 0);
		}
		if FAILED(hr) {
			m_lpDSBuffer->Stop();
			Err.Out("kmStreamSoundHelper::CreateDirectSoundBufferのm_lpDSBuffer->Lockに失敗！%x",hr);
			return 1;
		}
		// バッファをゼロクリアする
		memset(lpDSBuffData, 0, dwBufferLength);
		// アンロック
		if FAILED(hr=m_lpDSBuffer->Unlock(lpDSBuffData, dwBufferLength, NULL, 0)) {
			Err.Out("kmStreamSoundHelper::CreateDirectSoundBufferのm_lpDSBuffer->Unlockに失敗！%x",hr);
			return 2;
		}
		return 0;
	}
	//-------------------------------

	//IPCMStreamから size 分IDirectSoundBufferに放り込む。
	DWORD UpdateDirectSound( DWORD size)
	{

		size += m_differ;
		m_differ=0;

		if( m_writepos + size > m_bufferSize){
			DWORD newsize = m_bufferSize - m_writepos;
			m_differ=size - newsize;
			size=newsize;
		}

		BYTE* lpDSBuffData;
		DWORD dwBufferLength;

		//ロック
		HRESULT hr;
		hr = m_lpDSBuffer->Lock( m_writepos, size ,
								(void**)&lpDSBuffData , &dwBufferLength,
								NULL, 0, 0 );
		if (hr==DSERR_BUFFERLOST){
			cds->CheckSoundLost();
			m_lpDSBuffer->Restore();
			hr = m_lpDSBuffer->Lock( m_writepos, size,
									(void**)&lpDSBuffData , &dwBufferLength,
									NULL,0,
									0L );
		}

		if FAILED(hr) {
			m_lpDSBuffer->Stop();
			return 8;
		}
		//読み込み
		DWORD read	= m_reader->Read( lpDSBuffData , dwBufferLength	 );

		//かえる準備
		if FAILED(hr=m_lpDSBuffer->Unlock(	lpDSBuffData, dwBufferLength, 
										NULL,0 ) ) {
			Err.Out("kmStreamSoundHelper::UpdateDirectSoundのm_lpDSBuffer->Unlockに失敗！%x",hr);
			return 10;
		}
		m_writepos += read;
		m_writepos %= m_bufferSize;
		//様々な要因により読み込みきれなかった分は先送りする
		if(read < size)
			m_differ= size - read;

		return read;

	}

	
	virtual DWORD getWritepos()
	{
		return m_writepos;
	}
	virtual bool setPos( DWORD pos)
	{	
		m_differ=0;
		m_writepos=0;
		m_prevWritepos=0;
		return m_reader->SetPos(pos);
	}
};

// @yo2 0x00425210 cg
IkmStreamSoundHelper *IkmStreamSoundHelper::create(
			class CDirectSound *a_cds,
			class IkmPCMstream *a_reader
		)
{
		return new	kmStreamSoundHelper(
			a_cds,	a_reader
		);
}
};