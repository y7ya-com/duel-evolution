#include "stdafx.h"
#include "yaneSceneTransiter.h"
#include "yanePlaneEffectBlt.h"

CSceneTransiter::CSceneTransiter(){
	m_bTransition	 = false;
	m_bSnapNextScene = false;
	m_bStop			 = false;
	m_nTransCount.Set(0,256,16);	//	トランジションのディフォルトスピードは16
}

void	CSceneTransiter::Backup(CPlaneBase*lp,int n){
	int sx,sy;
	lp->GetSize(sx,sy);
	m_vPlane[n].Delete();	//	前のはいらんもんねー＾＾
	//	サーフェースの生成
	m_vPlane[n].Add(CPlaneBase::CreatePlane());
	//	↑ここでCreatePlaneを使うので、気をつけてね＾＾
	m_vPlane[n]->CreateSurface(sx,sy);
	m_vPlane[n]->BltFast(lp,0,0);
}

void	CSceneTransiter::BeginTransit(int nTransType,int nSpeed
		,int nStartPhase,int nEndPhase){
	m_bTransition	 = true;
	m_bSnapNextScene = true;	//	次のシーンはスナップする（スナップ予約）
	m_nTransType  = nTransType;
	m_nTransCount.Set(nStartPhase,nEndPhase,nSpeed);
	m_nTransCount.Reset();
}

#include "yaneDebugWindow.h"

LRESULT CSceneTransiter::OnSimpleMove(CPlaneBase* lpPlane){

	if (m_vSceneControl->IsPrecedentScene()){
		//	トランジションより優先するシーンか？(終了しますかダイアログなど)
		return m_vSceneControl->OnSimpleMove(lpPlane);
	}

	if (!m_bTransition || m_bStop) {
		//	トランジション中でないなら通常描画
		LRESULT lr = m_vSceneControl->OnSimpleMove(lpPlane);
		if (lr!=0) return lr;
		if (!m_bTransition) return 0;
		//	トランジション停止中なので、このまま帰る＾＾；
		if (m_bStop) return 0;

		//	スナップ予約が入っているか？
		if (m_bSnapNextScene){
			int sx,sy;
			lpPlane->GetSize(sx,sy);
			//	サーフェースの生成
			m_vPlane[2].Add(CPlaneBase::CreatePlane());
			m_vPlane[2]->CreateSurface(sx,sy);
			LRESULT lr;
			lr	= m_vSceneControl->OnSimpleDraw((CPlaneBase*)m_vPlane[2]); // ここに描画してもらおう＾＾；
			if (lr!=0) return lr; // いきなりエラーコード返すなよー＾＾
			m_bSnapNextScene = false;
		}
	}

	//	トランジションカウンタの加算
	m_nTransCount.IncS();
	if (m_nTransCount.IsLapAround()){
//		m_bTransition = false;	//	トランジション終了～＾＾
	}
	return 0;
}

LRESULT	CSceneTransiter::OnSimpleDraw(CPlaneBase* lpPlane){

	if (m_vSceneControl->IsPrecedentScene()){
		//	トランジションより優先するシーンか？(終了しますかダイアログなど)
		return m_vSceneControl->OnSimpleDraw(lpPlane);
	}

	if (!m_bTransition || m_bStop) {
		//	トランジション中でないなら通常描画
		LRESULT lr = m_vSceneControl->OnSimpleDraw(lpPlane);
		if (lr!=0) return lr;
		if (!m_bTransition) return 0;

		//	トランジション停止中なので、このまま帰る＾＾；
		if (m_bStop) return 0;

		// トランジションフェーズに入った

		//	----	やねうらおメモ
		//	OnSimpleMoveでトランジションを検出し、バックアッププレーンに
		//	描画することが保証されるのならばこの処理は不要なのだが、
		//	間違ってOnSimpleDraw内でトランジションを行なわれる可能性もあるので
		//	一応、このチェックを行なっておくことにする。

		//	スナップ予約が入っているか？
		if (m_bSnapNextScene){
			int sx,sy;
			lpPlane->GetSize(sx,sy);
			//	サーフェースの生成
			m_vPlane[2].Add(CPlaneBase::CreatePlane());
			m_vPlane[2]->CreateSurface(sx,sy);
			LRESULT lr;
			lr	= m_vSceneControl->OnSimpleDraw((CPlaneBase*)m_vPlane[2]); // ここに描画してもらおう＾＾；
			if (lr!=0) return lr; // いきなりエラーコード返すなよー＾＾
			m_bSnapNextScene = false;
		}
	}

	//	トランジションを行なうのだ
	lpPlane->BltFast(m_vPlane[1],0,0);
	CPlaneTransBlt::Blt(m_nTransType,lpPlane,m_vPlane[2],0,0,m_nTransCount,0);
	//	トランジションカウンタの加算
//	m_nTransCount.IncS();
	if (m_nTransCount.IsLapAround()){
		m_bTransition = false;	//	トランジション終了～＾＾
	}
	return 0;
}

//	こちらは、従来のプログラムとの互換性のため、
//	OnSimpleDraw,OnSimpleMoveに委譲するのではなく、
//	シーンクラスのOnDrawを直接呼び出しに行く
LRESULT	CSceneTransiter::OnDraw(CPlaneBase* lpPlane){
	if (m_vSceneControl->IsPrecedentScene()){
		//	トランジションより優先するシーンか？(終了しますかダイアログなど)
		return m_vSceneControl->OnDraw(lpPlane);
	}

	if (!m_bTransition || m_bStop) {
		//	トランジション中でないなら通常描画
		LRESULT lr = m_vSceneControl->OnDraw(lpPlane);
		if (lr!=0) return lr;
		if (!m_bTransition) return 0;
		//	トランジション停止中なので、このまま帰る＾＾；
		if (m_bStop) return 0;
		
		// トランジションフェーズに入った

		//	スナップ予約が入っているか？
		if (m_bSnapNextScene){
			int sx,sy;
			lpPlane->GetSize(sx,sy);
			//	サーフェースの生成
			m_vPlane[2].Add(CPlaneBase::CreatePlane());
			m_vPlane[2]->CreateSurface(sx,sy);
			LRESULT lr;
			lr	= m_vSceneControl->OnDraw((CPlaneBase*)m_vPlane[2]); // ここに描画してもらおう＾＾；
			if (lr!=0) return lr; // いきなりエラーコード返すなよー＾＾
			m_bSnapNextScene = false;
		}
	}

	//	トランジションを行なうのだ
	lpPlane->BltFast(m_vPlane[1],0,0);
	CPlaneTransBlt::Blt(m_nTransType,lpPlane,m_vPlane[2],0,0,m_nTransCount,0);
	//	トランジションカウンタの加算
	m_nTransCount.IncS();
	if (m_nTransCount.IsLapAround()){
		m_bTransition = false;	//	トランジション終了～＾＾
	}
	return 0;
}
