//
//	yaneBGMLoader.h :
//
//		サウンドの統括的ローディング
//

#ifndef __yaneBGMLoader_h__
#define __yaneBGMLoader_h__

#include "yaneVolumeFader.h"
#include "yaneLoadCache.h"

#include "enraPCMReaderFactory.h"

class CSoundBase;
class CBGMLoader;
class CBGMLoaderListener : public mediator<CBGMLoader>
{
public:
	virtual ~CBGMLoaderListener(){};
	// @yo2 0x0042e880 vt
	virtual void OnPlay(int nNo){};
	// @yo2 0x0042e8a0 vt
	virtual void OnReplay(int nNo){};
};
class CBGMLoader : public CLoadCache
{
public:
	virtual LRESULT	Set(SLOAD_CACHE*);			//	これ設定するなりよ＾＾
	// @yo2 0x0042e8f0 vt
	virtual LRESULT	Set(string filename) { return CLoadCache::Set(filename); }
	//	↑ディフォルトで遮蔽定義されてしまうのでこれも必要

	void	Load(int nBGMNo);			//	事前に読み込む
	void	Play(int nBGMNo);			//	再生。現在、同番が再生されていれば再生しない
	void	PlayN(int nBGMNo);			//	再生。現在、同番が再生されていれば、先頭から。
	void	PlayOnce(int nBGMNo);		//	非ループ再生。現在、同番が再生されていれば再生しない
	void	PlayOnceN(int nBGMNo);		//	非ループ再生。現在、同番が再生されていれば、先頭から。
	void	Stop(void);					//	停止
	void	Pause(void);				//	Pause
	void	Replay(void);				//	↑でとめたやつの再開
	int		GetPlayNo(void);			//	現在再生中の番号を得る
	bool	IsLoopPlay(void);			//	それはループ再生なのか？
	bool	IsPlay(int nNo);			//	サウンドは再生中なのか？

//	void	Release(int nNo);
//	void	ReleaseAll(int nReleaseLevel=INT_MAX);	//	解放
//	void	ReleaseAll(int nStart,int nEnd,int nReleaseLevel=INT_MAX);
													//	全解放
	LONG	GetCurrentPos(void);		//	現在の再生位置取得([ms])

	smart_ptr<CVolumeFader> GetFader(void)		{ return m_vVolumeFader; }

	//	再生キャンセルフラグ
	bool*		GetCancelFlag(void)		{ return &m_bCancel; }

#ifdef USE_StreamSound
	//	ストリーム再生を強制するオプション(default : false)
	void	UseStreamSound(bool	bEnable) { m_bStreamSound = bEnable; }
#endif

	//	override from CLoadCache
	virtual void	IncStaleTime(void);					//	時間を経過させる

	CBGMLoader(const smart_ptr<CVolumeFader>& v = NULL);
	virtual ~CBGMLoader();

	CSoundBase*	GetSound(int nNo);		//	サウンドバッファ取得
	//	一応、public^^;

	// @yo2 0x0042ea80 vt
	virtual void SetReaderFactory(const smart_ptr<CPCMReaderFactory>& p) { m_lpReaderFactory = p; }
	// @yo2 0x0042ead0 vt
	virtual smart_ptr<CPCMReaderFactory> GetReaderFactory() { return m_lpReaderFactory; }

	// @yo2 0x0042eb40 vt
	virtual void SetListener(const smart_ptr<CBGMLoaderListener>& p) { m_vListener = p;  m_vListener->SetOutClass(this); }
	// @yo2 0x0042ebc0 vt
	virtual smart_ptr<CBGMLoaderListener> GetListener() { return m_vListener; }

protected:

	int				m_nPlayNo;			//	現在、再生されているやつ＾＾
	int				m_nPauseNo;			//	現在Pauseしているやつ＾＾；
	bool			m_bBGMLoop;			//	ループ再生なのか？

	auto_vector_ptr<CSoundBase> m_lpSound;
	auto_array<bool>			m_lpbMIDI;

	//	ひとつの要素に読み込み／解放
	virtual	LRESULT InnerLoad(int nNo);
	virtual LRESULT InnerRelease(int nNo);
	//	m_nMax分だけ配列を確保／解放
	virtual void	InnerCreate(void);
	virtual void	InnerDelete(void);

	smart_ptr<CVolumeFader>	m_vVolumeFader;	//	ヴォリュームのフェード用
	void			InnerRelease(void);		//	内部的な解放
	bool			m_bCancel;				//	BGMキャンセルフラグ
	bool			m_bStreamSound;			//	ストリーム再生を行なうのか？

	// プラグイン対応～
	smart_ptr<CPCMReaderFactory> m_lpReaderFactory;

	smart_ptr<CBGMLoaderListener> m_vListener;
};



#endif
