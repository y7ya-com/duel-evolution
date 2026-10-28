#include "stdafx.h"
#include "mtknLongsound.h"
#include "mtknDshelper.h"

#include "yaneDirectSound.h"
#include "yaneThread.h"

#include "mtknPcmreader.h"
#include "enraPCMReaderFactory.h"

namespace mtknLib {

class kmLongSound : public virtual IkmLongSound, public CThread
{
public:
	void SetOffset(LONG lPos){ m_StartOffsetPos = lPos; }
	LONG GetOffset(void){ return m_StartOffsetPos; }
	void SetLoop(bool bLoop, LONG lLoopPos)	// [Konami] added lLoopPos
	{
		m_CriticalSection.Enter();
		m_bLoop = bLoop;
		m_lLoopPos = lLoopPos;	// [Konami] added
		if(GetReader()!=NULL) { GetReader()->SetLoop(m_bLoop, lLoopPos); }	// [Konami] passes lLoopPos
		m_CriticalSection.Leave();
	}
	bool IsLoop(bool bLoop){ return m_bLoop; }
		

protected:
	bool canUseNotify;
	bool m_bLoop;
	bool m_bOpen;
	bool m_bSuspend;
	LONG m_lLoopPos;	// [Konami] added: loop restart position handed to the reader (name is ours)

	//--- 追加 '01/11/20  by enra ---
	// 再生時のオフセット位置(msec)
	LONG m_StartOffsetPos;
	// 再生スレッド生成を示すイベント
	HANDLE m_hCreateEvent;
	// PCMReaderのファクトリー
	smart_ptr<CPCMReaderFactory> m_lpReaderFactory;
	virtual void SetFactory(smart_ptr<CPCMReaderFactory> pv)
	{
		m_lpReaderFactory = pv;
	}
	virtual smart_ptr<CPCMReaderFactory> GetFactory(void)
	{
		return m_lpReaderFactory;
	}
	IkmPCMstream* m_reader;
	IkmPCMstream* GetReader(void) const { return m_reader; }
	//-------------------------------
	//--- 追加 '02/01/03  by enra ---
	string m_filename;
	//-------------------------------
	//--- 追加 '02/01/07  by enra ---
	// [Konami] made static: one critical section (a global object at 0xd45078) shared by all instances
	static CCriticalSection m_CriticalSection;
	//-------------------------------
	//--- 追加 '02/03/03  by enra ---
	LONG m_Volume;
	//-------------------------------

	CDirectSound *cds;
	int m_bufTime;

	IkmStreamSoundHelper *m_lpDShelper;
	IDirectSoundBuffer *m_lpDSBuffer;
	// [Konami] removed: IDirectSoundNotify *m_pDSNotify; DSBPOSITIONNOTIFY *m_aPosNotify; HANDLE m_hNotificationEvent;


	DWORD m_prevWritepos;
	DWORD m_TotalWrittenBytes;

	WAVEFORMATEX *m_pWaveFormat;
	DWORD m_PCMFileSize;

	bool fadeOut()
	{
		HRESULT SetVolume( LONG lVolume );
		return true;
	}
public:
	kmLongSound() 
	{
		CDirectSound::AddRef();
		cds = CDirectSound::GetCDirectSound();
		m_bOpen=false;
		m_bLoop=true;
		m_lLoopPos=0;	// [Konami] added
		m_lpDSBuffer=NULL;
		m_lpDShelper=NULL;
		m_prevWritepos=0;
		m_bufTime=4;
		// [Konami] removed: m_pDSNotify=NULL; m_aPosNotify=NULL;
		m_reader=NULL;
		// [Konami] removed: m_hNotificationEvent=CreateEvent(NULL,FALSE,FALSE,NULL);
		m_TotalWrittenBytes=0;
		m_bSuspend=false;
		m_PCMFileSize=~1;

		//--- 追加 '01/11/20  by enra ---
		m_StartOffsetPos = 0;
		m_lpReaderFactory.Add(); // Default Factory
		m_hCreateEvent = NULL;
		//-------------------------------
		//--- 追加 '02/03/03  by enra ---
		m_Volume = 0;
		//-------------------------------
	}
	~kmLongSound()
	{
		close();
		// [Konami] removed: CloseHandle(m_hNotificationEvent)
		CDirectSound::DelRef();
	}
/*	bool pause()
	{
		if( m_lpDSBuffer && IsThreadExecute() ){
			m_lpDSBuffer->Stop();
			m_bSuspend=true;
		}
		return true;
	}
*/
	bool resume()
	{
		if(m_bOpen && m_bSuspend) {
			CreateThread();
			//--- 修正 '01/11/20  by enra ---
			//Sleep(10);
			// スレッドは出来てんのかー？
			::WaitForSingleObject(m_hCreateEvent,INFINITE);
			// イベントハンドルを解放
			CloseHandle(m_hCreateEvent);
			m_hCreateEvent = NULL;
			//-------------------------------
			//--- 追加 '02/01/03  by enra ---
			m_bSuspend = false;	// 停止状態じゃない
			//-------------------------------
			return true;
		}
		else 
			return false;
	}

