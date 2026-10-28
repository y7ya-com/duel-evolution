
#include "stdafx.h"
#include "yaneGUIButton.h"
#include "yaneMouse.h"
#include "yanePlaneBase.h"
#include "yaneDIB32.h"
#include "yanePlaneLoader.h"

///////////////////////////////////////////////////////////////////////////////
// @yo2 0x005335b0 review
CGUINormalButtonListener::CGUINormalButtonListener(void) {
	m_nType = 1;		//	通常のＯｎ／Ｏｆｆボタン
	m_bReverse = false;	//	反転モードではない
	m_nBlink.Set(0,6);	//	ディフォルトでは、『Natural2』っぽく＾＾；
	m_nBlink.SetReverse(true);
	m_nImageOffset = 0;	//	ディフォルトでは０
	m_bPlaneTransiter = false;
	m_bLClick = false;
	m_bRClick = false;
}

// @yo2 0x00533b00 vt
void CGUINormalButtonListener::SetPlaneLoader(smart_ptr<CPlaneLoaderBasePre> pv,int nNo){
	if ( pv != NULL ){
		m_vPlaneLoader	= pv;
	}
	if ( m_vPlaneLoader == NULL ){
		WARNING( true , "CGUINormalButtonListener::m_vPlaneLoader == NULL" );
	}
	m_nPlaneStart	= nNo;
}

// @yo2 0x00533c10 vt
void CGUINormalButtonListener::SetPlaneTransiter(smart_ptr<CPlaneTransiter> pv){
	m_vPlaneTransiter = pv;
	if ( pv == NULL ) {
		m_bPlaneTransiter = false;
	}else{
		m_bPlaneTransiter = true;
	}
}


// @yo2 0x00533d20 vt
void	CGUINormalButtonListener::SetType(int nType){
	m_nType = nType;
	if (m_nType & 16) m_nBlink.Reset();
}

// @yo2 0x00533d50 vt
bool CGUINormalButtonListener::IsButton(int px,int py){
	if (m_nType == 0) return false;	//	無効ボタンかよ
	//	ボタン画像の(px,py)の地点はボタンの座標か？
	CPlaneBase* lp = GetMyPlane();
	if (lp==NULL) return false;

	if (lp->IsYGA() && (m_nType & 4)) {
		//	YGA画像ならば有効ピクセルであるかどうかチェックする
		if (lp->GetPixelAlpha(px,py)!=0) return true;
		return false;
	} else {
		//	非YGA画像ならば抜き色であるかどうかをチェックしたほうがいいだろうが…
//	return (0<= px && px < sx &&  0<= py && py < sy);
		if (lp->GetPixelAlpha(px,py)!=0) return true;
		return false;
	}

}

// @yo2 0x00533dd0 vt
LRESULT CGUINormalButtonListener::OnDraw(CPlaneBase*lp,int x,int y,bool bPush,bool bIn){
	if (m_nType==0) return 0;

	//	+32:入力情報を完全に無視して SetImageOffsetで設定されたボタンを表示。
	if (m_nType & (32+64)) {
		if ( m_bPlaneTransiter && !m_vPlaneTransiter->IsEnd() ){
			m_vPlaneTransiter->SetPlane(m_vPlaneLoader->GetPlaneBase(m_nPlaneStart+m_nImageOffset));
			m_vPlaneTransiter->OnDraw(lp);
			return 0;
		}else{
			return lp->BltNatural(m_vPlaneLoader->GetPlaneBase(m_nPlaneStart+m_nImageOffset),x,y);
		}
	}

	bool b;	//	ボタンを押し下げ状態で表示するか？
	if (m_nType & 16) {	//	BlinkCounter
		b = !*m_nBlink.GetReversing();
		m_nBlink++;
	} else if (m_nType & 8) {
		b = bIn;			//	上に重ねるだけでアクティブになるボタン
	} else {
		b = bPush && bIn;	//	通常の押し下げボタン
	}

	//	ボタンを(x,y)の座標にbPushの状態で表示する
	return lp->BltNatural(GetMyPlane(b),x,y);
}

// @yo2 0x005340f0 vt
void CGUINormalButtonListener::OnLBClick(){
	if (m_nType == 0 || (m_nType & 16) || (m_nType & 8)) return ;	//	無効ボタンかよ
	m_bLClick = true;					//	フラグもたおしとくかー
	OnLButtonClick();					//	サブクラスに委譲するかー
}
// @yo2 0x00534120 vt
void CGUINormalButtonListener::OnRBClick(){
	if (m_nType == 0 || (m_nType & 16) || (m_nType & 8)) return ;	//	無効ボタンかよ
	m_bRClick = true;					//	フラグもたおしとくかー
	OnRButtonClick();					//	サブクラスに委譲するかー
}

// @yo2 0x00534150 vt
void CGUINormalButtonListener::OnLBDown(){
	if (!(m_nType & 8) || ((m_nType & 16))) return ;			//	無効ボタンかよ

	m_bLClick = true;					//	フラグもたおしとくかー
	OnLButtonClick();					//	サブクラスに委譲するかー
}

