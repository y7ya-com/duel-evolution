//
//	yaneScene.h :
//
//		シーン管理クラス
//		⇒　やねうらおホームページ「天才ゲームプログラマ養成ギプス」の
//			第８，９，１１，１３章を参考のこと。
//

#ifndef __yaneScene_h__
#define __yaneScene_h__

#include "yanePlaneBase.h"

class CSceneControl;

/*	シーン定義例
enum SCENE {
	SCENE1,			//	シーン１
	SCENE2,			//	シーン２
};
*/

class CScene {
public:
	friend class CSceneControl;

	// ------ シーンの移動関連。次回のOnDrawタイミングで切り替わる。
	//	（次のOnDrawでは、このシーンの描画はされない）

	//	次に行くシーンを設定する
	template <class T>	void	JumpScene(T eScene){ GetSceneControl()->JumpScene(eScene); }

	//	シーンをコールする（ReturnSceneで、このクラスに戻ってくる）
	//		ただし、このクラスはいったんdeleteされる。
	template <class T>	void	CallScene(T eScene){ GetSceneControl()->CallScene(eScene); }

	//	シーンをコールする（ReturnSceneで、このクラスに戻ってくる）
	//		ただし、このクラスはdeleteされずに残る。
	//		そのシーンに移行するときに、OnCallSceneFastが呼び出される。
	template <class T>	void	CallSceneFast(T eScene){ GetSceneControl()->CallSceneFast(eScene); }
	//	CallScene/CallSceneFastで呼ばれたシーンに復帰する
	void	ReturnScene();

	//	シーンを終了する
	void	ExitScene();

	// --------------------------------------------------------------

	//	シーンをスタックに積む。
	//	(ReturnSceneしたときに、ここに積まれた順（スタックなので逆順）で
	//	シーンが呼び出される)
	template <class T>	void	PushScene(T eScene){ GetSceneControl()->PushScene(eScene); }

	//	PopSceneもできたら面白いかも知れないけど、
	//	それでは正しいシーン管理とは言えない気もする。(大域Jump禁止の論理)

	// --------------------------------------------------------------

	//	シーンの描画を行なう
	virtual void	OnDraw(CPlaneBase *lp) {
		OnSimpleDraw(lp);
		OnSimpleMove(lp);
	}

	//	↑を２つのフェーズに分解↓

	virtual void	OnSimpleDraw(CPlaneBase *lp) {};
	//	オブジェクトの移動を行う
	virtual void	OnSimpleMove(CPlaneBase* lp) {}// 追加

	//	初期化は、以下の関数で行なう。（コンストラクタではouterが使えないため）
	virtual void	OnInit() {}

	//	CallScene/CallSceneFastで呼び出し、ReturnSceneで戻ってきたときに呼び出される
	//	nSceneには、どのシーンから戻ってきたかが入る。
	virtual void	OnComeBack(int nScene){}

	// --------------------------------------------------------------

	//	いま実行しているシーンは、トランジションより優先するシーンか？
	virtual bool IsPrecedentScene(void) { return m_bPrecedentScene; }

	// --------------------------------------------------------------

	//	シーン間でのパラメータを投げあう＾＾；
	virtual int*	GetSceneParam(void);

	// --------------------------------------------------------------

	CScene() { m_bPrecedentScene = false; }
	virtual ~CScene(){} // place holder

protected:
	//	シーンコントローラーの設定／取得
	void	SetSceneControl(CSceneControl* lp) { m_lpSceneControl = lp; }
	CSceneControl* GetSceneControl(){ return m_lpSceneControl; }

	//	いま実行しているシーンは、トランジションより優先するシーンか？
	//	（WM_CLOSEに対する処理を行なうシーンなどは、これをOnにすると良い）
	void	SetPrecedentScene(bool b) { m_bPrecedentScene = b; }

private:
	CSceneControl* m_lpSceneControl;
	bool		   m_bPrecedentScene;		//	トランジションより優先するシーンか？
};