	virtual bool open(const char *filename, bool aLoop/*=true*/)
	{
		close();
		m_bLoop=aLoop;
		m_filename = filename;
		if(inner_open()){
			m_bOpen = false;
			return false;
		}
		//play();
		return true;
	}

	//--- 修正 '01/11/19  by enra ---
	virtual bool play(){
		if(m_bOpen){
			inner_open();	// 毎回開き直してやらないとバッファが解放されない
			m_bSuspend = false;// 停止状態じゃない
			m_hCreateEvent = ::CreateEvent(NULL,false,false,NULL);
			CreateThread();
			//--- 修正 '01/11/20  by enra ---
			//Sleep(10);
			// スレッドは出来てんのかー？
			::WaitForSingleObject(m_hCreateEvent,INFINITE);
			// イベントハンドルを解放
			CloseHandle(m_hCreateEvent);
			m_hCreateEvent = NULL;
			//-------------------------------
			return true;
		} else {
			return false;
		}
	}
	//-------------------------------

	bool stop(bool doFadeOut=false)
	{
		if(!m_bOpen)
			return false;

		// [Konami] removed: if(doFadeOut) fadeOut();
		// [Konami] removed: if(m_bSuspend && m_hNotificationEvent){ InvalidateThread(); PulseEvent(m_hNotificationEvent); }

		// [Konami] only stops the thread when it is still valid
		if(IsThreadValid()){
			StopThread();
			// 止まるまで待つ
			while(!ThreadSleep(100)){};
		}

//		m_bOpen=false;		// いらんと思う
		// [Konami] removed: delete [] m_aPosNotify;
		return true;
	}

	// 追加
	virtual bool isplay(void) {
		return ((GetCurrentPos()>=0) && !m_bSuspend
				//--- 追加 '01/11/18  by enra ---
				&& m_lpDSBuffer!=NULL
				//-------------------------------
				);
		// 現在位置が 0 以上で pause 中でなかったら true
	}
//	GetCurrentPosを見て判断していますが、これはバッファの位
//	置で、全体通しての位置にはなっていません。
//	それでここをgetCurrentPositionに《Kaine》
//  あんまり正確じゃないから使わない方が吉《炎羅》

	LONG GetFrequency(void){// CSound のやつコピペ(^^;

		if(m_lpDSBuffer==NULL) return -1; // バッファも用意せんと呼ぶなっちゅーに！

		DWORD dwFreq;
		if( m_lpDSBuffer->GetFrequency( &dwFreq ) != DS_OK ) return -2;
		return( (LONG)dwFreq );
	}
	LRESULT SetFrequency( DWORD freq ){// CSound のやつコピペ(^^;
		if(m_lpDSBuffer==NULL) return 1; // バッファも用意せんと呼ぶなっちゅーに！
		if((DSBFREQUENCY_MIN<=freq && freq<=DSBFREQUENCY_MAX) || freq==DSBFREQUENCY_ORIGINAL)
			if( m_lpDSBuffer->SetFrequency( freq ) == DS_OK ) return 0;
		return 2;
	}

	virtual const WAVEFORMATEX* getFormat() const
	{
		if(GetReader()!=NULL){
			return GetReader()->GetFormat();
		}
		return NULL;
	}

