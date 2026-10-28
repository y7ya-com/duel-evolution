// yaneWindow.h
//	window base class
//
//	'00/08/04	sohei	CreateSimpleWindow 追加

#ifndef __yaneWindow_h__
#define __yaneWindow_h__

#include "yaneWinHook.h"

class CWindowOption {
public:
	string	caption;	//	キャプション
	string	classname;	//	クラス名(captionと同じでも良い)

	int		size_x;		//	横方向のサイズ
	int		size_y;		//	縦方向のサイズ
	LONG	style;		//	ウィンドゥスタイルの追加指定	

	CWindowOption(void) { style = WS_VISIBLE | WS_CAPTION | WS_MINIMIZEBOX | WS_SYSMENU; }
};

class CWindow : public CWinHook {
public:
	// 窓を作る。親ウィンドウが存在するのならば最後のパラメータで指定すること
	LRESULT		Create(CWindowOption& opt,HWND lpParent=NULL);
	LRESULT		CreateSimpleWindow(CWindowOption& opt,HWND lpParent=NULL);
	HWND		GetHWnd(void)const { return m_hWnd; }	//	HWNDを返す
	LRESULT		SetWindowPos(int x,int y);				//	ウィンドゥを移動
	void		ChangeWindowStyle(void);				//	現在のスクリーンモード用にWindowStyleを変更する
	LRESULT		Resize(int sx,int sy);					//	窓のリサイズ

	//	切り替えが発生した場合、この関数を呼び出したあと
	//	それぞれのウィンドゥに関してChangeWindowStyleを呼び出すこと
	//	ただし、フルスクリーン時のマルチウィンドゥはDirectDrawを使う関係上、非サポート
	static	void	ChangeScreen(bool bFullScr) { g_bFullScreen = bFullScr; }

	void		SetSize(int sx,int sy);
	//	窓のリサイズ（設定のみで実際に変更はしない）
	//	なぜこんなものが必要になるかというと、Resize⇒ChangeWindowStyleと実行すると
	//	２回ウィンドゥサイズの変更を行なうことになって、そのモーションが見えて困るから。
	//	SetSize　⇒　ChangeWindowStyleならば安全。

	//	MouseLayer
	void	UseMouseLayer(bool bUse);	//	ソフトウェアカーソルのためにカーソルを消す
	void	ShowCursor(bool bShow);		//	ハードウェアマウスカーソルの表示／非表示
	bool	IsShowCursor(void);			//	ハードウェアマウスカーソルの表示／非表示を取得

	//	Property
	DWORD		m_dwFillColor;		//	背景色
//	CWindowOption* GetWindowOption(void) { return &m_opt; }
	volatile bool	IsMinimized(void) { return m_bMinimized; }	//	最小化されているか？

	//	メッセージをフックするためのポインタリスト
	CWinHookList* GetHookList(void) { return &m_HookPtrList; } // メッセージのフックリストを与える
	void	ClearAllHook(void) { m_HookPtrList.Clear(); }

	CWindow(void);
	virtual ~CWindow();

	// メニューの存在をチェックし、フラグを更新する by ENRA
	void CheckMenu(void) {
		if(m_hWnd!=NULL&&::GetMenu(m_hWnd)!=NULL){
			m_bUseMenu = true;
		}else{
			m_bUseMenu = true;
		}
	}

	//	その他
	static void	GetScreenSize(int &x,int &y);			//	現在の画面全体のサイズの取得
	static bool	IsFullScreen(void) { return g_bFullScreen; }	//	フルスクリーンか？

protected:
	HWND		m_hWnd;				//	ウィンドゥハンドル
	bool		m_bFullScreen;		//	現在どちらのモードに合わせて窓を作っているのか？
	CWindowOption	m_opt;			//	ウィンドゥオプション

	static LRESULT CALLBACK gWndProc(HWND,UINT,WPARAM,LPARAM);
	LRESULT Dispatch(HWND,UINT,WPARAM,LPARAM);	//	windows message dispatcher

	LRESULT		Initializer(void);	//	起動後、一度だけウィンドゥクラスを登録する
	//	フックしているすべてのインスタンスへのチェイン
	CWinHookList	m_HookPtrList;

	////////////////////////////////////////////////////////////////////////////

	//	マウスカーソルのOn/Offは、ウィンドゥに対する属性なので
	//	ウィンドゥクラスが担うべき
//	void	InnerShowCursor(bool bShow);
	bool	m_bShowCursor;			//	マウスカーソルの表示状態
	bool	m_bUseMouseLayer;		//	ソフトウェアマウスカーソルを使うか？

	//	ウィンドゥサイズのadjust
	void	InnerAdjustWindow(RECT&,CWindowOption&);

	//	メニュー付きウィンドゥか？
	bool	m_bUseMenu;

	//	ChangeWindowStyle⇔SetSizeのフラグ
	bool	m_bResized;

	//	Windows基本窓タイプを作成したときに、メッセージハンドラを
	//	フックするので、その関数ポインタを保存しておく必要がある。
	WNDPROC	m_pWndProc;

	//	最小化されているか？
	volatile bool	m_bMinimized;

	//	一回目の生成かどうか
	static bool	m_bFirstUserClass;
	bool IsWindowsClassName(string szClassName);
	//	Windowsで用意されているWindowクラス名かどうかを調べる

/*
	//	メニューが確実に存在することを事前に伝えておけば
	//	生成時に正確なウィンドゥサイズがいきなり求まる
	void		UseMenu(bool bUseMenu) { m_bUseMenu = bUseMenu; }
*/	//	自動的に判定するようにした

	static	bool g_bFullScreen;			//	フルスクリーンモードなのか？

	// override from CWinHook
	virtual LRESULT WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam);

};

#endif
