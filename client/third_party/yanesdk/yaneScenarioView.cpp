#include "stdafx.h"
#include "yaneScenarioView.h"
#include "yaneTextDraw.h"
#include "yaneBGMLoader.h"
#include "yaneSELoader.h"
#include "yanePlaneLoader.h"
#include "yaneStringScanner.h"
#include "yaneVirtualKey.h"
#include "yaneMouse.h"
#include "yanePlaneEffectBlt.h"
#include "yaneGUIButton.h"
#include "yaneSpriteChara.h"
#include "yaneKey.h"

//////////////////////////////////////////////////////////////////////////////
//	過去ログ管理マネージャ

// @yo2 0x00559150 review
CScenarioDrawBackLogManager::CScenarioDrawBackLogManager(void){
	m_bBackLogFlag	=	true;	//	ディフォルトでtrue
	m_bBackLogMode	=	false;	//	現在はバックログをとらない
	m_nBackLogLength=	100;	//	（１００－１）段落、前までバックログをとる
}

// @yo2 0x00559380 vt
void CScenarioDrawBackLogManager::ResetLog(void){
	//	ログのリセット
	GetLogList()->clear();
	SetBackLogMode(false);
}

// @yo2 0x005593f0 vt
LRESULT CScenarioDrawBackLogManager::GoBack(void){
	//	巻き戻し
	if (!IsBackLogMode()) {
		//	現在バックログ表示中ではないので、いったんリセット
		m_itBackLogList = m_vBackLogList.begin();
	}

	//	iteratorが要素の終端であるかを比較するには、このように
	//	するしか無い＾＾；
	//	riterator ⇔ iteratorの変換が定義されていれば良いのだが…
	if (&(*m_itBackLogList) == &(*m_vBackLogList.rbegin())) {
		//	これ以上は戻らないナリ
		return 1;
	}
	m_itBackLogList++;
	SetBackLogMode(true);
	//	ここでtrueにしないと、戻るべき過去ログが無いのに押せてしまうことになる
	return 0;
}

// @yo2 0x00559460 vt
LRESULT CScenarioDrawBackLogManager::GoBackTo(int nNum){
	//	巻き戻し
	if (!IsBackLogMode()) {
		//	現在バックログ表示中ではないので、いったんリセット
		m_itBackLogList = m_vBackLogList.begin();
	}

	for (int i=0;i<nNum;i++){
		//	iteratorが要素の終端であるかを比較するには、このように
		//	するしか無い＾＾；
		//	riterator ⇔ iteratorの変換が定義されていれば良いのだが…
		if (&(*m_itBackLogList) == &(*m_vBackLogList.rbegin())) {
			//	これ以上は戻らないナリ
			return 1;
		}
		m_itBackLogList++;
	}
	SetBackLogMode(true);
	//	ここでtrueにしないと、戻るべき過去ログが無いのに押せてしまうことになる
	return 0;
}

//-- 追加 '01/11/11	 by enra --
// [out]
//	次のログへ送った	 : 0
//	ログ表示中ではない	 : 1
//	一番新しいログに到達 : 2
// @yo2 0x005594e0 vt
LRESULT CScenarioDrawBackLogManager::GoNext(void)
{
	if (!IsBackLogMode()){
		// 何もしない
		return 1;
	}
	if (m_itBackLogList == m_vBackLogList.begin()) {
		// 一番新しいログに到達済み
		return 2;
	}
	m_itBackLogList--;
	if (m_itBackLogList == m_vBackLogList.begin()) {
		// 一番新しいログに到達
		return 2;
	}
	return 0;
}
//-----------------------------

// @yo2 0x00559530 vt
LRESULT CScenarioDrawBackLogManager::SetLog(CTextDrawContext* lpContextNow,
CTextDrawContext* lpContextNext){
	//	lpContextNext==NULLのときは
	//	<HR>までの記録をとる。

	//	空の段落は呼ばないこと。（表示したときに検知しておくこと）
	if (!IsBackLogFlag()) return 0; // back logを取るモードではない
	LPCWSTR lp = lpContextNow->GetTextPtrNow();	//	[Konami] wide
	LPCWSTR lpEnd;

	LRESULT hr;
	//	<HR>を探す
	if (lpContextNext==NULL){
		lpEnd = lp;
		hr = CStringScanner::SkipTo(lpEnd,L"<HR>");
		//	一致後は、その分だけlpは前進する。'\0'に出くわしたら非0が返る

		if (hr!=0) return 1;
		//	↑ここエラー判定してしまうと、最後が<HR>で終わっていない場合、
		//	うまく動かないような気もするが、、最後は必ず<HR>で終わるってことで
		//	良しとしよう．．
	} else {
		lpEnd = lpContextNext->GetTextPtrNow();
	}

	//	一致したんで、その分バッファを作って、コピーする。
	int nSize = lpEnd - lp + 1;
	smart_array<WCHAR> buf(nSize);	//	[Konami] wide
	//	[Konami] (sic) copies nSize-1 BYTES, i.e. only the first half of the text
	::CopyMemory((void*)((WCHAR*)buf),lp,nSize-1);
	buf[nSize-1] = L'\0';	//	デリミタも配置。

	//	CLogを作ってlistに登録
	smart_ptr<CLog> log(new CLog,true);
	log->SetStr(buf);
	smart_ptr<CTextDrawContext> context(new CTextDrawContext,true);
	*context = *lpContextNow;	//	コンテキストのコピー
	context->SetTextPtr(buf); // これで上で確保したバッファを指すコンテクストの出来上がり
	log->SetTextDrawContext(context);

	//	最後に足して、最初の（一番古いログ）を取り除く
	GetLogList()->push_front(log);
	if (GetLogList()->size() > m_nBackLogLength) {
//		GetLogList()->pop_front();
		GetLogList()->pop_back();
	}
	return 0;
}

//////////////////////////////////////////////////////////////////////////////
//	ボタンイベントのlinstener

class CButtonEventListenerButtonX : public CGUINormalButtonListener,public mediator<CScenarioDraw>	{
public:
	CButtonEventListenerButtonX(CScenarioDraw*lp) : mediator<CScenarioDraw>(lp) {
		SetType(0);
		SetPlaneLoader(lp->GetButtonLoader(),0);
	}
protected:
	//	ボタンが押されたときの通知
	// @yo2 0x0055c930 vt
	virtual void OnLButtonClick(void) {
		outer.SetMesVisible(false);		//	メッセージウィンドゥ消すねん！
	}
};

class CButtonEventListenerButtonBack : public CGUINormalButtonListener,public mediator<CScenarioDraw> {
public:
	CButtonEventListenerButtonBack(CScenarioDraw*lp) : mediator<CScenarioDraw>(lp) {
		SetType(0);
		SetPlaneLoader(lp->GetButtonLoader(),4);
	}
protected:
	// @yo2 0x0055caa0 vt
	virtual void OnLButtonClick(void) {
		if (outer.GetBackLog()->GoBack()!=0) return ; // これ以上戻れないらしい
		outer.GoBack(outer.GetBackLog()->GetLog()->GetTextDrawContext());
	}
	// @yo2 0x0055cdb0 vt
	virtual CPlaneBase* GetMyPlane(bool bPush) {
		SetReverse(outer.GetBackLog()->IsBackLogMode());
		return CGUINormalButtonListener::GetMyPlane(bPush);
	}
};

class CButtonEventListenerButtonPrev : public CGUINormalButtonListener,public mediator<CScenarioDraw> {
public:
	CButtonEventListenerButtonPrev(CScenarioDraw*lp) : mediator<CScenarioDraw>(lp) {
		SetType(0);
		SetPlaneLoader(lp->GetButtonLoader(),8);
	}
protected:
	// @yo2 0x0055cff0 vt
	virtual void OnLButtonClick(void) {
		//	早送り
		outer.SkipFast(!outer.IsSkipFastNow());
	}
	// @yo2 0x0055d020 vt
	virtual CPlaneBase* GetMyPlane(bool bPush) {
		SetReverse(outer.IsSkipFastNow());
		return CGUINormalButtonListener::GetMyPlane(bPush);
	}
};

//////////////////////////////////////////////////////////////////////////////

