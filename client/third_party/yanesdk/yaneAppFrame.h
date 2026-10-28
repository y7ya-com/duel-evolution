//	yaneAppFrame.h :
//			programmed by yaneurao	'00/06/16

#ifndef __yaneAppFrame_h__
#define __yaneAppFrame_h__

#include "yaneAppBase.h"
#include "yaneAppManager.h"

class CAppFrame {
public:
	void	Start(void) { m_lpMyApp = CAppManager::GetMyApp(); MainThread();}
	void	MesSleep(int nTime);	//	メッセージを処理しながらまわる

	//	スレッドの無効化
	void	InvalidateThread(void) { GetMyApp()->InvalidateThread(); }

	//	呼び出し元のアプリクラスの取得
	CAppBase* GetMyApp(void)const { return m_lpMyApp; }

	//	これが真の間、スレッドをまわしてね！
	bool IsThreadValid(void)const { return GetMyApp()->IsThreadValid(); }

	//	コンストラクタ～デストラクタで、CAppManagerに登録しておく
	CAppFrame(void);
	virtual ~CAppFrame();

protected:
	//	これはユーザーが用意する
	virtual void MainThread(void) = 0;

private:
	CAppBase* m_lpMyApp;
};

#endif
