//
//	yaneSELoader.h :
//
//		ＳＥの統括的ローディング
//

#ifndef __yaneSELoader_h__
#define __yaneSELoader_h__

#include "yaneLoadCache.h"
#include "enraPCMReaderFactory.h"

#include "yaneRootCounter.h"
const	int	CSELoaderCount = 5;		//	ディフォルトでは５フレーム以内ならば再生再開しない

class CSound;
class CSELoader;
class CSELoaderListener : public mediator<CSELoader>
{
public:
	virtual ~CSELoaderListener(){};
	// @yo2 0x00566e20 vt
	virtual void OnPlay(int nNo){};
};

class CSELoader : public CLoadCache {
public:
	//	フレームが経過した場合
	void		OnPlay(void);				//	毎フレーム呼び出す
	void		PlayN(int nNo);				//	いますぐ再生する(非ループ再生)
	void		Play(int nNo);				//	鳴っていなければ再生する(非ループ再生)
	void		PlayLN(int nNo);			//	いますぐ再生する(ループ再生)
	void		PlayL(int nNo);				//	鳴っていなければ再生する(ループ再生)
	void		PlayT(int nNo,int nTimes,int nInterval=0);
											//	再生回数指定再生
	void		Stop(int nNo);				//	サウンドを止める
	void		Reset(int nLevel=INT_MAX);	//	サウンドの排他カウンタのリセット
	bool		IsPlay(int nNo);			//	サウンドは再生中なのか？

	CSound*		GetSound(int nNo);	//	サウンドの取得

	//	再生キャンセルフラグ
	bool*		GetCancelFlag(void)		{ return &m_bCancel; }
	void		OnPlayAndReset(void);	//	強制的に再生

	//	再生インターバルの設定(ディフォルトではCSELoaderCount)
	void	SetLockInterval(int nLockInterval) { m_nLockInterval = nLockInterval; }
	int		GetLockInterval(void) { return m_nLockInterval; }

	//	override from CLoadCache
	virtual void	IncStaleTime(void);					//	時間を経過させる

	CSELoader(void);
	virtual ~CSELoader();

	// @yo2 0x00566e70 vt
	virtual void SetReaderFactory(const smart_ptr<CPCMReaderFactory>& p) { m_lpReaderFactory = p; }
	// @yo2 0x00566ec0 vt
	virtual smart_ptr<CPCMReaderFactory> GetReaderFactory() { return m_lpReaderFactory; }

	// @yo2 0x00566f30 vt
	virtual void SetListener(const smart_ptr<CSELoaderListener>& p) { m_vListener = p;  m_vListener->SetOutClass(this); }
	// @yo2 0x00566fb0 vt
	virtual smart_ptr<CSELoaderListener> GetListener() { return m_vListener; }

protected:
	auto_vector_ptr<CSound>		m_lpSound;
	auto_array<int>				m_anPlay;			//	再生フラグ(再生後のフレーム経過しているか)
	auto_array<CRootCounterS>	m_anInterval;

	//	ひとつの要素に読み込み／解放
	virtual	LRESULT InnerLoad(int nNo);
	virtual LRESULT InnerRelease(int nNo);
	//	m_nMax分だけ配列を確保／解放
	virtual void	InnerCreate(void);
	virtual void	InnerDelete(void);

	bool	m_bCancel;			//	BGMキャンセルフラグ
	int		m_nLockInterval;	//	このフレーム以内ならば再生再開しない

	// プラグイン対応～
	smart_ptr<CPCMReaderFactory> m_lpReaderFactory;

	smart_ptr<CSELoaderListener> m_vListener;
};

#endif