// @yo2? 0x00559b70 order
CScenarioDraw::CScenarioDraw(void){
	m_nTextPhase.Set(0,INT_MAX/2,1);	//	描画速度は、このステップで決まる
	//	これならば、1フレームごとに１文字表示される
	m_vFile.Add();
	m_vTextDrawContext.Add();

	//	これだけサイズ確保
	m_vScenarioEffect.resize(EFFECT_MAX * 2);

	Reset();
	m_vBackLog.Add();
	m_bSkipFast		= true;

	//	ポジション初期化
	m_nStartPos		= -1;
	m_nEndPos		= -1;
	m_alpStartGameContext = NULL;
	m_nBGMNo		= -1;
	m_bBGMLoop		= true;

	//	オプション初期化
	ZERO(m_anOption);

	//	キーのリピート
	m_bKeyRepeat = true;

	m_bSelect	= false;
	m_nSelect	= 0;
	m_nSelectedNo = -1;	//	規定値外の値にしておく
}

// @yo2 0x0055a790 vt
LRESULT CScenarioDraw::SetConfigFile(string filename){
	CFile file;
	if (file.Read(filename)!=0) return 1;	// open error..

	int nLine = 0;
	m_alpTalkBox.clear();
	m_anTalkBoxX.clear();
	m_anTalkBoxY.clear();
	m_bFaceMark		= false;		//	フェイスマークは指定されなければ無効である
	//	ボタンの初期化
	m_vButtonX.Add();			//	削除ボタン
	m_vButtonX->SetMouse(GetMouse());
	m_vButtonX->SetEvent(smart_ptr<CGUIButtonEventListener>(new CButtonEventListenerButtonX(this),true));
	m_vButtonBack.Add();		//	戻りボタン
	m_vButtonBack->SetMouse(GetMouse());
	m_vButtonBack->SetEvent(smart_ptr<CGUIButtonEventListener>(new CButtonEventListenerButtonBack(this),true));
	m_vButtonPrev.Add();		//	早送りボタン
	m_vButtonPrev->SetMouse(GetMouse());
	m_vButtonPrev->SetEvent(smart_ptr<CGUIButtonEventListener>(new CButtonEventListenerButtonPrev(this),true));
	m_bMesNext		= false;

	while (true){
		nLine++;
		CHAR buf[256];
		LRESULT lr;
		lr = file.ReadLine(buf);
		//	[Konami] the line is converted to a wide string and parsed as such
		WCHAR wbuf[256];
		::MultiByteToWideChar(CP_ACP,MB_PRECOMPOSED,buf,256,wbuf,256);
		if (lr==1) return 0; // EOF
		if (lr!=0) {
			Err.Out("CScenarioDraw::SetConfigFileで%sの%d行目でエラー",filename.c_str(),nLine);
			return 2;	//	解析エラー
		}
		if (wbuf[0]==L'\0') continue;		//	空行の読み飛ばし
		if (wbuf[0]==L'/' && wbuf[1]==L'/') continue;
		LPCWSTR lp = wbuf;
		if (CStringScanner::IsToken(lp,L"#mes_width")){
			int n;
			if (CStringScanner::GetNumFromCsv(lp,n)!=0) goto ErrEnd;
			GetTextDrawContext()->m_nWidth = n;
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#mes_xy")){
			int x,y;
			if (CStringScanner::GetNumFromCsv(lp,x)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,y)!=0) goto ErrEnd;
			SetMessageXY(x,y);
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#mes_fontsize")){
			int size;
			if (CStringScanner::GetNumFromCsv(lp,size)!=0) goto ErrEnd;
			GetTextDrawContext()->SetBaseFontSize(size);
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#mes_space")){
			int h;
			if (CStringScanner::GetNumFromCsv(lp,h)!=0) goto ErrEnd;
			GetTextDrawContext()->m_nHInterval = h;
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#mes_Height")){
			int h;
			if (CStringScanner::GetNumFromCsv(lp,h)!=0) goto ErrEnd;
			GetTextDrawContext()->m_nBlankHeight = h;
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#mes_parts")){
			int x,y,key_x,key_y;
			if (CStringScanner::GetNumFromCsv(lp,x)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,y)!=0) goto ErrEnd;
			CStringScanner::SkipSpace(lp);
			m_alpTalkBox.insert(CPlaneBase::CreatePlane());
			(*m_alpTalkBox.rbegin())->Load(CStringScanner::GetNextStr(lp));
			m_anTalkBoxX.push_back(x);
			m_anTalkBoxY.push_back(y);
			//--- 追加 '02/01/13  by ENRA ---
			// YGAじゃないメッセージウィンドウのための抜き色指定
			if (CStringScanner::GetNumFromCsv(lp,key_x)==0){
				if (CStringScanner::GetNumFromCsv(lp,key_y)==0){
					(*m_alpTalkBox.rbegin())->SetColorKey(key_x, key_y);
				}
			}
			//-------------------------------
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#ProhibitString")){
			CStringScanner::SkipSpace(lp);
			GetTextDraw()->SetProhibitString(CStringScanner::GetNextStr(lp));
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#NamePlate")){
			if (CStringScanner::GetNumFromCsv(lp,m_nNamePlateX)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,m_nNamePlateY)!=0) goto ErrEnd;
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#FaceMark")){
			if (CStringScanner::GetNumFromCsv(lp,m_nFaceMarkX)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,m_nFaceMarkY)!=0) goto ErrEnd;
			m_bFaceMark = true;
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#BG_DEFINE")){
			GetBGLoader()->Set(CStringScanner::GetNextStr(lp));
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#SE_DEFINE")){
			GetSELoader()->Set(CStringScanner::GetNextStr(lp));
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#VOICE_DEFINE")){
			GetVoiceLoader()->Set(CStringScanner::GetNextStr(lp));
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#BGM_DEFINE")){
			GetBGMLoader()->Set(CStringScanner::GetNextStr(lp));
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#SC_DEFINE")){
			GetSCLoader()->Set(CStringScanner::GetNextStr(lp));
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#FACE_DEFINE")){
			GetFaceLoader()->Set(CStringScanner::GetNextStr(lp));
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#NAME_DEFINE")){
			GetNameLoader()->Set(CStringScanner::GetNextStr(lp));
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#BUTTON_DEFINE")){
			GetButtonLoader()->Set(CStringScanner::GetNextStr(lp));
			continue;
		}
		//	ボタン設定
		if (CStringScanner::IsToken(lp,L"#mes_buttonX")){
			int x,y,t;
			if (CStringScanner::GetNumFromCsv(lp,x)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,y)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,t)!=0) goto ErrEnd;
			CButtonEventListenerButtonX* lp = (CButtonEventListenerButtonX*)(CGUIButtonEventListener*)m_vButtonX->GetEvent();	//	このアップキャストは安全
			lp->SetType(t);
			m_vButtonX->SetXY(x,y);
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#mes_buttonB")){
			int x,y,t;
			if (CStringScanner::GetNumFromCsv(lp,x)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,y)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,t)!=0) goto ErrEnd;
			CButtonEventListenerButtonBack* lp = (CButtonEventListenerButtonBack*)(CGUIButtonEventListener*)m_vButtonBack->GetEvent();	//	このアップキャストは安全
			lp->SetType(t);
			m_vButtonBack->SetXY(x,y);
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#mes_buttonP")){
			int x,y,t;
			if (CStringScanner::GetNumFromCsv(lp,x)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,y)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,t)!=0) goto ErrEnd;
			CButtonEventListenerButtonPrev* lp = (CButtonEventListenerButtonPrev*)(CGUIButtonEventListener*)m_vButtonPrev->GetEvent();	//	このアップキャストは安全
			lp->SetType(t);
			m_vButtonPrev->SetXY(x,y);
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#mes_next")){
			int x,y,t;
			if (CStringScanner::GetNumFromCsv(lp,x)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,y)!=0) goto ErrEnd;
			if (CStringScanner::GetNumFromCsv(lp,t)!=0) goto ErrEnd;
			m_nMesNextX = x;
			m_nMesNextY = y;
			m_bMesNext = true;
			m_nMesNextCount.Set(0,t >> 1);
			m_nMesNextCount.SetReverse(true);
			continue;
		}
		if (CStringScanner::IsToken(lp,L"#backlog_color")){
			if (CStringScanner::GetStrColor(lp,*GetTextDraw()->GetGrayColor())!=0) goto ErrEnd;
			continue;
		}
	}
	return 0;

ErrEnd:;
	Err.SelectDevice(1);	//	絶対に出力する
	Err.Out("CScenarioDraw::SetConfigFileで%sの%d行目でエラー",filename.c_str(),nLine);
	return -1;
}

////////////////////////////////////////////////////////////////////////////