//	シーンの構築は、このクラスを派生させて、そこに登録する。
class CSceneFactory {
public:
	//	enumを無理やりintにキャストするためにメンバ関数テンプレートを用いる＾＾；
	template <class T>
			CScene* CreateScene(T eScene) { return CreateScene((int)eScene); }
	virtual CScene* CreateScene(int nScene) = 0;
	//	シーンを生成する(template関数は仮想化できないので、こういう設計になる)
};

class CSceneControl {
public:
	CSceneControl(smart_ptr<CSceneFactory> pvSceneFactory=NULL);

	//	---	関数の意味はCSceneと同じね
	//	enumを無理やりintにキャストするためにメンバ関数テンプレートを用いる＾＾；
	template <class T>
			void	JumpScene(T eScene){ JumpScene( (int)eScene ); }
	virtual void	JumpScene(int nScene){ m_nNextScene = nScene; m_nMessage=1; }

	template <class T>
			void	CallScene(T eScene){ CallScene( (int)eScene ); }
	virtual void	CallScene(int nScene){ m_nNextScene = nScene; m_nMessage=2; }

	template <class T>
			void	CallSceneFast(T eScene){ CallSceneFast( (int)eScene ); }
	virtual void	CallSceneFast(int nScene){ m_nNextScene = nScene; m_nMessage=3; }

	virtual void	ReturnScene(void){ m_nMessage=4; }
	virtual void	ExitScene(void){ m_nMessage=5; }

	template <class T>
			void	PushScene(T eScene){ PushScene( (int)eScene ); }
	virtual void	PushScene(int nScene);

	virtual LRESULT		OnDraw(CPlaneBase* lpPlane);
	//	↑を２フェーズに分解したのが↓
	virtual LRESULT		OnSimpleDraw(CPlaneBase* lpPlane);
	virtual LRESULT		OnSimpleMove(CPlaneBase* lpPlane);

	//	factoryを設定／取得できる。CScene派生クラス内から、
	//		CScene* m_p = GetSceneControl()->GetSceneFactory()->CreateScene(CSCENE1);
	//	のようにしてもうひとつのシーンを生成してそのなかで子シーンを呼び出すことも出来る。
	void SetSceneFactory(smart_ptr<CSceneFactory> pv) { m_pvSceneFactory = pv;}
	smart_ptr<CSceneFactory> GetSceneFactory() { return m_pvSceneFactory; }

	//	----- property

	//	スタックに呼び出し元シーンが無い状態でReturnSceneされるとこれがtrueになる
	virtual bool IsEnd(void);		//	終了したのか？

	//	いま実行しているシーンは、トランジションより優先するシーンか？
	virtual bool IsPrecedentScene(void);

	//	現在のシーンナンバーを返す
	virtual int GetSceneNo(void)	{ return m_vSceneFrame.m_nScene; }
	//	現在のシーンを返す
	virtual CScene* GetScene(void)	{ return m_vSceneFrame.m_lpScene; }

	//	シーン間のちょっとしたパラメータのやりとりに使うと良い。
	int*	GetSceneParam(void) { return& m_anSceneParam[0];}

protected:
	//	シーンのfactory
	smart_ptr<CSceneFactory> m_pvSceneFactory;

	virtual void	CreateScene(int nScene);	//	シーンの生成（内部的に使用）

	//	-----移動要求メッセージ
	int		m_nMessage;
	//	0:No Message 1:JumpScene 2:CallScene
	//	3:CallSceneFast 4:ReturnScene 5:ExitScene
	int			m_nNextScene;				//	次に移動すべきシーン

	class CSceneFrame {
	public:
		smart_ptr<CScene>	m_lpScene;		//	シーンのポインタ
		int					m_nScene;		//	あるいはCreateしなければならないシーン名

		CSceneFrame() {
			m_nScene = -1;	//	何もCreateしない。
		}
	};
	CSceneFrame	m_vSceneFrame;				//	現在のシーン
	stack<CSceneFrame>	m_SceneFrameStack;	//	呼び出し元シーンはここに記憶

private:
	//	シーン間のちょっとしたデータのやりとりに使う。（と便利＾＾）
	int		m_anSceneParam[16];
};

#endif