// @yo2 0x00534180 vt
CPlaneBase* CGUINormalButtonListener::GetMyPlane(bool bPush){
	int n = m_nPlaneStart;
	if (bPush) n++;
	if ((m_nType & 2) && m_bReverse) n+=2;
	if ( m_nType & (32+64) ) n = m_nPlaneStart+m_nImageOffset;
	return m_vPlaneLoader->GetPlaneBase(n);
}

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x005341d0 review
CGUIButton::CGUIButton(void) {
	m_pvButtonEvent.Add();	//	default handler
	m_bLeftClick  = true;
	m_bRightClick = false;
	m_nXOffset = m_nYOffset = 0;
	Reset();
}

//	WindowsのGUIボタンを忠実に再現する
//	（簡単なようで、結構面倒なんだよな～）
// @yo2 0x005347b0 vt
LRESULT CGUIButton::OnSimpleMove(CPlaneBase*lp){

	if (m_pvButtonEvent==NULL) return -1;

	//	初期化メッセージ
	m_pvButtonEvent->OnInit();

	//	マウスが設定されとらん。無効ボタンなんか？
	if (m_pvMouse==NULL) return -1;

	int x,y,b;
	m_pvMouse->GetInfo(x,y,b);

	bool bRUp,bLUp,bRDown,bLDown;
	bRUp	=	(m_nButton & 1)	 && (!(b & 1));
	bRDown	= (!(m_nButton & 1)) &&	  (b & 1);
	bLUp	=	(m_nButton & 2)	 && (!(b & 2));
	bLDown	= (!(m_nButton & 2)) &&	  (b & 2);

	GetXY(m_nX,m_nY);
	bool bIn = m_pvButtonEvent->IsButton(x-m_nX /* +m_nXOffset*/,y-m_nY /* +m_nYOffset*/);
		//	'01/07/28 fixed by sohei.
		//	オフセットの概念は、描画するときのみ適用される概念で、
		//	内部にあるかどうかの判定のときは、オフセットを適用しない

	//	ガードフレーム間は入力を拒否するための機構

	bool bNGuard = !m_pvMouse->IsGuardTime();

	if (bIn && bNGuard) {
		if (bRDown) m_pvButtonEvent->OnRBDown();
		if (bLDown) m_pvButtonEvent->OnLBDown();
		if (bRUp)	m_pvButtonEvent->OnRBUp();
		if (bLUp)	m_pvButtonEvent->OnLBUp();
	}

	//	前回範囲内で押されていなくて、今回ボタン範囲内で押し下げがあった
	if (m_bLeftClick && m_bIn && bIn && !(m_nButton & 2) && (b & 2)){
		//	WindowsのGUIボタンならば左ボタンクリックで押し下げ状態になる
		m_bPushed = true;
	}
	if (m_bRightClick && m_bIn && bIn && !(m_nButton & 1) && (b & 1)){
		//	WindowsのGUIボタンならば左ボタンクリックで押し下げ状態になる
		m_bPushed = true;
	}

	if (bIn && m_bPushed && bNGuard){
		if (bLUp) m_pvButtonEvent->OnLBClick();
		if (bRUp) m_pvButtonEvent->OnRBClick();
	}

	if (m_bPushed) {
		if (b==0) m_bPushed = false;	//	ボタン押されてないやん
	}

	//	前回、フォーカスが無くて、今回、このボタンのフォーカス内に入ったか？
	m_bFocusing = (!m_bIn) && (bIn);

	//	前回のボタン情報をコピー
	m_bIn = bIn;
	m_nButton = b;

	//	範囲内にあったので、ボタン情報をリセットしておく
	if (bIn || m_bPushed) {
		//	ボタン情報のキャプチャをしている状態なので
		m_pvMouse->ResetButton();
	}

	//	画面上の表示は、押し下げ状態にあり、かつマウスがその上にある時のみ有効
	return 0;
}

// @yo2 0x00534a20 vt
LRESULT	CGUIButton::OnSimpleDraw(CPlaneBase*lp){
	//	画面上の表示は、押し下げ状態にあり、かつマウスがその上にある時のみ有効
	return m_pvButtonEvent->OnDraw(lp,m_nX+m_nXOffset,m_nY+m_nYOffset,m_bPushed,m_bIn);
}

// @yo2 0x00534a70 cg
CPlaneTransiter* CGUIButton::GetPlaneTransiter(){ 
	return	((CGUINormalButtonListener*)(CGUIButtonEventListener*)m_pvButtonEvent)->GetPlaneTransiter();
}

// @yo2 0x00534a90 vt
void CGUIButton::Reset(){
	m_bPushed = false;
	m_nButton = 0;
	m_bIn	  = false;	//	表示していきなり押されるのを避ける
	m_bFocusing = false;
}

// @yo2 0x00534ab0 vt
void CGUIButton::GetXY(int &x,int&y){
	if ( GetPlaneTransiter() == NULL ){
		x = m_nX; y = m_nY; 
	}else{
		 x = *GetPlaneTransiter()->GetX();
		 y = *GetPlaneTransiter()->GetY();
	}
}

