
#include "stdafx.h"
#include "yaneGUISlider.h"
#include "yaneMouse.h"
#include "yanePlaneBase.h"
#include "yaneDIB32.h"
#include "yanePlaneLoader.h"

//#include "yaneDebugWindow.h"

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x005350d0 review
CGUISliderEventListener::CGUISliderEventListener(){
	m_nMinX = 5;
	m_nMinY = 5;
}

// @yo2 0x005352c0 review
void CGUINormalSliderListener::SetPlaneTransiter(smart_ptr<CPlaneTransiter> pv){
	m_vPlaneTransiter = pv;
	if ( pv == NULL ) {
		m_bPlaneTransiter = false;
	}else{
		m_bPlaneTransiter = true;
	}
}

// @yo2 0x005353d0 review
void CGUINormalSliderListener::GetSliderSize(int nX,int nY,int& sx,int& sy) {
	//	可動領域を計算
	LPRECT lprc = GetSlider()->GetRect();
	int w = lprc->right - lprc->left;
	int h = lprc->bottom - lprc->top;
	if (nX == 0) {
		sx = w;
	} else {
		sx = w / nX;
		//	最小サイズ以下ならば、その最小サイズにする
		if (sx < m_nMinX) sx = m_nMinX;
	}
	if (nY == 0) {
		sy = h;
	} else {
		sy = h / nY;
		//	最小サイズ以下ならば、その最小サイズにする
		if (sy < m_nMinY) sy = m_nMinY;
	}
}

// @yo2 0x00535580 feat
LRESULT CGUINormalSliderListener::OnDraw(CPlaneBase*lp,int x,int y,int nX,int nY){
	int nType = GetSlider()->GetType();

	//	スライダ全体サイズの取得
	int nSx,nSy;
	GetSliderSize(nX,nY,nSx,nSy);

	//	プレーンローダーのなかのプレーンを伸展させて表示する
	int nSx1,nSy1,nSx2,nSy2,nSx3,nSy3;
	m_vPlaneLoader->GetPlaneBase(0)->GetSize(nSx1,nSy1);
	m_vPlaneLoader->GetPlaneBase(1)->GetSize(nSx2,nSy2);
	m_vPlaneLoader->GetPlaneBase(2)->GetSize(nSx3,nSy3);

	//	スライダタイプ
	switch (nType) {
	case 0:	{ //	縦移動
			lp->BltNatural(m_vPlaneLoader->GetPlaneBase(0),x,y);
			lp->BltNatural(m_vPlaneLoader->GetPlaneBase(2),x,y+nSy-nSy3);
			//	スライダ中央部の計算
			nSy -= (nSy1 + nSy3);
			y+= nSy1;
			for(;nSy >= nSy2;nSy-=nSy2,y+=nSy2){
				lp->BltNatural(m_vPlaneLoader->GetPlaneBase(1),x,y);
			}
			//	スライダ中央部の残りの描画
			RECT rc;
			::SetRect(&rc,0,0,nSx2,nSy);
			if (nSy!=0) {
				lp->BltNatural(m_vPlaneLoader->GetPlaneBase(1),x,y,&rc);
			}

			} break;
	case 1:	{ //	横移動
			lp->BltNatural(m_vPlaneLoader->GetPlaneBase(0),x,y);
			lp->BltNatural(m_vPlaneLoader->GetPlaneBase(2),x+nSx-nSx3,y);
			//	スライダ中央部の計算
			nSx -= (nSx1 + nSx3);
			x+= nSx1;
			for(;nSx >= nSx2;nSx-=nSx2,y+=nSx2){
				lp->BltNatural(m_vPlaneLoader->GetPlaneBase(1),x,y);
			}
			//	スライダ中央部の残りの描画
			RECT rc;
			// ここ指定が違ってた^^; Special Thanx to みちばな
			//::SetRect(&rc,0,0,nSx2,nSy);
			::SetRect(&rc,0,0,nSx,nSy2);
			if (nSx!=0) {
				lp->BltNatural(m_vPlaneLoader->GetPlaneBase(1),x,y,&rc);
			}

			} break;
	case 2:	{ //	縦横移動(どうやって描画したらええねん、これ．．．)
			lp->BltNatural(m_vPlaneLoader->GetPlaneBase(0),x,y);
			} break;
	}
	return 0;
}