//	プライベートメンバの初期化
// @yo2 0x0055d1b0 vt
void	CScenarioDraw::Reset(void){
	//	BGCG
	m_nBGCG			= -1;
	m_nBGCGOld		= -1;
	m_nBGBltType	= 0;
	m_nBGCount.Set(0,256,16);
	//	SCCG
	for(int i=0;i<3;i++){
		m_nSCCG[i]		= -1;
		m_nSCBltType[i] = 0;
		m_nSCCount[i].Set(0,256,16);
	}

	m_nNamePlate	= -1;
	m_nFaceMark		= -1;

	m_nAutoPlay		= 0;
	m_nAutoPlayCount = 0;

	m_bMesVisible	= true;
	m_bMesVisible2	= true;
	m_bSkipFastNow	= false;
	m_bWaitInput	= false;
	m_bWaitTransition = false;
	m_bGoNext		= false;

	m_nOldImageCount = 0;
}

// @yo2 0x0055d2a0 vt
LRESULT CScenarioDraw::OnSimpleDraw(CPlaneBase* lpPlane){
	OnDrawBG(lpPlane);

	//	BG描画後のCall Back
	OnDrawCallBack(lpPlane,&m_vAfterEffect[0],0);

	OnDrawSCChara(lpPlane);

	//	立ちキャラ描画後のCall Back
	OnDrawCallBack(lpPlane,&m_vAfterEffect[EFFECT_MAX],EFFECT_MAX);

	if (!IsMesVisible())  return 0;
	if (!IsMesVisible2()) return 0;
	OnDrawMesBox(lpPlane);

	//	ネームプレート描画
	if (m_nNamePlate != -1 && (m_nNamePlate < GetNameLoader()->GetMax())) {
		CPlaneBase* lp = GetNameLoader()->GetPlaneBase(m_nNamePlate);
		if (lp!=NULL) {
			if (lp->IsLoaded()){
				lpPlane->BltNatural(lp,m_nNamePlateX,m_nNamePlateY);
			} else {
			//	CFont font;
			//	font.SetText("NamePlate = %d",m_nNamePlate);
			//	これを描画する手段が無い…
			}
		}
	}
	//	FaceMark表示
	if (m_bFaceMark && m_nFaceMark != -1 && (m_nFaceMark < GetFaceLoader()->GetMax())) {
		CPlaneBase* lp = GetFaceLoader()->GetPlaneBase(m_nFaceMark);
		if (lp!=NULL) {
			if (lp->IsLoaded()){
				lpPlane->BltNatural(lp,m_nFaceMarkX,m_nFaceMarkY);
			} else {
			//	CFont font;
			//	font.SetText("FaceMark = %d",0,16);
			//
			}
		}
	}
	//	ボタン描画
	GetButtonX()->OnDraw(lpPlane);
	GetButtonB()->OnDraw(lpPlane);
	GetButtonP()->OnDraw(lpPlane);

	{
		//	テキスト描画
		int n = m_nTextPhase;
//		m_nTextPhase.IncS();
		int s = m_vTextDraw->GetRects()->size();
		//	今、最後に到達したのか？
//		bool b = (n >= s) && !(m_nTextPhase >= s);
//		if (b) m_nMesNextCount.Reset();
		//	--- 入力待ちプロンプトを点灯させる

		if (n >= s || m_nAutoPlay || m_bSkipFastNow) {
			//	まるごと表示
			lpPlane->BltNatural(m_vTextDraw->GetPlaneBase(),m_nTextX,m_nTextY);
//			m_bGoNext = true;

/*
			//	文字列を選択中なのか？
			//	-- バックログ表示中でないならば
			if (m_bSelect && !GetBackLog()->IsBackLogMode()) {	//	セレクトタグが混じっている
				m_bGoNext = false;
				m_bSkipFastNow = false;
				// スキップの停止(これPause動作のほうがええような気がするなぁ．．)
				OnSelectMes(lpPlane); // 選択フェイズへ
			}
*/
			//	プロンプト表示
			if (m_bMesNext && m_bWaitInput && !m_vBackLog->IsBackLogMode()) {

				//	点滅表示中
				if (!*m_nMesNextCount.GetReversing()) {
					lpPlane->BltNatural(GetButtonLoader()->GetPlaneBase(12),m_nMesNextX,m_nMesNextY);
				} else if(GetButtonLoader()->GetMax()>13) {// 13 番目があるならそれと交互に描画
					lpPlane->BltNatural(GetButtonLoader()->GetPlaneBase(13),m_nMesNextX,m_nMesNextY);
				}

//				m_nMesNextCount.Inc();
			}
		} else {
			//	文字を１文字ずつ表示
			for(int i=0;(i<n) && (i<s);++i){
				LPRECT lpRect = (*m_vTextDraw->GetRects())[i];
				lpPlane->BltNatural(m_vTextDraw->GetPlaneBase()
					,m_nTextX + lpRect->left
					,m_nTextY + lpRect->top
					,lpRect
				);
			}
//			m_bGoNext = false;
		}
	}

	return 0;
}

// @yo2 0x0055da70 vt
LRESULT CScenarioDraw::OnSimpleMove(CPlaneBase* lpPlane){
	//--- 追加 '02/01/16  by ENRA ---
	OnMoveBG(lpPlane);

	OnMoveCallBack(lpPlane,&m_vAfterEffect[0],0);

	OnMoveSCChara(lpPlane);

	OnMoveCallBack(lpPlane,&m_vAfterEffect[EFFECT_MAX],EFFECT_MAX);
	//-------------------------------

	{
		//	テキスト描画
		int n = m_nTextPhase;
		m_nTextPhase.IncS();
		int s = m_vTextDraw->GetRects()->size();
		//	今、最後に到達したのか？
		bool b = (n >= s) && !(m_nTextPhase >= s);
		if (b) m_nMesNextCount.Reset();
		//	--- 入力待ちプロンプトを点灯させる

		if (n >= s || m_nAutoPlay || m_bSkipFastNow) {
			//	まるごと表示
//			lpPlane->BltNatural(m_vTextDraw->GetPlaneBase(),m_nTextX,m_nTextY);
			m_bGoNext = true;

			//	文字列を選択中なのか？
			//	-- バックログ表示中でないならば
			if (m_bSelect && !GetBackLog()->IsBackLogMode()) {	//	セレクトタグが混じっている
				m_bGoNext = false;
				m_bSkipFastNow = false;
				// スキップの停止(これPause動作のほうがええような気がするなぁ．．)
				OnSelectMes(lpPlane); // 選択フェイズへ
			}

			//	プロンプト表示
			if (m_bMesNext && m_bWaitInput && !m_vBackLog->IsBackLogMode()) {
/*
				//	点滅表示中
				if (!*m_nMesNextCount.GetReversing()) {
					lpPlane->BltNatural(GetButtonLoader()->GetPlaneBase(12),m_nMesNextX,m_nMesNextY);
				} else if(GetButtonLoader()->GetMax()>13) {// 13 番目があるならそれと交互に描画
					lpPlane->BltNatural(GetButtonLoader()->GetPlaneBase(13),m_nMesNextX,m_nMesNextY);
				}
*/
				m_nMesNextCount.Inc();
			}
		} else {
/*
			//	文字を１文字ずつ表示
			for(int i=0;(i<n) && (i<s);++i){
				LPRECT lpRect = (*m_vTextDraw->GetRects())[i];
				lpPlane->BltNatural(m_vTextDraw->GetPlaneBase()
					,m_nTextX + lpRect->left
					,m_nTextY + lpRect->top
					,lpRect
				);
			}
*/
			m_bGoNext = false;
		}
	}

	return 0;
}

// @yo2 0x0055dc90 feat
void	CScenarioDraw::OnSelectMes(CPlaneBase* lpPlane){
	// 選択フェイズ

	vector<int>& an = *(GetTextDraw()->GetSelectTag());
	VRECTS& vRect = *(GetTextDraw()->GetRects());

	int nOx = m_nTextX , nOy = m_nTextY;
	RECT rc;
	for(int j=0;j<an.size()/2;j++){
		int nStartMoji = an[j*2	 ];
		int nEndMoji   = an[j*2+1];
		bool bFirst = true;
		for(int i=nStartMoji;i<nEndMoji;i++){
			if (bFirst) {
				bFirst = false;
				rc = *vRect[i];
				::SetRect(&rc,rc.left + nOx,rc.top + nOy,rc.right + nOx,rc.bottom + nOy);
			} else {
				//	１つ前のRectと合成
				RECT rc2;
				rc2 = *vRect[i];
				::SetRect(&rc2,rc2.left + nOx,rc2.top + nOy,rc2.right + nOx,rc2.bottom + nOy);
				if (rc2.top	   < rc.top)	rc.top	  = rc2.top;
				if (rc2.left   < rc.left)	rc.left	  = rc2.left;
				if (rc2.right  > rc.right)	rc.right  = rc2.right;
				if (rc2.bottom > rc.bottom) rc.bottom = rc2.bottom;
			}
		//		((CDIB32*)lpPlane)->AddColorFast(0x404040,&rc);
		}

		{ // これ選択されているので、マークする
			int x,y;
			GetMouse()->GetXY(x,y);
			if (rc.left <= x && x < rc.right && rc.top <= y && y < rc.bottom){
				m_nSelect = j;
				if (GetMouse()->IsPushLButton()){
					m_nSelectedNo = j;
					m_bSelect = false;	// Selected!!
					m_bGoNext = true;	//	次のメッセージへ進む
				}
			}
		}

		if (j==m_nSelect) { // これ選択されているので、アクティブ表示
			lpPlane->FlushEffect(&rc);
		}
	}
}