	//--- 削除 '02/01/05  by enra ---
/*	virtual LRESULT SetCurrentPos(LONG lPos) // [ms]
	{	
		HRESULT hr;
//		pause();	// 多分いらないと思う
//		hr = GetReader()->setPos(lPos);
		DWORD dwPos = GetReader()->GetPosToByte(lPos);
//		Err.Out("SetPos %d,%d",lPos,dwPos);
		hr = InitSoundData(dwPos);
		resume();
		return 0;
	}*/
	//-------------------------------

/*	virtual LONG	GetCurrentPos(void){
		if( !m_lpDSBuffer )// バッファなし
			return -1;
	//writeの周回遅れは考えない
		DWORD playpos,writepos;
		m_lpDSBuffer->GetCurrentPosition( &playpos, &writepos);// 現在位置取得
		writepos = helper->getWritepos();// 本当の書き込み位置取得(なのかな？)

		LONG lTotalMS =	 GetReader()->GetCurrentPos();// 読み込んでる位置を取得

		DWORD differ_totalLen;// 現在書き込んでる長さを保持
		if( writepos < playpos)// 書き込み < プレイ位置 ってことはループした
			differ_totalLen =  helper->getBufferSize() 
						+writepos - playpos;
		else if (writepos > playpos)// 書き込み > プレイ位置 ってことは通常
			differ_totalLen =  writepos- playpos;
		else // 書き込み == プレイ位置
		{	//ここには、最初(or プレイ前)にくる。
			if( m_bSuspend )// 一時停止中
				differ_totalLen = helper->getBufferSize();
			else // 再生されてない
				return -1; 
		}
		LONG lDifferMS = (LONG) ((DWORDLONG)differ_totalLen * 1000 / getFormat()->nAvgBytesPerSec);// あと 何ms かかるか？
//		Err.Out("total %d,dif %d",lTotalMS,lDifferMS);
		return lTotalMS - lDifferMS;
	}
*/
	//--- 修正 '02/01/03  by enra ---
	virtual LONG GetCurrentPos()
	{
		if( !m_lpDSBuffer )	return m_StartOffsetPos;	//	バッファが無いんでオフセット返しとこ^^;
		//writeの周回遅れは考えない
		DWORD playpos,writepos;
		m_lpDSBuffer->GetCurrentPosition( &playpos, &writepos);
		writepos = m_lpDShelper->getWritepos();

		DWORD total=m_TotalWrittenBytes;

		DWORD differ_totalLen;
		if( writepos < playpos) {
			differ_totalLen = m_lpDShelper->getBufferSize() + writepos - playpos;
		} else if (writepos > playpos) {
			differ_totalLen =  writepos - playpos;
		} else {
			//ここには、最初(or プレイ前)にくる。
			if( m_bSuspend ) {
				differ_totalLen = m_lpDShelper->getBufferSize();
			} else {
				return m_StartOffsetPos;	// オフセット返しとこ^^;
			}
		}
		// Byteの位置を得る
		DWORD pos = (total - differ_totalLen
					+ GetReader()->GetPosToByte(m_StartOffsetPos)
					) % m_PCMFileSize;
		// msecに変換
		const WAVEFORMATEX* ex = getFormat();
		if(ex!=NULL&&ex->nAvgBytesPerSec!=0) {
			return ::MulDiv(pos, 1000, ex->nAvgBytesPerSec);
		}else{
			return m_StartOffsetPos;
		}
	}
	//-------------------------------

	virtual LRESULT SetVolume(LONG volume)
	{
		//--- 追加 '02/03/03  by enra ---
		m_Volume = volume;
		//-------------------------------
		if (m_lpDSBuffer==NULL) return 1; // 不正でっせー

		// 範囲外のエラーチェックせーへんから、勝手にやってやー
		return m_lpDSBuffer->SetVolume(volume);

		// DSBVOLUME_MAX（減衰なし） :		0
		// DSBVOLUME_MIN（無音）	 : -10000
		// の間で指定するのよん。
	}

	virtual LONG GetVolume(void) 
		// 取得は、特定チャンネルに対してしかできない...
	{
		//--- 修正 '02/03/03  by enra ---
		if (m_lpDSBuffer==NULL) return m_Volume;	// 内部変数を返す
		//-------------------------------
		LONG volume;
		if ((m_lpDSBuffer->GetVolume(&volume))!=DS_OK){
			Err.Out("CStreamSound::GetVolumeに失敗");
			return 0; // volumeはDSBVOLUME_MAXを返しとこか?
		}
		return volume;
	}

	virtual LONG GetLength(void)
	{
		if(GetReader()!=NULL){
			return GetReader()->GetLength();
		}
		return 0;
	}

protected:

	int inner_open();
	int InitDirectSoundBuffer();
	LRESULT GetNextSoundData();
	void ThreadProc();

	int close()
	{
		stop(false);

		// [Konami] removed: m_pDSNotify->Release();
		if(m_lpDSBuffer){
			m_lpDSBuffer->Release();
			m_lpDSBuffer=NULL;
		}
		// [Konami] removed: delete [] m_aPosNotify;
		//--- 修正 '01/11/19  by enra ---
		//delete m_reader;	m_reader=NULL;
		if(m_reader!=NULL){
			// DLLから来たReaderの場合、DLL空間内でdeleteしなくてはならない
			GetReader()->DeleteSelf();
			m_reader=NULL;
		}
		//-------------------------------
		if(m_lpDShelper!=NULL){
			delete m_lpDShelper;
			m_lpDShelper=NULL;
		}

		m_bSuspend = false;// 停止状態じゃない
		m_bOpen = false;
		return 0;
	}