///////////////////////////////////////////////////////////////////////////////

// @yo2 0x00535920 feat
CGUISlider::CGUISlider() {
	::SetRect(&m_rcRect,0,0,640,480);
	m_nItemNumX = 1;
	m_nItemNumY = 1;
	m_nType		= 0;
	Reset();
}

// @yo2 0x00535b40 vt
void CGUISlider::Reset(){
	m_bDraged = false;
	m_nButton = 0;
	m_bIn	  = false;	//	表示していきなり押されるのを避ける
	m_bFocusing = false;
	m_bUpdate = false;
	m_nSelectedItemX = 0;
	m_nSelectedItemY = 0;
}

// @yo2 0x00535b70 vt
void CGUISlider::GetXY(int &x,int&y) {
	if ( GetPlaneTransiter() == NULL ){
		x = m_nX; y = m_nY; 
	}else{
		 x = *GetPlaneTransiter()->GetX();
		 y = *GetPlaneTransiter()->GetY();
	}
}

// @yo2 0x00535bf0 cg
CPlaneTransiter* CGUISlider::GetPlaneTransiter() {
	return ((CGUINormalSliderListener*)(CGUISliderEventListener*)m_pvSliderEvent)->GetPlaneTransiter();
}

// @yo2 0x00535c10 review
void	CGUISlider::SetEvent(smart_ptr<CGUISliderEventListener> pv){
	Reset();
	m_pvSliderEvent = pv;
	//	このクラスのポインタを渡しておく
	m_pvSliderEvent->SetSlider(this);
}

//#include "yaneDebugWindow.h"

// @yo2 0x00535e30 cg
void	CGUISlider::CalcSliderPos(int&x,int& y,int&nSLX,int&nSLY,int&w,int&h){
	// スライダ位置の計算
	//	スライダ位置とスライダボタンサイズの確定
	int nXX,nYY;
	nXX = m_nX + m_nXOffset + m_rcRect.left;
	nYY = m_nY + m_nYOffset + m_rcRect.top;
	m_pvSliderEvent->GetSliderSize(m_nItemNumX,m_nItemNumY,nSLX,nSLY);
	w = m_rcRect.right	- m_rcRect.left - nSLX;
	h = m_rcRect.bottom - m_rcRect.top - nSLY;
	if (m_nItemNumX>=2) {
		nXX+= (w*m_nSelectedItemX)/(m_nItemNumX-1);
	}
	if (m_nItemNumY>=2) {
		nYY+= (h*m_nSelectedItemY)/(m_nItemNumY-1);
	}
	x = nXX; y = nYY;
}

