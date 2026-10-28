#include "stdafx.h"
#include "yaneMouse.h"
#include "yaneAppInitializer.h"

// @yo2 0x00541f70 review
CMouse::CMouse(){
	m_nRClickCount = 0;	// [Konami]
	m_nLClickCount = 0;	// [Konami]
	m_bOutScreenInput = false;
	m_bRB = false;
	m_bLB = false;
	m_bHistRB = false;
	m_bHistLB = false;
	CAppInitializer::Hook(this);		//	WindowMessageのHook
}

// @yo2 0x00542060 vt
CMouse::~CMouse(){
	CAppInitializer::Unhook(this);		//	WindowMessageのUnhook
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00542080 vt
LRESULT	CMouse::GetXY(int &x,int &y) const {
	POINT point,point2 = { 0,0 };
	::GetCursorPos(&point);

	if (CAppInitializer::IsFullScreen()) {
	//	フルスクリーンモードでは見えていないウィンドゥキャプション等の影響で
	//	嘘の位置になってしまうので、そのまま返しておけば良い。
		x = point.x;
		y = point.y;
	} else {
		HWND hWnd = CAppInitializer::GetHWnd();
		::ClientToScreen(hWnd,&point2);
		x = point.x - point2.x;
		y = point.y - point2.y;

		//	[Konami] scale client coordinates to the 1024x768 game screen
		//	(the window client area may be smaller, e.g. clamped to the work area)
		RECT rt;
		::GetClientRect(hWnd,&rt);
		x = (int)((1024.0f / rt.right ) * x);
		y = (int)(( 768.0f / rt.bottom) * y);

		if (!m_bOutScreenInput) {
			//	ウィンドゥ範囲外であれば、ボタンはリセット
			::ScreenToClient(hWnd,&point);// クライアント座標に変換
			//	[Konami] RECT rt moved up (shared with the scaling above)
			::GetClientRect(hWnd,&rt);// クライアント領域取得
			// 範囲外ならマウス状態初期化
			if(point.x<0 || rt.right<=point.x || point.y<0 || rt.bottom<=point.y) {
				//	const_cast fake
				*const_cast<bool*>(&m_bLB) = false;
				*const_cast<bool*>(&m_bRB) = false;
			}
		}
		
	}
	return 0;
}

// @yo2 0x005421e0 vt
LRESULT CMouse::SetXY(int x,int y) {
	POINT point,point2 = { 0,0 };

	if (CAppInitializer::IsFullScreen()) {
		point.x=x;
		point.y=y;
		::SetCursorPos(point.x,point.y);
	} else {
		::ClientToScreen(CAppInitializer::GetHWnd(),&point2);
		point.x= x + point2.x;
		point.y= y + point2.y;
		::SetCursorPos(point.x,point.y);
	}
	return 0;
}

// @yo2 0x00542270 vt
LRESULT CMouse::GetInfo(int &x,int &y,int &b) const {	// マウスポジションとボタン状態を返す
	CMouse::GetXY(x,y);	//	virtual関数が呼び出されけては何もならない

	b = 0;
	if (m_bRB) b++;		//	ボタン情報。右クリックならば1
	if (m_bLB) b+=2;	//	ボタン情報。左クリックならば2

	return 0;
}

// @yo2 0x005422c0 vt
bool CMouse::RButton() const {
	return m_bRB;
}

// @yo2 0x005422e0 vt
bool CMouse::LButton() const {
	return m_bLB;
}

// @yo2 0x00542300 vt
void CMouse::SetOutScreenInput(bool bEnable) { m_bOutScreenInput=bEnable;}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00542320 vt
void	CMouse::GetButton(bool&bL,bool&bR){
	bL = !m_bHistLB && m_bLB;
	bR = !m_bHistRB && m_bRB;
	m_bHistLB = m_bLB;
	m_bHistRB = m_bRB;
}

// @yo2 0x00542390 vt
void	CMouse::ResetButton(){
	m_bHistRB = false;
	m_bHistLB = false;
}

//////////////////////////////////////////////////////////////////////////////
// メッセージをフックしないとマウスのボタン状態もわからんとは...
// @yo2 0x005423b0 vt
LRESULT CMouse::WndProc(HWND hWnd,UINT uMsg,WPARAM wParam,LPARAM lParam){ // メッセージのコールバック
	switch(uMsg){
	/*
		押したまま画面外に出たときに、どう処理するのか？
		(画面外ではWM_MOUSEMOVEメッセージはやって来ないので..)
		⇒WM_NCBUTTONUP等はやってくる？　⇒やって来ないみたい(ρ_；)ﾉ
	*/

/*
	//	⇒このメッセージも必ず飛んで来るとは限らないようだ．．
	case WM_NCHITTEST:
	{
		POINT pos;
		RECT rt;
		pos.x = LOWORD(lParam);
		pos.y = HIWORD(lParam);
		::ScreenToClient(hWnd,&pos);// クライアント座標に変換
		GetClientRect(hWnd,&rt);// クライアント領域取得
		// 範囲外ならマウス状態初期化
		if(pos.x<0 || rt.right<=pos.x || pos.y<0 || rt.bottom<=pos.y) {
			m_bLB = false;
			m_bRB = false;
		}
		break;
	}
*/

	case WM_LBUTTONDOWN:
//	case WM_NCLBUTTONDOWN:
		m_bLB = true; m_nLClickCount++; break;	// [Konami] count
	case WM_LBUTTONUP:
//	case WM_NCLBUTTONUP:
		m_bLB = /* m_bLDC = */ false; break;
	case WM_RBUTTONDOWN:
//	case WM_NCRBUTTONDOWN:
		m_bRB = true; m_nRClickCount++; break;	// [Konami] count
	case WM_RBUTTONUP:
//	case WM_NCRBUTTONUP:
		m_bRB = /* m_bRDC = */ false; break;
/*	//	このメッセージは飛んでこない
	case WM_LBUTTONDBLCLK:
//	case WM_NCLBUTTONDBLCLK:
		m_bLDC= true; break;
	case WM_RBUTTONDBLCLK:
//	case WM_NCRBUTTONDBLCLK:
		m_bRDC= true; break;
*/
	// [Konami] a double-click counts twice
	case WM_LBUTTONDBLCLK:
		m_nLClickCount += 2; break;
	case WM_RBUTTONDBLCLK:
		m_nRClickCount += 2; break;
	case WM_MOUSEMOVE:
//	case WM_NCMOUSEMOVE:	//	画面外にマウスが出たときのために
		m_bLB = (wParam & MK_LBUTTON)!=0;
		m_bRB = (wParam & MK_RBUTTON)!=0;
		break;

	}
	return 0;
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00542480 review
CMouseEx::CMouseEx(){
	m_bRBN = false;
	m_bLBN = false;
	m_nRLBN = 0;
	m_nX = m_nY = 0;
	m_nGuardTime = 2;
}

// @yo2 0x005424f0 vt
CMouseEx::~CMouseEx(){
}

// @yo2 0x00542510 vt
LRESULT	CMouseEx::Flush(){
	if (m_nGuardTime!=0) m_nGuardTime--;

	m_bHistLB = m_bLBN;
	m_bHistRB = m_bRBN;

	if (CMouse::GetInfo(m_nX,m_nY,m_nRLBN)!=0) {
		m_bRBN = m_bLBN = false;
		return 1;
	}
	m_bRBN = (m_nRLBN&1)!=0;
	m_bLBN = (m_nRLBN&2)!=0;

	return 0;
}

// @yo2 0x00542590 vt
LRESULT CMouseEx::GetXY(int &x,int &y)const{
	x = m_nX;
	y = m_nY;
	return 0;
}

// [Konami] identical to GetXY
// @yo2 0x005425c0 vt
LRESULT CMouseEx::GetFlushedXY(int &x,int &y)const{
	x = m_nX;
	y = m_nY;
	return 0;
}

// @yo2 0x005425f0 vt
LRESULT CMouseEx::SetXY(int x,int y){
					//	マウスを指定のポジションに移動（クライアント座標系にて）
	m_nX = x; m_nY = y;	//	いますぐ情報更新＾＾；
	return CMouse::SetXY(x,y);
}

// @yo2 0x00542620 vt
bool	CMouseEx::RButton()const{
	return m_bRBN;
}

// @yo2 0x00542640 vt
bool	CMouseEx::LButton()const{
	return m_bLBN;
}

// @yo2 0x00542660 vt
LRESULT CMouseEx::GetInfo(int &x,int &y,int &b)const{
	x = m_nX;
	y = m_nY;
	b = m_nRLBN;
	return 0;
}

/////////////////////////////////////////////////////////////////////////////
//	前回のFlushから押されたか？

// @yo2 0x00542690 vt
void	CMouseEx::GetButton(bool&bL,bool&bR){
	bR = !m_bHistRB && m_bRBN;
	bL = !m_bHistLB && m_bLBN;
}
// @yo2 0x00542700 vt
bool	CMouseEx::IsPushRButton() const{
	return !m_bHistRB && m_bRBN && (m_nGuardTime==0);
}
// @yo2 0x00542730 vt
bool	CMouseEx::IsPushLButton() const{
	return !m_bHistLB && m_bLBN && (m_nGuardTime==0);
}

/////////////////////////////////////////////////////////////////////////////
//	前回のFlushから押し上げられたか？

// @yo2 0x00542760 vt
void	CMouseEx::GetUpButton(bool&bL,bool&bR){
	bR = m_bHistRB && !m_bRBN;
	bL = m_bHistLB && !m_bLBN;

}
// @yo2 0x005427d0 vt
bool	CMouseEx::IsPushUpRButton()const{
	return m_bHistRB && !m_bRBN && (m_nGuardTime==0);
}
// @yo2 0x00542800 vt
bool	CMouseEx::IsPushUpLButton()const{
	return m_bHistLB && !m_bLBN && (m_nGuardTime==0);
}

/////////////////////////////////////////////////////////////////////////////

// @yo2 0x00542830 vt
void	CMouseEx::ResetButton(){
	m_bHistRB = m_bRBN = false;
	m_bHistLB = m_bLBN = false;
}

// @yo2 0x00542850 tight
void	CMouseEx::SetGuardTime(int nTime){
	m_nGuardTime = nTime;
}

// @yo2 0x00542870 vt
bool	CMouseEx::IsGuardTime() const {
	return m_nGuardTime!=0;
}

