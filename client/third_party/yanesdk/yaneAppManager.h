//	yaneAppManager.h :
//		application management class
//			programmed by yaneurao	'00/03/03
//
//		'00/08/04	sohei	Saver関係を追加
//

#ifndef __yaneAppManager_h__
#define __yaneAppManager_h__

#include "yaneCriticalSection.h"
#include "yaneAppBase.h"

//---	Drawing Units
#include "yaneDirectDraw.h"
#include "yaneDIBDraw.h"
#include "yaneFastDraw.h"
#include "soheSaverDraw.h"

class CAppFrame;

struct CAppManageInfo {
	CAppBase*		m_lpAppBase;		//	ひとつのアプリクラスを持つ
#ifdef USE_DirectDraw
	CDirectDraw*	m_lpDirectDraw;		//	ひとつの描画クラスを持つ
#endif
#ifdef USE_FastDraw
	CFastDraw*		m_lpFastDraw;		//	↑FastDrawの場合は、こっち
#endif
#ifdef USE_DIB32
	CDIBDraw*		m_lpDIBDraw;		//	↑DIBの場合は、こっち
#endif
#ifdef USE_SAVER
	CSaverDraw*		m_lpSaverDraw;		//	スクリーンセーバー用
#endif
	CAppFrame*		m_lpAppFrame;		//	もしかしたら一つのフレームクラスを持つ
	DWORD			m_dwThreadID1;		//	メインスレッドのThreadID
//	DWORD			m_dwThreadID2;		//	メッセージループのThreadID
};	//	マルチスレッドやめました＾＾

typedef auto_vector_ptr<CAppManageInfo> CAppManageList;

class CAppManager {
public:
	static	void	Add(CAppBase*);
	static	void	Del(CAppBase*);
	static	void	Add(CAppFrame*);
	static	void	Del(CAppFrame*);
#ifdef USE_DirectDraw
	static	void	Add(CDirectDraw*);
	static	void	Del(CDirectDraw*);
	static	CDirectDraw* GetMyDirectDraw();
#endif
#ifdef USE_FastDraw
	static	void	Add(CFastDraw*);
	static	void	Del(CFastDraw*);
	static	CFastDraw* GetMyFastDraw();
#endif
#ifdef USE_DIB32
	static	void	Add(CDIBDraw*);
	static	void	Del(CDIBDraw*);
	static	CDIBDraw*	 GetMyDIBDraw();
#endif
#ifdef USE_SAVER
	static	void	Add(CSaverDraw*);
	static	void	Del(CSaverDraw*);
	static	CSaverDraw*	 GetMySaverDraw();
#endif
	static	CAppBase*	 GetMyApp();
	static	CAppFrame*	 GetMyFrame();
	static	bool	IsDirectDraw();
	static	int		GetDrawType();

	static	int		GetAppInstanceNum();
	static	void	StopAllThread();

	static	void Inc();	//	参照カウントのインクリメント
	static	void Dec();	//	参照カウントのデクリメント
	static	int GetRef();

protected:
// volatile↓なのだが...
	static	CAppManageList m_alpInfo;
	static	CCriticalSection m_oCriticalSection;
	static	int m_nRef;	//	参照カウント
};

#endif