	bool InitSoundData(DWORD pos=0/*byte*/)
	{
		if(m_lpDSBuffer==NULL){return false;}
		if(m_lpDShelper==NULL){return false;}

		m_lpDSBuffer->SetCurrentPosition(0);
		m_prevWritepos=0;
		DWORD len=(m_lpDShelper->getBufferSize()/8*7) & ~3;	// [Konami] rounded down to 4 bytes

		m_lpDShelper->setPos(pos);

		DWORD read=m_lpDShelper->UpdateDirectSound(len);
		m_TotalWrittenBytes += read;

		//なぜかダイレクトサウンドバッファの終端をまたいだ
		if( len != read)
			m_TotalWrittenBytes += m_lpDShelper->UpdateDirectSound(0);
		return true;
	}
	
};

// @yo2 0x004258c0 review
int kmLongSound::inner_open()
{
	//--- 修正 '02/01/03  by enra ---
	if (m_filename==""||m_filename.empty()) return 2;
	close();
	//-------------------------------
	//--- 修正 '01/11/19  by enra ---
	m_reader = GetFactory()->CreateReader(m_filename.c_str());
	//-------------------------------
	if ( !m_reader ){
		return 3;
	}

	GetReader()->SetLoop(m_bLoop, m_lLoopPos);	// [Konami] passes m_lLoopPos
	m_PCMFileSize = GetReader()->GetPCMLength();
	if(m_PCMFileSize==0){ m_PCMFileSize = ~1; }

	m_TotalWrittenBytes=0;

	m_bOpen=true;
	return 0;
}
// DirectSoundの初期化
// @yo2 0x00425b40 review
int kmLongSound::InitDirectSoundBuffer()
{
	m_lpDShelper = IkmStreamSoundHelper::create(cds,m_reader);
	if( !m_lpDShelper )
		return 1;

	m_lpDSBuffer = m_lpDShelper->CreateDirectSoundBuffer(m_bufTime);
	if( !m_lpDSBuffer )
		return 2;

	m_lpDSBuffer->AddRef();

	//	ボリュームの設定
	const LONG temp = m_Volume;
	m_CriticalSection.Enter();
	SetVolume(temp);
	m_CriticalSection.Leave();

	canUseNotify=false;
/*
	// Notify設定 Nt4ではQuertInterfaceが失敗する。
	int divideNum = m_bufTime ;
	DWORD m_dwSoundLength = m_lpDShelper->getBufferSize();

	if FAILED( m_lpDSBuffer->QueryInterface( IID_IDirectSoundNotify, 
											 (VOID**)&m_pDSNotify ) ) 
	{
		Err.Out("SLongSound::open IdirectSoundNotify QUeryに失敗");
		canUseNotify=false;
		return 0;
	}

	m_aPosNotify = new DSBPOSITIONNOTIFY[ divideNum + 1 ];
	int i;
	for( i = 0; i <divideNum; i++ )
	{
		m_aPosNotify[i].dwOffset = m_dwSoundLength*(i+1)/divideNum;
		m_aPosNotify[i].hEventNotify = m_hNotificationEvent;
	}
	m_aPosNotify[i-1].dwOffset	 = m_dwSoundLength-1;

	m_aPosNotify[i].dwOffset	 = DSBPN_OFFSETSTOP;
	m_aPosNotify[i].hEventNotify = m_hNotificationEvent;
	
	if FAILED( m_pDSNotify->SetNotificationPositions( divideNum +1, 
													   m_aPosNotify ) ) 
	{
		Err.Out("SLongSound::open IdirectSoundNotify Setに失敗");
		canUseNotify=false;
		return 0;
	}
	canUseNotify=true;
*/

	return 0;
}



//前回の呼び出しから消費された分のバッファを補充する
// @yo2 0x00425be0 review
LRESULT kmLongSound::GetNextSoundData()
{
	m_CriticalSection.Enter();	// [Konami] moved here from ThreadProc
	DWORD playpos,writepos;
	m_lpDSBuffer->GetCurrentPosition( &playpos, &writepos);
	DWORD usedSize ;

	//え？消費してないの？
	//for cannot use notify
	if( writepos == m_prevWritepos)
	{
		m_CriticalSection.Leave();	// [Konami] added
		//--- 修正 '01/11/19  by enra ---
		// こらー、こんなんで待つなー
		//Sleep(50);
		ThreadSleep(20);	// [Konami] 50 -> 20
		//-------------------------------
		return 0;
	}

	//循環した？
	if( writepos >	m_prevWritepos)
		usedSize = writepos- m_prevWritepos;
	else
		usedSize =	m_lpDShelper->getBufferSize() +
					writepos - m_prevWritepos;
//		   wpos playpos wpos+usedSize
//	--------|-----|-------|-----------(buffer)
//			 ~~~~~~~~~~~~~usedSize

	// [Konami] added: the play cursor is behind the write cursor (wrapped);
	//          do not write past it through the end of the buffer
	if( playpos < m_lpDShelper->getWritepos() ){
		if( m_lpDShelper->getWritepos() + usedSize > m_lpDShelper->getBufferSize() + playpos )
			usedSize = m_lpDShelper->getBufferSize() + playpos - m_lpDShelper->getWritepos();
	}
	// [Konami] playpos > getWritepos() -> playpos >= getWritepos()
	if( playpos >= m_lpDShelper->getWritepos() &&
		m_lpDShelper->getWritepos() + usedSize  > playpos )
		usedSize = playpos - m_lpDShelper->getWritepos();
//	printf("%7d %7d %7d %7d",m_prevWritepos,writepos,usedSize, 
//						abs((int)helper->getWritepos()- (int)writepos) );
//	if( helper->getWritepos() < playpos)
//		printf(" *");
//	printf("\n");

	// [Konami] added: only write whole 4-byte units, and wait until at least half a second is free
	usedSize &= ~3;
	if( usedSize < getFormat()->nAvgBytesPerSec / 2 ){
		m_CriticalSection.Leave();
		ThreadSleep(20);
		return 0;
	}

	m_prevWritepos = writepos;
	DWORD UpdateSize = usedSize;
	DWORD written=m_lpDShelper->UpdateDirectSound(UpdateSize);
	m_TotalWrittenBytes += written;
	m_CriticalSection.Leave();	// [Konami] added
	if(written==0){
		if(!m_bLoop){
//			InvalidateThread();
			return 1;
		}
	}
	return 0;
}

//ブレークポイントを仕掛けやすいとかの理由で下の方に。
// @yo2 0x00425da0 feat
void kmLongSound::ThreadProc()
{
	if(!m_bOpen){
		::SetEvent(m_hCreateEvent);
		return;
	}

	if(!m_bSuspend) {// 一時停止中でなかったら初期化する
		if( InitDirectSoundBuffer() != 0){
			m_bOpen=false;
			::SetEvent(m_hCreateEvent);
			return;
		}
		//--- 修正 '01/11/19　by enra ---
		InitSoundData(GetReader()->GetPosToByte(m_StartOffsetPos));
		//-------------------------------
	}

	::SetEvent(m_hCreateEvent);
	// [Konami] removed: the dead if(false/*canUseNotify*/) branch (it waited on m_hNotificationEvent)
	{
		m_lpDSBuffer->Play(0,0,DSBPLAY_LOOPING);
		const LONG len = GetLength();
		int ret = 0;
		while(IsThreadValid()){
			// [Konami] the critical section is now taken inside GetNextSoundData
			ret = GetNextSoundData();
			//--- 追加 '02/01/07  by ENRA ---
			const int diff = len - GetCurrentPos();
			// ret==1 -> ループじゃないからバッファの最後まで再生しないと^^;;
			if(-200<=diff&&diff<=200&&ret==1){
				for(;;){
					const int diff = len - GetCurrentPos();
					if(-100<=diff&&diff<=100){	// この辺の精度で勘弁してや^^;
						m_lpDSBuffer->Stop();
						// [Konami] added: wait until the thread is told to stop
						while(IsThreadValid()){ ThreadSleep(20); }
						m_bSuspend = true;// 停止状態
						return;
					}
					ThreadSleep(20);	// [Konami] 50 -> 20
				}
			}
			// whileの外に置くと、stop()時にもret==1となるためマズい
			//-------------------------------
		}
	}
	m_lpDSBuffer->Stop();
	m_bSuspend = true;// 停止状態
}

// @yo2 0x00425fa0 review
IkmLongSound *IkmLongSound::create()
{
	return new kmLongSound();
}

// [Konami] added: definition of the now-static critical section
CCriticalSection kmLongSound::m_CriticalSection;

};