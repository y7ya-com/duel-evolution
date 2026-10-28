// yaneLoadCache.h

#ifndef __yaneLoadCache_h__
#define __yaneLoadCache_h__

#include <LIMITS.h>	//	INT_MAX

class CLoadCacheListener {
public:
//	読み込み時のコールバック。必要ならばnNoを変更できる
// @yo2 0x0053a8e0 vt
virtual void OnLoad(int &nNo) {}
virtual ~CLoadCacheListener() {}
};

struct SLOAD_CACHE {
	LPSTR	lpszFilename;
	int		nReleaseLevel;
};

class CLoadCache {
public:
	virtual LRESULT	Set(SLOAD_CACHE*);			//	定義リストの設定
	virtual LRESULT	Set(string filename);		//	定義ファイルの読み込み

	virtual LRESULT	Load(int nNo,int ReleaseLevel=-1);	//	読み込み

	virtual void	Release(int nNo);						//	解放
	virtual void	ReleaseAll(int nReleaseLevel=INT_MAX);	//	全解放
	virtual void	ReleaseAll(int nStart,int nEnd,int nReleaseLevel=INT_MAX);
													//	全解放

	//	古くなったものを解放する
	virtual void	ReleaseStaleAll(int nReleaseTime=INT_MAX);
	virtual void	ReleaseStaleAll(int nStart,int nEnd,int nReleaseTime=0);
	virtual void	IncStaleTime(void);					//	時間を経過させる
	//	nReleaseTimeより以前に読み込んだものは解放する

	//	おまけ
	// @yo2 0x0042e6e0 vt
	virtual int		GetMax(void) { return m_nMax; }

	//	property..
	// @yo2 0x0042e700 vt
	virtual void	SetLoadCacheListener(smart_ptr<CLoadCacheListener> v) { m_vLoadCacheListener = v;}
	// @yo2 0x0042e7f0 vt
	virtual smart_ptr<CLoadCacheListener> GetLoadCacheListener() { return m_vLoadCacheListener; }

	//	２度読みの禁止(default:true == ２度読み可能)
	// @yo2 0x0042e860 vt
	virtual void	SetCanReloadAgain(bool b) { m_bCanReloadAgain = b; }

	CLoadCache(void);
	virtual ~CLoadCache();

protected:
	virtual	void		SetMax(int nMax);				//	最大数の設定・確保＾＾
	void		InnerRelease(void);				//	内部的な解放

	int				m_nMax;
	SLOAD_CACHE*	m_lpSLOAD_CACHE;

	auto_array<bool>m_lpbLoad;
	auto_array<int>	m_lpnReleaseLevel;
	auto_array<int> m_lpnStaleTime;

	//	ファイルから設定ファイルを読み込むときのために．．．
	auto_array<SLOAD_CACHE> m_aLoadCache;
	auto_array<string>		m_aFileName;

	//	ひとつの要素に読み込み／解放
	virtual	LRESULT InnerLoad(int) = 0;
	virtual LRESULT InnerRelease(int) = 0;
	//	m_nMax分だけ配列を確保／解放
	virtual void	InnerCreate(void) = 0;
	virtual void	InnerDelete(void) = 0;

	//	設定ファイルの２度読み禁止フラグ
	bool	m_bCanReloadAgain;

	smart_ptr<CLoadCacheListener>	m_vLoadCacheListener;

};

#endif
