#include "stdafx.h"
#include "yaneScene.h"


void	CScene::ReturnScene(){
	GetSceneControl()->ReturnScene();
}

void	CScene::ExitScene(){
	GetSceneControl()->ExitScene();
}

//	シーン間でのパラメータを投げあう＾＾；
int*	CScene::GetSceneParam(void){
	return GetSceneControl()->GetSceneParam();
}

/////////////////////////////////////////////////////////////////////////////

CSceneControl::CSceneControl(smart_ptr<CSceneFactory> pvSceneFactory){
	m_nNextScene		= -1;
	m_nMessage			= 0;
	m_pvSceneFactory	= pvSceneFactory;
	//	念のためクリアしておく
	ZERO(m_anSceneParam);
}

void	CSceneControl::CreateScene(int nScene){
	if (nScene==-1) return ; // これ失敗なり
	//	新しいシーンを構築
//	m_vSceneFrame.m_lpScene.Delete();
	m_vSceneFrame.m_lpScene.Add(m_pvSceneFactory->CreateScene(nScene));
	m_vSceneFrame.m_lpScene->SetSceneControl(this);
	m_vSceneFrame.m_lpScene->OnInit();	//	これで初期化。
	//	現在のシーンは、そのシーンになる。
	m_vSceneFrame.m_nScene = nScene;
}

LRESULT CSceneControl::OnDraw(CPlaneBase*lpDraw) {// 追加
	// 修正 '02/03/01  by ENRA
	// 基本的にOnSimpleMoveのコピペ　OnSimpleMoveの代わりにOnDrawを呼ぶ
  do {
	//	OnInitのなかで次々とシーンジャンプしうるので先にメッセージをクリア
	int nMessage = m_nMessage;
	m_nMessage = 0;

	//	メッセージのdispatch
	switch (nMessage) {
		//	0:No Message 1:JumpScene 2:CallScene
		//	3:CallSceneFast 4:ReturnScene 5:ExitScene
	case 0: break;
	case 1:

		//	現在のシーンを破棄
		m_vSceneFrame.m_lpScene.Delete();
		//	新しいシーンを構築
		CreateScene(m_nNextScene);
		break;
	case 2: {
		//	現在のシーンを破棄
		m_vSceneFrame.m_lpScene.Delete();
		//	現在のシーンをスタック上に積んで、Deleteする。
		CSceneFrame	sf;
		sf.m_nScene = m_vSceneFrame.m_nScene;
		m_SceneFrameStack.push(sf);
		//	新しいシーンを構築
		CreateScene(m_nNextScene);
		break;
			}
	case 3:
		//	現在のシーンをスタック上に積んで、Deleteしない。
		//	⇒スマートポインタになっているのでpushしておけばDeleteされない。
		m_SceneFrameStack.push(m_vSceneFrame);
		//	新しいシーンを構築
		CreateScene(m_nNextScene);
		break;
	case 4:	{		//	元のシーンに戻る。
		//	現在のシーンを破棄
		m_vSceneFrame.m_lpScene.Delete();
		int nScene = m_vSceneFrame.m_nScene;
		//	ひとつ前のシーンをpop
		//	WARNING(m_SceneFrameStack.size()==0,"PushScene/CallSceneしていないのにReturnSceneしようとした");
		//	これが無いのならば、無いでかまへん＾＾；
		if (m_SceneFrameStack.size()==0) break;	//	もう戻るシーン無いねん

		m_vSceneFrame = m_SceneFrameStack.top();
		m_SceneFrameStack.pop();
		if (m_vSceneFrame.m_lpScene == NULL) {
			//	シーン解放してあるから、factoryで、また作ったらにゃ！
			CreateScene(m_vSceneFrame.m_nScene);
			//	一応、呼び出そか＾＾；
			if (m_vSceneFrame.m_lpScene!=NULL) {
				m_vSceneFrame.m_lpScene->OnComeBack(nScene);
			}
		} else {
			//	帰ってきたで～　ジェーンカンバークッ＾＾；
			m_vSceneFrame.m_lpScene->OnComeBack(nScene);
		}
		break;
			}
	case 5:	return 1;	//	描画せずに抜ける
	}

	if (m_vSceneFrame.m_lpScene!=NULL) {
		m_vSceneFrame.m_lpScene->OnDraw(lpDraw);
	}

  } while (m_nMessage!=0);
	//	上記のOnDrawのなかでさらに次のシーンに飛ぶことがある。
	//	メッセージは無くなるまで処理し続けるのが原則

  return 0;
}