// @yo2 0x00535f20 vt
LRESULT	CGUISlider::OnSimpleMove(CPlaneBase*lp){

	//	マウスが設定されとらん。無効スライダなんか？
	if (m_pvMouse==NULL) return -1;

	int nXX,nYY,nSLX,nSLY,w,h;
	CalcSliderPos(nXX,nYY,nSLX,nSLY,w,h);

	int mx,my,mb;
	m_pvMouse->GetInfo(mx,my,mb);

	/*
	bool bRUp,bLUp,bRDown,bLDown;
	bRUp	=	(m_nButton & 1)	 && (!(mb & 1));
	bRDown	= (!(m_nButton & 1)) &&	  (mb & 1);
	bLUp	=	(m_nButton & 2)	 && (!(mb & 2));
	bLDown	= (!(m_nButton & 2)) &&	  (mb & 2);
	*/

	GetXY(m_nX,m_nY);
	//	スライダの左上を(0,0)とする仮想座標
	//	ただし、１つ目以外の要素を選択している場合、(mmx-nXX,mmy-nYY)として計算
	//	する必要あり。
	int mmx = mx-m_nX-m_nXOffset;
	int	mmy = my-m_nY-m_nYOffset;

	//	ガードフレーム間は入力を拒否するための機構
	bool bNGuard = !m_pvMouse->IsGuardTime();

	//	スライドボタンの上か？
	bool bIn;
	//	スライダの上か？
	LPRECT prc = GetRect();

//	CDbg().Out("%d %d %d %d",prc->left,prc->
	bool bSliderIn = (prc->left <= mmx) && (mmx < prc->right)
				&&	 (prc->top	<= mmy) && (mmy < prc->bottom);
	//	スライダ内に入ってないのならボタンドラッグ無効
	if (m_bDraged) {
		bIn = true;	//	ドラッグ中ならば、無条件でtrue
	} ef (!bSliderIn) {
		bIn = false;
	} else {
		//	スライダボタン上か？
		if (	(nXX <= mx) && (mx < nXX+nSLX)
			&&	(nYY <= my) && (my < nYY+nSLY)
			&& //	かつ、ボタン上であること
			(m_pvSliderEvent->IsButton(mmx-nXX,mmy-nYY))){
				bIn = true;
	//			CDbg().Out("%d %d %d %d",m_nPosX,m_nPosY,nSLX,nSLY);
		} else {
			bIn = false;
		}
	}

	//	スライダドラッグ中なのか？
	if (bIn && bNGuard) {
	/*
		if (bRDown) m_pvButtonEvent->OnRBDown();
		if (bLDown) m_pvButtonEvent->OnLBDown();
		if (bRUp)	m_pvButtonEvent->OnRBUp();
		if (bLUp)	m_pvButtonEvent->OnLBUp();
	*/
	}
	//	スライダ部で入力を受けたのか？
	if (!bIn && bSliderIn && bNGuard) {
		switch (m_nType) {
		case 0 : // 縦スライダ
			if (mmy < nYY) {
				m_pvSliderEvent->OnPageUp();
			} else {
				m_pvSliderEvent->OnPageDown();
			}
			break;
		case 1 : // 横スライダ
			if (mmx < nXX) {
				m_pvSliderEvent->OnPageLeft();
			} else {
				m_pvSliderEvent->OnPageRight();
			}
			break;
		case 2 : // 縦横スライダ
			if (mmy < nYY) {
				m_pvSliderEvent->OnPageUp();
			} else {
				m_pvSliderEvent->OnPageDown();
			}
			if (mmx < nXX) {
				m_pvSliderEvent->OnPageLeft();
			} else {
				m_pvSliderEvent->OnPageRight();
			}
			break;
		}
	}

	/*
	CDbg().Out("bSliderIn %d m_bIn %d bIn %d m_bDrag %d",
		bSliderIn?1:0,
		m_bIn?1:0,
		bIn?1:0,
		m_bDraged?1:0
	);
	*/

	//	前回範囲内で押されていなくて、今回ボタン範囲内で押し下げがあった
	if (m_bIn && bIn && !(m_nButton & 2) && (mb & 2)){
		//	WindowsのGUIボタンならば左ボタンクリックで押し下げ状態になる
		if (!m_bDraged){
			m_bDraged = true;
			//	スライダ全域のうちどこをドラッグされたかを記憶する
			m_nDragPosX = mx - nXX;
			m_nDragPosY = my - nYY;

		/*
			CDbg().Out("%d %d",m_nDragPosX,m_nDragPosY);
			CDbg().Out("1.%d %d",mmx,mmy);
			CDbg().Out("2.%d %d",nXX,nYY);
			CDbg().Out("3.%d %d",m_nX,m_nY);
		*/

		}
	}

	if (m_bDraged) {
		//	ドラッグ中でも選択項目の修正は必要
		int x,y;
		x = mmx - m_nDragPosX;
		y = mmy - m_nDragPosY;
		//	この位置が、どこの項目を選択しているのかを逆算する
		if (m_nItemNumX>=2 && w!=0) {
		//	m_nSelectedItemX = x*(m_nItemNumX-1)/(w);
			//	⇒　近いポジションでスライダを停止させるため
			//		四捨五入的処理をしなければならない。そこでこうだ。
			m_nSelectedItemX = (x*(m_nItemNumX-1) + w/2 )/(w);
		} else {
			m_nSelectedItemX = 0;
		}
		if (m_nSelectedItemX<0) m_nSelectedItemX = 0;
		if (m_nSelectedItemX>=m_nItemNumX) m_nSelectedItemX = m_nItemNumX-1;

		if (m_nItemNumY>=2 && h!=0) {
			m_nSelectedItemY = (y*(m_nItemNumY-1) + h/2) /(h);
		} else {
			m_nSelectedItemY = 0;
		}
		if (m_nSelectedItemY<0) m_nSelectedItemY = 0;
		if (m_nSelectedItemY>=m_nItemNumY) m_nSelectedItemY = m_nItemNumY-1;

		//	計算終了＾＾；
	
		//	Dragから解放された？
		if (mb==0) {
			m_bDraged = false;	//	ボタン押されてないやん
			//	この場合、新しいポジションに対する再計算が必要
			CalcSliderPos(nXX,nYY,nSLX,nSLY,w,h);
		}
	}

	/*
	if (bIn && m_bDraged && bNGuard){
		if (bLUp) m_pvButtonEvent->OnLBClick();
		if (bRUp) m_pvButtonEvent->OnRBClick();
	}
	*/

//	CDbg().Out("%d %d",m_nDragPosX,m_nDragPosY);

//	CDbg().Out(m_nSelectedItemY);

	//	前回、フォーカスが無くて、今回、このボタンのフォーカス内に入ったか？
	m_bFocusing = (!m_bIn) && (bIn);

	//	前回のボタン情報をコピー
	m_bIn = bIn;
	m_nButton = mb;

	//	範囲内にあったので、ボタン情報をリセットしておく
	if (bIn || m_bDraged) {
		//	ボタン情報のキャプチャをしている状態なので
		m_pvMouse->ResetButton();
	}

	/////////////////////////////////////////////////////////////////////

	if (m_bDraged) {
		//	ドラッグ中（任意位置に表示）
		m_nPosX = mx - m_nDragPosX;
		m_nPosY = my - m_nDragPosY;
		/*
			ポジションを可動域内部に押し戻す処理
		*/
		if (m_nPosX < prc->left+m_nX + m_nXOffset)	{ m_nPosX = prc->left+m_nX + m_nXOffset; }
		if (m_nPosY < prc->top +m_nY + m_nYOffset)	{ m_nPosY = prc->top +m_nY + m_nYOffset; }
		if (m_nPosX+nSLX > prc->right  + m_nX + m_nXOffset) { m_nPosX = prc->right  + m_nX + m_nXOffset - nSLX; }
		if (m_nPosY+nSLY > prc->bottom + m_nY + m_nYOffset) { m_nPosY = prc->bottom + m_nY + m_nYOffset - nSLY; }

//	int mmx = mx-m_nX+m_nXOffset;	//	実座標
//	int	mmy = my-m_nY+m_nYOffset;
	} else {
		//	非ドラッグ中（固定ポジションに表示）
		m_nPosX = nXX;
		m_nPosY = nYY;
	}

	return 0;
}

// @yo2 0x00536370 vt
LRESULT	CGUISlider::OnSimpleDraw(CPlaneBase *lp) {
	return m_pvSliderEvent->OnDraw(lp,m_nPosX,m_nPosY,m_nItemNumX,m_nItemNumY);
}