// @yo2 0x0055e120 vt
LRESULT CScenarioDraw::OnDrawText(HDC hdc){	//	[Konami] CFont::SetText takes wide strings
	OnDrawBG(hdc);
	OnDrawSCChara(hdc);

	//	ネームプレート描画
	if (m_nNamePlate != -1) {
	  if (m_nNamePlate < GetNameLoader()->GetMax()) {
		CPlaneBase* lp = GetNameLoader()->GetPlaneBase(m_nNamePlate);
		if (lp!=NULL) {
			if (lp->IsLoaded()){
			//	lpPlane->BltNatural(lp,m_nNamePlateX,m_nNamePlateY);
			//	OnDrawTextのときには描画しない
			} else {
				CFont font;
				font.SetText(L"NamePlate = %d",m_nNamePlate);
				font.OnDraw(hdc,0,16);
			}
		}
	  } else {
		CFont font;
		font.SetText(L"NamePlate = %d",m_nNamePlate);
		font.OnDraw(hdc,0,16);
	  }
	}
	//	FaceMark表示
	if (m_bFaceMark && m_nFaceMark != -1) {
	  if (m_nFaceMark < GetFaceLoader()->GetMax()) {
		CPlaneBase* lp = GetFaceLoader()->GetPlaneBase(m_nFaceMark);
		if (lp!=NULL) {
			if (lp->IsLoaded()){
			//	lpPlane->BltNatural(lp,m_nFaceMarkX,m_nFaceMarkY);
			} else {
				CFont font;
				font.SetText(L"FaceMark = %d",m_nFaceMark);
				font.OnDraw(hdc,0,32);
			}
		}
	  } else {
		CFont font;
		font.SetText(L"FaceMark = %d",m_nFaceMark);
		font.OnDraw(hdc,0,32);
	  }
	}

	return 0;
}

//////////////////////////////////////////////////////////////////////////////
//--- 追加 '02/01/16  by ENRA ---
// @yo2 0x0055e610 vt
void	CScenarioDraw::OnMoveBG(CPlaneBase*lpDraw){
	//	BG描画
	if (m_nBGCG != -1 && (m_nBGCG < GetBGLoader()->GetMax())){
		//	一枚古いＢＧを描画
		if (m_nBGCount<256) {
			m_nBGCount.IncS();
		}
	} else {
	}
}
//-------------------------------
//	ディフォルトのＢＧ描画用関数
// @yo2 0x0055e730 vt
void	CScenarioDraw::OnDrawBG(CPlaneBase*lpDraw){
	//	BG描画
	if (m_nBGCG != -1 && (m_nBGCG < GetBGLoader()->GetMax())){
		//	一枚古いＢＧを描画
		if (m_nBGCount<256) {
			if (m_nBGCGOld != -1 && (m_nBGCGOld < GetBGLoader()->GetMax())){
				CPlaneBase* lp = GetBGLoader()->GetPlaneBase(m_nBGCGOld);
				if (lp!=NULL && lp->IsLoaded()) {
					lpDraw->BltFast(lp,0,0);	//	(0,0)でええんやろな？
				}
			}
			//m_nBGCount.IncS();  こらこら^^; by ENRA
		}

		CPlaneBase* lp = GetBGLoader()->GetPlaneBase(m_nBGCG);
		if (lp!=NULL) {
			if (lp->IsLoaded()) {
				//	BltFastでええんかな…
				CPlaneTransBlt::Blt(m_nBGBltType,lpDraw,lp,0,0,m_nBGCount,0);
				//	(0,0)でええんやろな？
			} else {
				lpDraw->ClearRect();
				//	画面消しとこう＾＾；
			//	CFont font;
			//	font.SetText("BG = %d",m_nBGCG);
			}
		}
	} else {
		lpDraw->ClearRect();
		//	画面消しとこう＾＾；
	}
}

// @yo2 0x0055ea40 vt
void	CScenarioDraw::OnDrawBG(HDC hdc){	//	[Konami] CFont::SetText takes wide strings
	//	BG描画
	if (m_nBGCG != -1) {
	  if (m_nBGCG < GetBGLoader()->GetMax()){
		CPlaneBase* lp = GetBGLoader()->GetPlaneBase(m_nBGCG);
		if (lp!=NULL) {
			if (lp->IsLoaded()) {
			//	lpPlane->BltNatural(lp,0,0);	//	(0,0)でええんやろな？
			} else {
				CFont font;
				font.SetText(L"BG = %d",m_nBGCG);
				font.OnDraw(hdc,0,0);
			}
		}
	  } else {
		CFont font;
		font.SetText(L"BG = %d",m_nBGCG);
		font.OnDraw(hdc,0,0);
	  }
	}
}

//--- 追加 '02/01/16  by ENRA ---
// @yo2 0x0055ece0 vt
void	CScenarioDraw::OnMoveSCChara(CPlaneBase*lpDraw){
	//	SC描画
	for(int i=0;i<3;i++){
		if (m_nSCCG[i] != -1 && (m_nSCCG[i] < GetSCLoader()->GetMax())){
			m_nSCCount[i].IncS();
		}
	}
}
//-------------------------------
//	ディフォルトの立ちキャラ描画関数
// @yo2 0x0055ee20 vt
void	CScenarioDraw::OnDrawSCChara(CPlaneBase*lpDraw){
	//	SC描画
	for(int i=0;i<3;i++){
		if (m_nSCCG[i] != -1 && (m_nSCCG[i] < GetSCLoader()->GetMax())){
			//m_nSCCount[i].IncS();  こらこら^^; by ENRA
			CPlaneBase* lp = GetSCLoader()->GetPlaneBase(m_nSCCG[i]);
			if (lp!=NULL) {
				if (lp->IsLoaded()) {
					//	BltNaturalでええんかな…
					int x = 160*(i+1); // ここにセンタリングして表示
					int sx,sy;
					lp->GetSize(sx,sy);
					x -= sx >> 1;
					CPlaneTransBlt::Blt(m_nSCBltType[i],lpDraw,lp,x,0,m_nSCCount[i],3);
					//	座標はテキトー＾＾；
				}
			}
		}
	}
}