LRESULT CSceneControl::OnSimpleDraw(CPlaneBase*lpDraw) {// 追加
	if (m_vSceneFrame.m_lpScene!=NULL) {// いちおうこんだけ(^^;
		m_vSceneFrame.m_lpScene->OnSimpleDraw(lpDraw);
	}
	return 0;
}

LRESULT		CSceneControl::OnSimpleMove(CPlaneBase* lpPlane){
  do {
	//	OnInitのなかで次々とシーンジャンプしうるので先にメッセージをクリア
	int nMessage = m_nMessage;
	m_nMessage = 0;

	//	メッセージのdispatch
	switch (nMessage) {
		//	0:No Message 1:JumpScene 2:CallScene
		//	3:CallSceneFast 4:ReturnScene 5:ExitScene
	case 0: break;
	case 1:

		//	現在のシーンを破棄
		m_vSceneFrame.m_lpScene.Delete();
		//	新しいシーンを構築
		CreateScene(m_nNextScene);
		break;
	case 2: {
		//	現在のシーンを破棄
		m_vSceneFrame.m_lpScene.Delete();
		//	現在のシーンをスタック上に積んで、Deleteする。
		CSceneFrame	sf;
		sf.m_nScene = m_vSceneFrame.m_nScene;
		m_SceneFrameStack.push(sf);
		//	新しいシーンを構築
		CreateScene(m_nNextScene);
		break;
			}
	case 3:
		//	現在のシーンをスタック上に積んで、Deleteしない。
		//	⇒スマートポインタになっているのでpushしておけばDeleteされない。
		m_SceneFrameStack.push(m_vSceneFrame);
		//	新しいシーンを構築
		CreateScene(m_nNextScene);
		break;
	case 4:	{		//	元のシーンに戻る。
		//	現在のシーンを破棄
		m_vSceneFrame.m_lpScene.Delete();
		int nScene = m_vSceneFrame.m_nScene;
		//	ひとつ前のシーンをpop
		//	WARNING(m_SceneFrameStack.size()==0,"PushScene/CallSceneしていないのにReturnSceneしようとした");
		//	これが無いのならば、無いでかまへん＾＾；
		if (m_SceneFrameStack.size()==0) break;	//	もう戻るシーン無いねん

		m_vSceneFrame = m_SceneFrameStack.top();
		m_SceneFrameStack.pop();
		if (m_vSceneFrame.m_lpScene == NULL) {
			//	シーン解放してあるから、factoryで、また作ったらにゃ！
			CreateScene(m_vSceneFrame.m_nScene);
			//	一応、呼び出そか＾＾；
			if (m_vSceneFrame.m_lpScene!=NULL) {
				m_vSceneFrame.m_lpScene->OnComeBack(nScene);
			}
		} else {
			//	帰ってきたで～　ジェーンカンバークッ＾＾；
			m_vSceneFrame.m_lpScene->OnComeBack(nScene);
		}
		break;
			}
	case 5:	return 1;	//	描画せずに抜ける
	}

	if (m_vSceneFrame.m_lpScene!=NULL) {
		m_vSceneFrame.m_lpScene->OnSimpleMove(lpPlane);
	}

  } while (m_nMessage!=0);
	//	上記のOnDrawのなかでさらに次のシーンに飛ぶことがある。
	//	メッセージは無くなるまで処理し続けるのが原則

  return 0;
}

void	CSceneControl::PushScene(int nScene){
	//	指定されたシーン名をスタック上に積む。
	CSceneFrame	sf;
	sf.m_nScene = nScene;
	m_SceneFrameStack.push(sf);
}

bool	CSceneControl::IsEnd(void){
	return m_vSceneFrame.m_lpScene == NULL;
}

bool	CSceneControl::IsPrecedentScene(void){
	//	シーンあるんやろな？
	CScene* lpScene = m_vSceneFrame.m_lpScene;
	if (lpScene == NULL) return false;

	return lpScene->IsPrecedentScene();
}