// @yo2 0x0055f080 vt
void	CScenarioDraw::OnDrawSCChara(HDC hdc){	//	[Konami] CFont::SetText takes wide strings
	//	SC描画
	for(int i=0;i<3;i++){
		if (m_nSCCG[i] != -1) {
			if (m_nSCCG[i] < GetSCLoader()->GetMax()){
				CPlaneBase* lp = GetSCLoader()->GetPlaneBase(m_nSCCG[i]);
				if (lp!=NULL) {
					if (lp->IsLoaded()) {
					} else {
						CFont font;
						font.SetText(L"立ちキャラ[%d] = %d",i,m_nSCCG[i]);
						font.OnDraw(hdc,0,64+i*16);
					}
				}
			} else {
				CFont font;
				font.SetText(L"立ちキャラ[%d] = %d",i,m_nSCCG[i]);
				font.OnDraw(hdc,0,64+i*16);
			}
		}
	}
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0055f390 vt
LRESULT CScenarioDraw::OnDrawMesBox(CPlaneBase* lpPlane) {
	int nSize = m_alpTalkBox.size();
	for(int i=0;i<nSize;++i){
		lpPlane->BltNatural(m_alpTalkBox[i],m_anTalkBoxX[i],m_anTalkBoxY[i]);
	}
	return 0;
}

// @yo2 0x0055f420 vt
LRESULT CScenarioDraw::Open(string filename){
	Reset();
	if (GetFile()->Read(filename)!=0) return 1; //	open error
	GetTextDrawContext()->SetTextPtr((LPCWSTR)GetFile()->GetMemory());	//	[Konami] the file itself is used as wide text (no conversion)
	GetTextDraw()->SetContext(*GetTextDrawContext());
	{
		if (m_alpStartGameContext!=NULL) {
			//	それ設定しとこか
			SetGameContext(m_alpStartGameContext);
		}
		if (!m_szStartLabel.empty()){
			LRESULT lr = SkipToLabel(m_szStartLabel);
			if (lr!=0) return lr;	//	ラベル見つからんかった？
			//	↑上の関数のなかでUpdateTextしてるでしょ！
			return lr;
		} ef (m_nStartPos!=-1) {
			LRESULT lr = SetReadPosition(m_nStartPos);
			if (lr!=0) return lr;	//	そんなん無い？？
			//	↑上の関数のなかでUpdateTextしてるでしょ！
			return lr;
		}
	}
	return UpdateText();
}

//	実描画処理
// @yo2 0x0055faf0 vt
LRESULT CScenarioDraw::GoNext(void){
	if (m_bWaitTransition) return 0;

	//	メッセージプロンプトのリセット
	if (m_bMesNext) {
		//	リセットすると押しっぱなしで進むのが遅すぎる
		*m_nMesNextCount.GetReversing() = false;
		m_nMesNextCount = m_nMesNextCount.GetEnd() / 2;
	}
	//	BackLogならば、それをキャンセル
	if (!GetBackLog()->IsBackLogMode()) {
		//	Back Log中でなかったので次の段落に進める
		GetTextDraw()->GoNextContext();
	}
	LRESULT lr = UpdateText();

	//	トランジションの終了を待つ
	if (lr && !IsEndTransition()) {
		m_bWaitTransition = true;
		lr = 0;
	} else {
		if (GetBackLog()->IsBackLogMode()) {
			//	back log表示からの回復ならば一気に表示
			m_nTextPhase = m_nTextPhase.GetEnd();
		} else {
			//	resetすると、押しっぱなしで先に進むのが遅すぎる
			m_nTextPhase.Reset();
		}
	}
	GetBackLog()->SetBackLogMode(false);
	return lr;
}

// @yo2 0x0055fd70 vt
LRESULT CScenarioDraw::GoBackTo(int nNum){
	GetBackLog()->SetBackLogMode(false);
	if (GetBackLog()->GoBackTo(nNum)!=0) return 1; // これ以上戻れないらしい
	return GoBack(GetBackLog()->GetLog()->GetTextDrawContext());
}

//	過去ログ描画処理
// @yo2 0x0055ffe0 vt
LRESULT CScenarioDraw::GoBack(CTextDrawContext*lp){
	//	いったんバックアップをとって、コンテクストを摩り替える
	CTextDrawContext v	= *GetTextDraw()->GetContext();
//	CTextDrawContext v2 = *GetTextDraw()->GetNextContext();

	GetTextDraw()->SetContext(*lp);

	//	バックログはグレーカラー表示
	*GetTextDraw()->GetGrayColorFlag() = true;
	LRESULT hr = UpdateText();
	*GetTextDraw()->GetGrayColorFlag() = false;

	//	戻しとかなきゃ＾＾；
	GetTextDraw()->SetContext(v);
//	GetTextDraw()->SetNextContext(v2);
	return hr;
}

//	特殊タグの解析
// @yo2 0x00560310 vt
LRESULT CScenarioDraw::UpdateText(void){
	if (GetTextDraw()->UpdateText()!=0) return 2; // draw error

	//	終了設定位置を越えたか？
	if (m_nEndPos!=-1) {
		if (GetTextDraw()->GetTextOffset()>=m_nEndPos) return 3;
	}

	//	バックログ表示中なのでそのまま帰る
	if (GetBackLog()->IsBackLogMode()) return 0;

	//	未知のタグの解析
	vector<LPCWSTR>::iterator it = (*GetTextDraw()->GetTagList()).begin();	//	[Konami] wide tags
	while (it!=(*GetTextDraw()->GetTagList()).end()){
		LPCWSTR lpsz = *it;
		//	BGCGタグ
		if (CStringScanner::IsToken(lpsz,L"BGCG")){
			while (true){
				m_nBGCGOld = m_nBGCG;
				if (CStringScanner::GetNumFromCsv(lpsz,m_nBGCG)!=0){
					m_nBGCG = -1;	//	読み込み失敗にょ＾＾；
					//	リスナをかませる
					if (m_vTransListener!=NULL) {
						m_vTransListener->OnSetBGCG(m_nBGBltType,m_nBGCount,m_nBGCG);
					}
					break;
				}
				if (CStringScanner::GetNumFromCsv(lpsz,m_nBGBltType)!=0){
					//	no effect
					m_nBGBltType = 0;
					m_nBGCount = 256;
					//	リスナをかませる
					if (m_vTransListener!=NULL) {
						m_vTransListener->OnSetBGCG(m_nBGBltType,m_nBGCount,m_nBGCG);
					}
					break;
				} else {
					m_nBGCount = 0;
				}

				//	リスナをかませる
				if (m_vTransListener!=NULL) {
					m_vTransListener->OnSetBGCG(m_nBGBltType,m_nBGCount,m_nBGCG);
				}

				break;
			}
		//	SCCGタグ
		} ef (CStringScanner::IsToken(lpsz,L"StandCharaIn")){
			while (true){
				int nCGNo,nPos,nEffect;
				if (CStringScanner::GetNumFromCsv(lpsz,nCGNo)!=0){
					//	読み込み失敗にょ＾＾；
					break;
				}
				if (CStringScanner::GetNumFromCsv(lpsz,nPos)!=0){
					//	読み込み失敗にょ＾＾；
					break;
				}
				if (nPos<0 || nPos>2) break;//	範囲外の指定にょ！
				if (CStringScanner::GetNumFromCsv(lpsz,nEffect)!=0){
					//	第３パラメータの省略形にょ
					m_nSCCG[nPos] = nCGNo;
					m_nSCBltType[nPos] = 0;
					m_nSCCount[nPos] = 256;
				} else {
					m_nSCCG[nPos] = nCGNo;
					m_nSCBltType[nPos] = nEffect;
					m_nSCCount[nPos] = 0;
				}

				//	リスナをかませる
				if (m_vTransListener!=NULL) {
					m_vTransListener->OnSetStandCharaIn(m_nSCBltType[nPos],m_nSCCount[nPos] ,m_nSCCG[nPos], nPos);
				}

				*m_nSCCount[nPos].GetReversing() = false;
				break;
			}
		} ef (CStringScanner::IsToken(lpsz,L"StandCharaOut")){
			while (true){
				int nPos,nEffect;
				if (CStringScanner::GetNumFromCsv(lpsz,nPos)!=0){
					//	読み込み失敗にょ＾＾；
					break;
				}
				if (nPos<0 || nPos>2) break;//	範囲外の指定にょ！
				if (CStringScanner::GetNumFromCsv(lpsz,nEffect)!=0){
					//	第２パラメータの省略形にょ
					m_nSCCG[nPos]		= -1;
					m_nSCBltType[nPos]	= 0;
					m_nSCCount[nPos]	= 0;	//	いますぐ消すにょ＾＾；
				} else {
					m_nSCBltType[nPos] = nEffect;
				}


				//	リスナをかませる
				if (m_vTransListener!=NULL) {
					m_vTransListener->OnSetStandCharaOut(m_nSCBltType[nPos],m_nSCCount[nPos] ,m_nSCCG[nPos], nPos);
				}

				*m_nSCCount[nPos].GetReversing() = true;
				break;
			}
		//	NamePlateタグ
		}ef(CStringScanner::IsToken(lpsz,L"NamePlate")) {
			if (CStringScanner::GetNumFromCsv(lpsz,m_nNamePlate)!=0){
				m_nNamePlate = -1;	//	読み込み失敗にょ＾＾；
			}
		//	FaceMarkタグ
		}ef(CStringScanner::IsToken(lpsz,L"FaceMark")) {
			if (CStringScanner::GetNumFromCsv(lpsz,m_nFaceMark)!=0){
				m_nFaceMark = -1;	//	読み込み失敗にょ＾＾；
			}
		//	SE タグ
		}ef(CStringScanner::IsToken(lpsz,L"SEPLAY")) {
			while (true){
				int nNo,bLoop,nInterval;
				if (CStringScanner::GetNumFromCsv(lpsz,nNo)!=0){
					break;
				}
				if (CStringScanner::GetNumFromCsv(lpsz,bLoop)!=0){
					bLoop = 0;
				}
				if (CStringScanner::GetNumFromCsv(lpsz,nInterval)!=0){
					nInterval = 0;
				}
				//	一応、範囲外のチェックしておこうか…
				if (nNo < GetSELoader()->GetMax()) {
					if (bLoop<0) {
						GetSELoader()->PlayT(nNo,-bLoop,nInterval); //	回数指定再生
					} ef (bLoop) {	//	ループ再生
						GetSELoader()->PlayL(nNo);
					} else {		//	非ループ再生
						GetSELoader()->Play(nNo);
					}
				}
				break;
			}
		}ef(CStringScanner::IsToken(lpsz,L"SESTOP")) {
			int nNo;
			if (CStringScanner::GetNumFromCsv(lpsz,nNo)==0){
				if (nNo == -1){
					GetSELoader()->ReleaseAll();
				} ef (nNo < GetSELoader()->GetMax()) {
					GetSELoader()->Stop(nNo);
				}
			}
		//	BGM タグ
		}ef(CStringScanner::IsToken(lpsz,L"BGMPLAY")) {
			while (true){
				int nNo,bLoop;
				if (CStringScanner::GetNumFromCsv(lpsz,nNo)!=0){
					break;
				}
				if (CStringScanner::GetNumFromCsv(lpsz,bLoop)!=0){
					bLoop = 1;	//	ディフォルトでループ再生
				}
				BGMPlay(nNo,bLoop!=0);
				break;
			}
		}ef(CStringScanner::IsToken(lpsz,L"BGMSTOP")) {
			GetBGMLoader()->Stop();
			m_nBGMNo = -1; // not play
		//  VOICE タグ
		}ef(CStringScanner::IsToken(lpsz,L"VOICEPLAY")) {
			while (true){
				int nNo;
				if (CStringScanner::GetNumFromCsv(lpsz,nNo)!=0){
					break;	//	失敗の巻き
				}
				if (nNo==-1){
					GetVoiceLoader()->Stop();
					//	停止させとくとええやろ
				}
				ef (nNo < GetVoiceLoader()->GetMax()){
					GetVoiceLoader()->PlayOnce(nNo);
				}
				break;
			}
		}ef(CStringScanner::IsToken(lpsz,L"AUTOPLAY")) {
			while (true){
				int nFrame;
				if (CStringScanner::GetNumFromCsv(lpsz,nFrame)!=0){
					break;	//	失敗の巻き
				}
				m_nAutoPlay = nFrame;
				m_nAutoPlayCount = nFrame;
			}
		}ef(!m_szEndLabel.empty() && CStringScanner::IsToken(lpsz,L"JUMPLABEL")){
		//	ＥＮＤラベルかいな？？
			//	これやー。一致するかどうか調べよっと
			if (CStringScanner::GetNextStr(lpsz) == m_szEndLabel) {
				return 5; // 一致したんで帰る。
			}
		}ef(CStringScanner::IsToken(lpsz,L"EFFECTON")){
		//	エフェクト開始
			//	EffectOn nLayer(0-15),nType(0-5?),nStart,nEnd,nStep=1
			while (true){
				int nLayer,nType,nStart,nEnd,nStep;
				if (CStringScanner::GetNumFromCsv(lpsz,nLayer)!=0){ break; }
				if (CStringScanner::GetNumFromCsv(lpsz,nType)!=0){ break; }
				if (CStringScanner::GetNumFromCsv(lpsz,nStart)!=0){ break; }
				if (CStringScanner::GetNumFromCsv(lpsz,nEnd)!=0){ break; }
				if (CStringScanner::GetNumFromCsv(lpsz,nStep)!=0){ nStep=1; }
				m_vScenarioEffect[nLayer].Add(m_vScenarioEffectFactory->CreateInstance(nType));
				WARNING(m_vScenarioEffect[nLayer]==NULL,"CScenarioView::UpdateText規定外のエフェクト");
				m_vAfterEffect[nLayer].m_bEnable   = true;
				m_vAfterEffect[nLayer].m_nEffectNo = nType;
				m_vAfterEffect[nLayer].m_nCount.Set(nStart,nEnd,nStep);
				m_vAfterEffect[nLayer].m_nBG	   = -1;
				break;
			}
		}ef(CStringScanner::IsToken(lpsz,L"EFFECTCHANGE")){
		//	エフェクトパラメータの変更
			//	EffectChange nLayer,nStart,nEnd,nStep=1
			while (true){
				int nLayer,nStart,nEnd,nStep;
				if (CStringScanner::GetNumFromCsv(lpsz,nLayer)!=0){ break; }
				if (CStringScanner::GetNumFromCsv(lpsz,nStart)!=0){ break; }
				if (CStringScanner::GetNumFromCsv(lpsz,nEnd)!=0){ break; }
				if (CStringScanner::GetNumFromCsv(lpsz,nStep)!=0){ nStep=1; }
//				m_vScenarioEffect[nLayer].Add(m_vScenarioEffectFactory->CreateInstance(nType));
//				m_vAfterEffect[nLayer].m_bEnable   = true;
//				m_vAfterEffect[nLayer].m_nEffectNo = nType;
				m_vAfterEffect[nLayer].m_nCount.Set(nStart,nEnd,nStep);
				break;
			}
		}ef(CStringScanner::IsToken(lpsz,L"EFFECTOFF")){
		//	エフェクト終了
			//	EffectOff nLayer(0-15)
			while (true){
				int nLayer;
				if (CStringScanner::GetNumFromCsv(lpsz,nLayer)!=0){ break; }
				m_vScenarioEffect[nLayer].Delete();
				m_vAfterEffect[nLayer].m_bEnable = false;
				break;
			}
		}ef(CStringScanner::IsToken(lpsz,L"EFFECTBG")){
		//	エフェクト用プレーンに渡す
			//	EffectBG nLayer(0-15) nBGNo
			while (true){
				int nLayer,nBGNo;
				if (CStringScanner::GetNumFromCsv(lpsz,nLayer)!=0){ break; }
				if (CStringScanner::GetNumFromCsv(lpsz,nBGNo)!=0){ break; }
				if (m_vScenarioEffect[nLayer]==NULL) break;
				m_vScenarioEffect[nLayer]->OnDrawBGSurface(GetBGLoader()->GetPlaneBase(nBGNo));
				m_vAfterEffect[nLayer].m_nBG   = nBGNo; // このＢＧナンバーを保持
				break;
			}
		}ef(CStringScanner::IsToken(lpsz,L"GAMEOPTION")){
		//	オプションの変更
			//	GameOption n , m
			while (true){
				int nOptionNo,nData;
				if (CStringScanner::GetNumFromCsv(lpsz,nOptionNo)!=0){ break; }
				if (CStringScanner::GetNumFromCsv(lpsz,nData)!=0){ break; }
				WARNING(nOptionNo<0 || nOptionNo>16,"CScenarioView::UpdateText規定外のオプション");
				m_anOption[nOptionNo] = nData;
				break;
			}
		}ef(CStringScanner::IsToken(lpsz,L"SetReadPosition")){
		//	テキスト読み上げ開始位置設定
			//	SetReadPosition n
			while (true){
				int nPos;
				if (CStringScanner::GetNumFromCsv(lpsz,nPos)!=0){ break; }
				m_nTextPhase.SetStart(nPos);
				// ここをメッセージ読み上げ開始位置とする
				break;
			}
		} else {
		//	それ以外は無視
		}
		it++;
	}

	//	バックログを取るのか？
	if (GetBackLog()->IsBackLogFlag() && (GetTextDraw()->GetRects()->size() != 0)){
		GetBackLog()->SetLog(GetTextDraw()->GetContext(),GetTextDraw()->GetNextContext());
	}

	//	セレクトタグが混じっていたのか？（選択モード！！）
	m_bSelect = GetTextDraw()->GetSelectTag()->size()!=0;
	m_nSelect = 0; // とりあえず、最初の要素を選択

	return 0;
}

// @yo2 0x00561b50 vt
LRESULT CScenarioDraw::Input(void){
	//	古くなったイメージの自動解放処理
	ReleaseOldCache();

	m_bWaitInput = false; //	入力待ちか？

	//	シーン終了後のトランジション待ちか？
	if (m_bWaitTransition) return IsEndTransition()?1:0;

	if (IsMesVisible()) {
		//	右クリック？
		if (GetMouse()->IsPushRButton() && !GetMouse()->IsGuardTime()){
			//	スキップ中は右クリックで、停止
			if (m_bSkipFastNow) {
				SkipFast(false);
			} else {
			//	非スキップ中は、右クリックで、メッセージウィンドの消去
				SetMesVisible(false);
			}
		}

		//	バックログモードか、オートプレーでないならば…
		if (GetBackLog()->IsBackLogMode() || !m_nAutoPlay) {
			if (m_bSkipFastNow) { // スキップモードならば、どんどんスキップ可能
				return GoNext();
			} else {

				bool bPressCtrl = GetKey()->GetDevice(0)->IsKeyPress(DIK_LCONTROL) || GetKey()->GetDevice(0)->IsKeyPress(DIK_RCONTROL);

				//	もし、スキップキーを押しているならば、高速表示
				if ( bPressCtrl || (GetMouse()->RButton() && !GetMouse()->IsGuardTime())) {
					m_nTextPhase = m_nTextPhase.GetEnd();
				//	m_nMesNextCount.Reset();
				}
				if (m_bGoNext) {
					if (GetKey()->IsVKeyPush(5) || GetKey()->IsVKeyPush(6) || (GetMouse()->IsPushLButton() && !GetMouse()->IsGuardTime())) {
						m_bKeyRepeat = true;
						return GoNext();
					}
					//	押しっぱなしの場合、このプロンプトが消えるタイミングで押したことになる
					if (m_bKeyRepeat && *m_nMesNextCount.GetReversing() && (GetKey()->IsVKeyPress(5) || (GetMouse()->LButton()&& !GetMouse()->IsGuardTime()))){
						return GoNext();
					}
				}
				m_bWaitInput = true; // 入力待ち
			}
		} else {
			//	自動再生モード！
			if (--m_nAutoPlayCount == 0) {
				m_nAutoPlayCount = m_nAutoPlay;
				return GoNext();
			}
		}
	} else {
		//	ウィンドゥ非表示
		if (GetKey()->IsVKeyPress(5) ||
			((GetMouse()->IsPushLButton()||(GetMouse()->IsPushRButton())
				&& !GetMouse()->IsGuardTime())
			)
		) {
			SetMesVisible(true);
			//	表示後、いきなり押されるのを避ける
			m_vButtonX->Reset();
			m_vButtonBack->Reset();
			m_vButtonPrev->Reset();
			//	ここで、いったん停止。
			m_bKeyRepeat = false;
		}
	}
	return 0;
}

// ---------  メッセージの高速スキップ処理系

// @yo2 0x00562460 vt
void	CScenarioDraw::SetSkipFast(bool b){
	m_bSkipFast = b;

	//	早送りを許可しないのならば、いまやってる早送りは中止にょ＾＾
	if (!b) {
		m_bSkipFastNow = false;
	}
}

// @yo2 0x00562490 vt
void	CScenarioDraw::SkipFast(bool bEnable){
	if (bEnable) {
		if (!m_bSkipFast) return ; // 許可されていない
		m_bSkipFastNow = true;
	} else {
		m_bSkipFastNow = false;
	}
}

// @yo2 0x005624d0 vt
bool	CScenarioDraw::IsEndTransition(){
	return (m_nBGCount == 0 || m_nBGCount==256)
		&& (m_nSCCount[0]==0 || m_nSCCount[0]==256)
		&& (m_nSCCount[1]==0 || m_nSCCount[1]==256)
		&& (m_nSCCount[2]==0 || m_nSCCount[2]==256);
}

//	古くなった画像等を自動的に解放する
// @yo2 0x00562540 cg
void	CScenarioDraw::ReleaseOldCache(void){
	//	毎フレームこれを呼び出すと非常に処理が重いので、何フレームかに一回だけにする
	//	また、解放が集中するといけないので、カウンタでまわして処理を振り分ける

	m_nOldImageCount ++;
	if ((m_nOldImageCount & 7)!=0) return ;
	switch ((m_nOldImageCount>>3) % 8){
	case 0:
		m_vBGLoader->IncStaleTime();
		m_vBGLoader->ReleaseStaleAll(5);		//	ＢＧサーフェース読み込み用
		break;
	case 1:
		m_vSCLoader->IncStaleTime();
		m_vSCLoader->ReleaseStaleAll(5);		//	立ちキャラ読み込み用
		break;
	case 2:
		m_vFaceLoader->IncStaleTime();
		m_vFaceLoader->ReleaseStaleAll(5);		//	顔マーク
		break;
	case 3:
		m_vNameLoader->IncStaleTime();
		m_vNameLoader->ReleaseStaleAll(5);		//	ネームプレート
		break;
	case 4:
		m_vButtonLoader->IncStaleTime();
		m_vButtonLoader->ReleaseStaleAll(5);	//	ボタンのloader
		break;
	case 5: //	古くなったＳＥはここで解放
		m_vSELoader->IncStaleTime();
		m_vSELoader->ReleaseStaleAll(5);
	case 6: //　古くなったＢＧＭはここで解放
		m_vBGMLoader->IncStaleTime();
		m_vBGMLoader->ReleaseStaleAll(5);
	case 7: //　古くなったＶｏｉｃｅはここで解放
		m_vVoiceLoader->IncStaleTime();
		m_vVoiceLoader->ReleaseStaleAll(5);
	}
}

// @yo2 0x005626a0 tight
void	CScenarioDraw::ReleaseCacheAll(void){
	m_vBGLoader->ReleaseAll();		//	ＢＧサーフェース読み込み用
	m_vSCLoader->ReleaseAll();		//	立ちキャラ読み込み用
	m_vFaceLoader->ReleaseAll();	//	顔マーク
	m_vNameLoader->ReleaseAll();	//	ネームプレート
	m_vButtonLoader->ReleaseAll();	//	ボタンのloader

	//	再生していないＳＥ等も解放
	m_vSELoader->IncStaleTime();
	m_vSELoader->ReleaseStaleAll(5);
	m_vBGMLoader->IncStaleTime();
	m_vBGMLoader->ReleaseStaleAll(1);
	m_vVoiceLoader->IncStaleTime();
	m_vVoiceLoader->ReleaseStaleAll(5);
}

//	--------------------------------------------------------------------------
// @yo2 0x00562760 feat
LRESULT CScenarioDraw::SkipToLabel(string szLabel){

	while (true) {
		if (GetTextDraw()->UpdateTextFast()!=0) return 1; // draw error

		//	未知のタグの解析
		vector<LPCWSTR>::iterator it = (*GetTextDraw()->GetTagList()).begin();
		while (it!=(*GetTextDraw()->GetTagList()).end()){
			LPCWSTR lpsz = *it;	//	[Konami] wide
			//	label tag
			if (CStringScanner::IsToken(lpsz,L"JUMPLABEL")){
				//	これやー。一致するかどうか調べよっと
				if (CStringScanner::GetNextStr(lpsz) == szLabel) {
					return 0; // 一致したんで帰る。
				}
			}
			it++;
		}
		GetTextDraw()->GoNextContext();
	}

	return 0;
}

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x00562a00 review
int		CScenarioDraw::GetReadPosition(){
	//	テキスト位置を設定・取得する
	return	GetTextDraw()->GetTextOffset();
}

// @yo2 0x00562ad0 review
LRESULT		CScenarioDraw::SetReadPosition(int nPos){
	LRESULT lr = GetTextDraw()->SetTextOffset(nPos);
	if (lr!=0) return lr;
	return UpdateText();
}
//////////////////////////////////////////////////////////////////////////////

// @yo2? 0x00562bf0 order
void		CScenarioDraw::BGMPlay(int nNo,bool bLoop){
	if (nNo==-1){
		GetBGMLoader()->Stop();
		//	停止させとくとええやろ
	}ef(nNo < GetBGMLoader()->GetMax()) {
		if (bLoop) {	//	ループ再生
			GetBGMLoader()->Play(nNo);
		} else {		//	非ループ再生
			GetBGMLoader()->PlayOnce(nNo);
		}
	}
	m_nBGMNo   = nNo;
	m_bBGMLoop = bLoop;
}

// @yo2? 0x00562e00 order
void		CScenarioDraw::GetGameContext(int* data){
	data[0] = m_nAutoPlay;
	data[1] = m_nAutoPlayCount;

	for(int i=0; i<3; i++){
		data[2+i*7] = m_nSCCG[i];
		data[3+i*7] = m_nSCCount[i].Get();
		data[4+i*7] = m_nSCCount[i].GetStart();
		data[5+i*7] = m_nSCCount[i].GetEnd();
		data[6+i*7] = m_nSCCount[i].GetStep();
		data[7+i*7] = (*m_nSCCount[i].GetReversing())?1:0;
		data[8+i*7] = m_nSCBltType[i];
	}

	data[23] = m_nFaceMark;
	data[24] = m_nNamePlate;

	data[25] = m_nBGCG;
	data[26] = m_nBGCount.Get();
	data[27] = m_nBGCount.GetStart();
	data[28] = m_nBGCount.GetEnd();
	data[29] = m_nBGCount.GetStep();
	data[30] = (*m_nBGCount.GetReversing())?1:0;
	data[31] = m_nBGBltType;

	data[32] = m_nBGMNo;
	data[33] = m_bBGMLoop?1:0;

	{
		//	34+15 == 49まで使用。
		for(int i=0;i<16;i++){
			data[i+34] = m_anOption[i];
		}
	}
	//	34+15 == 49まで使用。

	//	50～(EFFECT_MAX*2)*7個分の配列を使用
	{
		const int nV = 7; // 構造体サイズ
		const int nS = 50; // スタート
		for(int i=0;i<EFFECT_MAX*2;i++){
			data[i*nV+nS+0] = m_vAfterEffect[i].m_bEnable ? 1:0;
			data[i*nV+nS+1] = m_vAfterEffect[i].m_nEffectNo;
			data[i*nV+nS+2] = m_vAfterEffect[i].m_nBG;
			data[i*nV+nS+3] = m_vAfterEffect[i].m_nCount.GetStart();
			data[i*nV+nS+4] = m_vAfterEffect[i].m_nCount.GetEnd();
			data[i*nV+nS+5] = m_vAfterEffect[i].m_nCount.GetStep();
			data[i*nV+nS+6] = m_vAfterEffect[i].m_nCount;
		}
	}
}

// @yo2? 0x00562fb0 order
void		CScenarioDraw::SetGameContext(int* data){
	int i;	// [portable] MSVC6 for-scope: the i of the first loop is reused at the end
	m_nAutoPlay		= data[0];
	m_nAutoPlayCount= data[1];

	for(int i=0; i<3; i++){
		m_nSCCG[i]		= data[2+i*7];
		m_nSCCount[i]	= data[3+i*7];
		m_nSCCount[i].SetStart(data[4+i*7]);
		m_nSCCount[i].SetEnd(data[5+i*7]);
		m_nSCCount[i].SetStep(data[6+i*7]);
		*m_nSCCount[i].GetReversing() = (data[7+i*7]==1);
		m_nSCBltType[i] = data[8+i*7];
	}

	m_nFaceMark		= data[23];
	m_nNamePlate	= data[24];

	m_nBGCG			= data[25];
	m_nBGCount		= data[26];
	m_nBGCount.SetStart(data[27]);
	m_nBGCount.SetEnd(data[28]);
	m_nBGCount.SetStep(data[29]);
	m_nBGCount.SetReverse(data[30]==1);
	m_nBGBltType	= data[31];

	m_nBGMNo		= data[32];
	m_bBGMLoop		= data[33]!=0;

	BGMPlay(m_nBGMNo, m_bBGMLoop);

	{
		//	34+15 == 49まで使用。
		for(int i=0;i<16;i++){
			data[i+34] = m_anOption[i];
		}
	}

	{
		const int nV = 7; // 構造体サイズ
		const int nS = 50; // スタート
		for(int i=0;i<EFFECT_MAX*2;i++){
			bool bEnable = data[i*nV+nS+0] !=0;
			m_vAfterEffect[i].m_bEnable	  = bEnable;
			if (bEnable) {
				m_vAfterEffect[i].m_nEffectNo = data[i*nV+nS+1];
				m_vScenarioEffect[i].Add(m_vScenarioEffectFactory->CreateInstance(m_vAfterEffect[i].m_nEffectNo));
					
				int nBG = data[i*nV+nS+2];
				m_vAfterEffect[i].m_nBG		  = nBG;
				if (nBG!=-1){
					m_vScenarioEffect[i]->OnDrawBGSurface(GetBGLoader()->GetPlaneBase(nBG));
				}
	
				m_vAfterEffect[i].m_nCount.Set(
					data[i*nV+nS+3],data[i*nV+nS+4],data[i*nV+nS+5]
				);
				m_vAfterEffect[i].m_nCount = data[i*nV+nS+6];
			}
		}
	}

	//	リスナをかませる
	if (m_vTransListener!=NULL) {
		m_vTransListener->OnSetBGCG(m_nBGBltType,m_nBGCount,m_nBGCG);
		for(i=0; i<3; i++){
			if(*m_nSCCount[i].GetReversing()){
				m_vTransListener->OnSetStandCharaOut(m_nSCBltType[i],m_nSCCount[i] ,m_nSCCG[i], i);
			}else{
				m_vTransListener->OnSetStandCharaIn(m_nSCBltType[i],m_nSCCount[i] ,m_nSCCG[i], i);
			}
		}
	}
}

// @yo2? 0x00563450 order
void		CScenarioDraw::SetStartGameContext(int* data){
	m_alpStartGameContext = data;
}

// @yo2 0x00563470 vt
int			CScenarioDraw::GetRealBGNo(void){
	int n = m_nBGCG;
	if (n == -1) return -1;
	GetBGLoader()->GetLoadCacheListener()->OnLoad(n);
	return n;
}

//--- 追加 '02/01/16  by ENRA ---
// @yo2 0x005635f0 cg
void	CScenarioDraw::OnMoveCallBack(CPlaneBase* lpPlane,CEffectParam* lpEffect,int nOffset){
	for(int i = 0; i<EFFECT_MAX ; i++){
		if (lpEffect[i].m_bEnable) {
			int nEffectNo	= lpEffect[i].m_nEffectNo;
			//	↑このエフェクトナンバーは関係あらへんのか．．
			int nPhase		= lpEffect[i].m_nCount;
			lpEffect[i].m_nCount++;
			//	一応、NULL CHECKしとこかー
			CScenarioEffect* lpScnEffect = m_vScenarioEffect[i + nOffset];
			//	nOffset足さんとあかんねんな、、ボケとったわ＾＾；
			if (lpScnEffect!=NULL) {
				lpScnEffect->OnSimpleMove(lpPlane,nPhase);
				//lpScnEffect->OnSimpleDraw(lpPlane,nPhase); by ENRA
			}
		}
	}
}
//-------------------------------
// @yo2 0x00563770 cg
void	CScenarioDraw::OnDrawCallBack(CPlaneBase* lpPlane,CEffectParam* lpEffect,int nOffset){
	for(int i = 0; i<EFFECT_MAX ; i++){
		if (lpEffect[i].m_bEnable) {
			int nEffectNo	= lpEffect[i].m_nEffectNo;
			//	↑このエフェクトナンバーは関係あらへんのか．．
			int nPhase		= lpEffect[i].m_nCount;
			//lpEffect[i].m_nCount++;  こらこら^^;;
			//	一応、NULL CHECKしとこかー
			CScenarioEffect* lpScnEffect = m_vScenarioEffect[i + nOffset];
			//	nOffset足さんとあかんねんな、、ボケとったわ＾＾；
			if (lpScnEffect!=NULL) {
				//lpScnEffect->OnSimpleMove(lpPlane,nPhase); by ENRA
				lpScnEffect->OnSimpleDraw(lpPlane,nPhase);
			}
		}
	}
}

// @yo2 0x005637e0 review
void	CScenarioDraw::ResetEffect(void){
	for(int i=0;i<EFFECT_MAX * 2;i++){
		m_vScenarioEffect[i].Delete();
		m_vAfterEffect[i].m_bEnable = false;
	}
}

// @yo2? 0x00563a60 order
void	CScenarioDraw::SetGaiji(smart_ptr<CSpriteChara> v){
	m_vTextDraw->SetGaiji(v);
}

smart_ptr<CSpriteChara> CScenarioDraw::GetGaiji(){
	return m_vTextDraw->GetGaiji();
}

// @yo2 0x00563b00 review
void	CScenarioDraw::SetRepString(smart_ptr<vector<string> > v){
	m_vTextDraw->SetRepString(v);
}

// @yo2? 0x00563d70 order
smart_ptr<vector<string> > CScenarioDraw::GetRepString(){
	return m_vTextDraw->GetRepString();
}

//	<if n> ～ <endif>用の条件判定Listenerを渡す
// @yo2 0x00563e10 review
smart_ptr<CScenarioIfListener> CScenarioDraw::GetScenarioIfListener() { return GetTextDraw()->GetScenarioIfListener(); }
// @yo2? 0x00565530 order
void	CScenarioDraw::SetScenarioIfListener(smart_ptr<CScenarioIfListener> v) { GetTextDraw()->SetScenarioIfListener(v); }
