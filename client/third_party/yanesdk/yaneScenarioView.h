//
//	ノベル系シナリオビュアー
//		（WAFFLE販売『蒼き大地』のために作った＾＾；）
//		かなりえげつないクラス＾＾；
//		programmed by yaneurao(M.Isozaki) '01/01/06-'01/02/10
//

#ifndef __yaneScenarioView_h__
#define __yaneScenarioView_h__

#include "yaneRootCounter.h"
#include "yaneFile.h"

class CBGMLoader;
class CSELoader;
class CPlaneBase;
class CPlaneLoaderBasePre;
class CTextDrawBase;
class CTextDrawContext;
class CVirtualKey;
class CMouseEx;
class CGUIButton;
class CSpriteChara;
class CScenarioIfListener;

class CScenarioDrawBackLogManager {
public:
	//	過去ログ管理構造体
	class	CLog {
	public:
		void SetStr(smart_array<WCHAR> sz) { m_szLog = sz; }	//	[Konami] wide
		void SetTextDrawContext(smart_ptr<CTextDrawContext> v) { m_vContext = v;}
		smart_ptr<CTextDrawContext> GetTextDrawContext() { return m_vContext; }

		virtual ~CLog(){}

	private:
		smart_array<WCHAR>				m_szLog;	//	[Konami] wide
		smart_ptr<CTextDrawContext>		m_vContext;
	};

public:
	//	コンストラクタ＆デストラクタ
	CScenarioDrawBackLogManager(void);
	// @yo2 0x00559300 vt
	virtual ~CScenarioDrawBackLogManager() {}	//	place holder

	//	バックログを取るのか？(default:true)
	// @yo2 0x005591a0 vt
	virtual void SetBackLogFlag(bool b) { m_bBackLogFlag = b; }
	//	バックログ表示中か(default:false)
	// @yo2 0x005591c0 vt
	virtual void SetBackLogMode(bool b) { m_bBackLogMode = b; }
	//	バックログの長さ(default:100)
	// @yo2 0x005591e0 vt
	virtual void SetBackLogLength(int n) { m_nBackLogLength = n; }

	//	--- property
	//	バックログを取るのか？
	// @yo2 0x00559200 vt
	virtual bool IsBackLogFlag(void) { return m_bBackLogFlag; }
	//	バックログの表示中か？
	// @yo2 0x00559220 vt
	virtual bool IsBackLogMode(void) { return m_bBackLogMode; }
	//	バックログの長さ
	// @yo2 0x00559240 vt
	virtual int	 GetBackLogLength(void) { return m_nBackLogLength; }
	//	全バックログの取得
	list<smart_ptr<CLog> >* GetLogList(void) { return& m_vBackLogList; }

	//	ログのリセット（ログをクリア）
	virtual void ResetLog(void);
	//	ログの巻き戻し(巻き戻すべきログが存在しなかったときは非0)
	virtual LRESULT GoBack(void);
	//	↑これで巻き戻され始める。
	//	バックログ表示を中止するにはSetBackLogMode(false);とすること
	//	※　過去ログ表示中に、SetLogは呼び出さないこと

	//-- 追加 '01/11/11	 by ENRA --
	//	今より新しいログを表示
	virtual LRESULT GoNext(void);
	// [out]
	//	次のログへ送った	 : 0
	//	ログ表示中ではない	 : 1
	//	一番新しいログに到達 : 2
	//-----------------------------

	virtual LRESULT GoBackTo(int nNum);
	//	任意の場所へ巻き戻す(nNum[>=1]個前へさかのぼる)

	//	現在表示中のバックログの取得
	// @yo2 0x00559260 vt
	virtual smart_ptr<CLog> GetLog(void) { return *m_itBackLogList; }

	//	<HR>までの記録をとる。表示文字の無い段落は渡さないように。
	//	もしlpContextNextが設定されていれば、<HR>までではなく、そこまでのログを取る
	virtual LRESULT SetLog(CTextDrawContext* lpContextNow,CTextDrawContext* lpContextNext=NULL);

private:
	//	過去ログ
	list<smart_ptr<CLog> >	m_vBackLogList; //	バックログリスト
	list<smart_ptr<CLog> >::iterator	m_itBackLogList;	//	バックログリスト
	bool		m_bBackLogFlag;		//	バックログを取るのか？
	bool		m_bBackLogMode;		//	現在、バックログ表示モードなのか？
	int			m_nBackLogLength;	//	バックログの長さ
};

//////////////////////////////////////////////////////////////////////////////
//	シナリオ用のリスナ(callback用/strategyパターン)

class CScenarioEffect {
public:
	//	描画時コールバック
	virtual void OnSimpleDraw(CPlaneBase*,int nPhase){}
	virtual void OnSimpleMove(CPlaneBase*,int nPhase){}
	virtual void OnDraw(CPlaneBase*lp,int nPhase){
		OnSimpleDraw(lp,nPhase);
		OnSimpleMove(lp,nPhase);
	}

	//	仮プレーン受け渡し用コールバック
	virtual void OnDrawBGSurface(CPlaneBase* lp){}
	virtual ~CScenarioEffect(){}
};

//	シナリオエフェクト用のfactory基底クラス
class CScenarioEffectFactory {
public:
	virtual CScenarioEffect* CreateInstance(int nNo) = 0;
	virtual ~CScenarioEffectFactory() {}
};

//	BG,立ちキャラを設定したときのリスナ
class	CScenarioDrawTransListener {
public:
	virtual void OnSetBGCG(int& nEffectNo,CRootCounter& nCount,int& nBGNo){}
	virtual void OnSetStandCharaIn(int& nEffectNo,CRootCounter& nCount,int& nSCNo,int &nPos){}
	virtual void OnSetStandCharaOut(int& nEffectNo,CRootCounter& nCount,int& nSCNo,int &nPos){}
	//	ユーザーが見たCGを取得するのに使っても良いし、
	//	特定のトランジション効果のスピード変更にも使える
	//	（参照渡しで変数をもらっているので）
};

//////////////////////////////////////////////////////////////////////////////

class CScenarioDraw {
public:
	//	使用法　STEP1.以下のものをまず最初に設定すること
	//	（使用するものについては必ず設定すること）
	/////////////////////////////////////////////////////////////////////
	//	母体となるテキスト描画
	void	SetTextDraw(smart_ptr<CTextDrawBase> v) { m_vTextDraw = v; }
	//	BGM Loader
	void	SetBGMLoader(smart_ptr<CBGMLoader> v) { m_vBGMLoader = v; }
	//	SE	Loader
	void	SetSELoader(smart_ptr<CSELoader> v) { m_vSELoader = v; }
	//	Voice Loader
	void	SetVoiceLoader(smart_ptr<CBGMLoader> v) { m_vVoiceLoader = v; }
	//	MouseEx
	void	SetMouse(smart_ptr<CMouseEx> v) { m_vMouse = v; }
	//	CVirtualKey(eg.CKey..)
	void	SetKey(smart_ptr<CVirtualKey> v)	{ m_vKey = v; }

	//	以下の２つは、CPlaneLoaderかCDIB32LoaderかCFastPlaneLoaderを渡すこと
	//	つまり、
	//		scn.SetBGLoader(smart_ptr<CPlaneLoaderBasePre)(new CDIB32Loader,true));
	//	のように設定する
	//	BG	Loader
	void	SetBGLoader(smart_ptr<CPlaneLoaderBasePre> v) { m_vBGLoader = v; }
	//	SC	Loader	//	立ちキャラ
	void	SetSCLoader(smart_ptr<CPlaneLoaderBasePre> v) { m_vSCLoader = v; }
	//	Face Loader //	顔マーク
	void	SetFaceLoader(smart_ptr<CPlaneLoaderBasePre> v) { m_vFaceLoader = v; }
	//	Name Loader //	名前プレート
	void	SetNameLoader(smart_ptr<CPlaneLoaderBasePre> v) { m_vNameLoader = v; }
	//	ボタンのローダー
	void	SetButtonLoader(smart_ptr<CPlaneLoaderBasePre> v) { m_vButtonLoader = v; }
	//	過去ログ(これは設定しなくとも、ディフォルトでCScenarioDrawBackLogManager)
	void	SetBackLog(smart_ptr<CScenarioDrawBackLogManager> v) { m_vBackLog = v; }
	//	画面エフェクトを使うならばこれを設定する
	void	SetScenarioEffectFactory(smart_ptr<CScenarioEffectFactory> v) { m_vScenarioEffectFactory = v; }

	//	外字登録するのならば、これを設定する
	//	⇒実装において、CTextDrawに委譲しているので、先にSetTextDrawしておく必要がある。
	void	SetGaiji(smart_ptr<CSpriteChara> v);
	smart_ptr<CSpriteChara> GetGaiji();

	//	置換文字列の設定
	//	⇒実装において、CTextDrawに委譲しているので、先にSetTextDrawしておく必要がある。
	void	SetRepString(smart_ptr<vector<string> > v);
	smart_ptr<vector<string> > GetRepString();


	/////////////////////////////////////////////////////////////////////

	//	使用法　STEP2.設定ファイル名。これに基づいて各種設定を行なう
	//	簡単な画面レイアウトもこれで設定する
	virtual LRESULT SetConfigFile(string filename);
	//	（STEP3.を経てからも、再度この関数で、
	//		別の設定ファイルを読み込ませることも可能）

	//	property
	smart_ptr<CTextDrawBase> GetTextDraw(void)	{ return m_vTextDraw; }
	smart_ptr<CBGMLoader>	 GetBGMLoader(void) { return m_vBGMLoader; }
	smart_ptr<CSELoader>	 GetSELoader(void)	{ return m_vSELoader; }
	smart_ptr<CBGMLoader>	 GetVoiceLoader(void)	{ return m_vVoiceLoader; }
	smart_ptr<CTextDrawContext> GetTextDrawContext(void) { return m_vTextDrawContext; }
	smart_ptr<CMouseEx>			GetMouse(void)		{ return m_vMouse; }
	smart_ptr<CVirtualKey>		GetKey(void)		{ return m_vKey; }
	smart_ptr<CFile>			GetFile(void)		{ return m_vFile; }
	smart_ptr<CPlaneLoaderBasePre> GetBGLoader(void)	{ return m_vBGLoader; }
	smart_ptr<CPlaneLoaderBasePre> GetSCLoader(void)	{ return m_vSCLoader; }
	smart_ptr<CPlaneLoaderBasePre> GetFaceLoader(void)	{ return m_vFaceLoader; }
	smart_ptr<CPlaneLoaderBasePre> GetNameLoader(void)	{ return m_vNameLoader; }
	smart_ptr<CPlaneLoaderBasePre> GetButtonLoader(void){ return m_vButtonLoader; }
	smart_ptr<CScenarioDrawBackLogManager>	GetBackLog(void) { return m_vBackLog; }
	//	一応ボタンも得られる。こいつのListenerを差し替えることも出来る＾＾；
	smart_ptr<CGUIButton>	GetButtonX() { return m_vButtonX;}		//	削除ボタン
	smart_ptr<CGUIButton>	GetButtonB() { return m_vButtonBack; }	//	戻りボタン
	smart_ptr<CGUIButton>	GetButtonP() { return m_vButtonPrev; }	//	早送りボタン

	//	エフェクト用のfactoryを渡す
	smart_ptr<CScenarioEffectFactory> GetScenarioEffectFactory() { return m_vScenarioEffectFactory; }
	//	オプションフラグを取得する
	int*	GetOption() { return& m_anOption[0]; }

	//	<if n> ～ <endif>用の条件判定Listenerを渡す
	smart_ptr<CScenarioIfListener> GetScenarioIfListener();
	void	SetScenarioIfListener(smart_ptr<CScenarioIfListener> v);

	//	ＢＧ，立ちキャラ出現時の指定を奪うためのListenerを渡す
	smart_ptr<CScenarioDrawTransListener> GetTransListener(){ return m_vTransListener;}
	void SetTransListener(smart_ptr<CScenarioDrawTransListener> pv) { m_vTransListener = pv; }


	//	------	set parameters..
	//	メッセージスピードの設定(1フレームに新たに表示される文字数)
	//	⇒　マイナスの値ならば、その絶対値のフレーム数で１文字表示される
	// @yo2 0x0055a100 vt
	virtual void	SetMessageSpeed(int n) { m_nTextPhase.SetStep(n); }
	//	ディフォルト:1

	//	メッセージ表示座標
	// @yo2 0x0055a130 vt
	virtual void	SetMessageXY(int x,int y) { m_nTextX = x; m_nTextY = y; }

	//	使用法　STEP3.htmlファイルを実際に読み込む
	virtual LRESULT Open(string filename);

	//	実描画処理
	// @yo2 0x0055a160 vt
	virtual LRESULT OnDraw(CPlaneBase* lpPlane){	//	ここに描画
		LRESULT lr;
		lr = OnSimpleDraw(lpPlane);
		lr |= OnSimpleMove(lpPlane);
		return lr;
	}
	//	↑を２フェーズに分解
	virtual LRESULT OnSimpleMove(CPlaneBase* lpPlane);
	virtual LRESULT OnSimpleDraw(CPlaneBase* lpPlane);

	//	実描画処理２（表示できなかったネームプレート等をテキストで表現する）
	virtual LRESULT OnDrawText(HDC hdc);			//	ここに描画

	//	次の段落に読み進む
	virtual LRESULT GoNext(void);

	//	--- 過去ログの表示用
	//	CTextDrawContextで与えられた過去ログを表示する
	virtual LRESULT GoBack(CTextDrawContext*lp);
	//	nNum[>=1]個前のログを表示する
	virtual LRESULT GoBackTo(int nNum);

	//	キー入力を行ない、メッセージを読み進める
	//	この関数を使うためには、SetMouse,SetKeyで正しく
	//	入力デバイスを設定しておくこと。
	//		返し値　０：正常終了
	//				１：テキストが終端まで達した
	virtual LRESULT Input(void);
	//	また、Mouseのボタンを正常にフックするためにOnDrawのあとに行なうこと。

	//	メッセージをスキップボタンを許可する(早送りボタンが無ければ無意味) default:true
	virtual void	SetSkipFast(bool b);
	//	↑一度設定したら、再度設定するまで有効

	//	メッセージの早送りを開始する
	virtual void	SkipFast(bool bEnable);
	// @yo2 0x0055a1a0 vt
	virtual bool IsSkipFastNow() { return m_bSkipFastNow; } // 現在高速スキップ中か？

	//	メッセージウィンドゥの表示／非表示を切り替える
	void	SetMesVisible(bool b) { m_bMesVisible = b;}
	bool	IsMesVisible() { return m_bMesVisible; }

	//	メッセージウィンドゥの表示／非表示を切り替える
	//	（ただし、メッセージは進む）
	void	SetMesVisible2(bool b) { m_bMesVisible2 = b;}
	bool	IsMesVisible2() { return m_bMesVisible2; }

	//	PlaneLoaderで保持している全イメージの強制解放と再生されていないSE/BGMの解放
	void	ReleaseCacheAll(void);

	//	エフェクターの解放
	void	ResetEffect();

	//	開始ラベルと終了ラベルの設定
	//	(これが設定されていると、htmlファイルのOpenのあと自動的にその場所まで飛びます)
	void		SetStartLabel(string szLabel) { m_szStartLabel = szLabel; }
	void		SetEndLabel(string szLabel)	  { m_szEndLabel   = szLabel; }
	//	指定ラベルまでskip
	LRESULT		SkipToLabel(string szLabel);
	//	現在位置の取得と設定(ゲームの途中Load/Save用)
	int			GetReadPosition();
	LRESULT		SetReadPosition(int nPos);
	//	(これが設定されていると、htmlファイルのOpenのあと自動的にその場所まで飛びます)
	void		SetStartReadPosition(int nPos)		{ m_nStartPos = nPos; }
	void		SetEndReadPosition(int nPos)		{ m_nEndPos	  = nPos; }

	// @yo2 0x0055a1c0 vt
	virtual int GetSCNo(int n){ return m_nSCCG[n];}// 現在表示中の立ち絵
	// @yo2 0x0055a1e0 vt
	virtual int GetBGNo(void) { return m_nBGCG;	 } // -1なら非セレクト
	virtual int GetRealBGNo(void);				   // いま描画している本当のBG
	// @yo2 0x0055a200 vt
	virtual int GetBGMNo(void){ return m_nBGMNo; } // -1なら非セレクト
	// @yo2 0x0055a220 vt
	virtual bool GetBGMLoop(void){ return m_bBGMLoop;}

	//	途中ロード＆セーブ対策
	void		GetGameContext(int*);		// 256*4バイトデータ
	void		SetGameContext(int*);
	void		SetStartGameContext(int *); //	これが設定されていればopen後に読み込まれる

	//	--- <Select n>タグの選択された番号の取得
	int*		GetSelectedNo() { return &m_nSelectedNo; }
	//	↑これが-1以外ならば、選択されたということ。(その番号)
	//	取得して、すかさず-1に戻すべし
	bool		IsSelected() { return m_bSelect; }
	//	↑現在、選択肢を選択中であるか？

	CScenarioDraw(void);
	// @yo2 0x0055a2a0 vt
	virtual ~CScenarioDraw(){}		// merely place holder..

	friend class mediator<CScenarioDraw>;	//	for call-back

protected:
  //	必要ならば、これらをオーバーライドする

	//	BGの描画用
	//--- 追加 '02/01/16  by ENRA ---
	virtual void OnMoveBG(CPlaneBase*lpDraw);	// for Transition Control
	//-------------------------------
	virtual void OnDrawBG(CPlaneBase*lpDraw);
	virtual void OnDrawBG(HDC hdc);

	//	立ちキャラの描画用
	//--- 追加 '02/01/16  by ENRA ---
	virtual void OnMoveSCChara(CPlaneBase*lpDraw);	// for Transition Control
	//-------------------------------
	virtual void OnDrawSCChara(CPlaneBase*lpDraw);
	virtual void OnDrawSCChara(HDC hdc);

	smart_ptr<CTextDrawBase>		m_vTextDraw;
	smart_ptr<CTextDrawContext>		m_vTextDrawContext;		//	読み込んでいるhtmlのコンテクスト
	smart_ptr<CBGMLoader>			m_vBGMLoader;
	smart_ptr<CSELoader>			m_vSELoader;
	smart_ptr<CBGMLoader>			m_vVoiceLoader;

	smart_ptr<CMouseEx>				m_vMouse;
	smart_ptr<CVirtualKey>			m_vKey;

	smart_ptr<CPlaneLoaderBasePre>	m_vBGLoader;			//	ＢＧサーフェース読み込み用
	smart_ptr<CPlaneLoaderBasePre>	m_vSCLoader;			//	立ちキャラ読み込み用
	smart_ptr<CPlaneLoaderBasePre>	m_vFaceLoader;			//	顔マーク
	smart_ptr<CPlaneLoaderBasePre>	m_vNameLoader;			//	ネームプレート
	smart_ptr<CPlaneLoaderBasePre>	m_vButtonLoader;		//	ボタンのloader
	smart_ptr<CFile>				m_vFile;				//	htmlファイル
	smart_ptr<CScenarioDrawBackLogManager>	m_vBackLog; //	過去ログマネージャ

	//	ボタン関連のインターフェース
	smart_ptr<CGUIButton>			m_vButtonX;				//	削除ボタン
	smart_ptr<CGUIButton>			m_vButtonBack;			//	戻りボタン
	smart_ptr<CGUIButton>			m_vButtonPrev;			//	早送りボタン

	//	mes_partsで設定されたものの描画
	virtual LRESULT OnDrawMesBox(CPlaneBase*lp);

	//	プライベートメンバの初期化
	virtual void	Reset(void);
	//	画面描画＆特殊タグの解析
	virtual LRESULT UpdateText(void);

	//	トランジションの終了チェック
	virtual bool IsEndTransition(); //	トランジションは終了したか？

	//	古くなったイメージの自動解放
	void	ReleaseOldCache();

private:
	//	parameters..

	//	メッセージスピード
	CRootCounter	m_nTextPhase;	//	テキスト描画フェイズ(メッセージスピードは、このstepで決まる)
	int		m_nTextX,m_nTextY;		//	テキスト描画位置

	//	フェイスマーク表示台＋テキストボックス
	smart_vector_ptr<CPlaneBase>		m_alpTalkBox;
	vector<int> m_anTalkBoxX;
	vector<int> m_anTalkBoxY;

	//	セレクトしているＢＧナンバー
	int		m_nBGCG;				//	-1なら非セレクト
	CRootCounter m_nBGCount;
	int			 m_nBGBltType;
	int		m_nBGCGOld;				//	ひとつ前にセレクトされていたCG

	//	ネームプレートナンバー
	int		m_nNamePlate;			//	-1なら非セレクト
	int		m_nNamePlateX;
	int		m_nNamePlateY;

	//	フェイスマーク
	int		m_nFaceMark;			//	-1なら非セレクト
	int		m_nFaceMarkX;
	int		m_nFaceMarkY;
	bool	m_bFaceMark;			//	フェイスマークタグは有効なのか？

	//	立ちキャラ
	int		m_nSCCG[3];				//	-1なら非セレクト
	CRootCounter m_nSCCount[3];
	int			 m_nSCBltType[3];

	//	自動再生パラメータ
	int			m_nAutoPlay;		//	自動再生するのかフラグ(non zero == 再生フレーム数)
	int			m_nAutoPlayCount;	//	↑のためのカウンタ

	//	メッセージウィンドウは表示中か？
	bool		m_bMesVisible;		//	default : true
	bool		m_bMesVisible2;		//	default : true
	//	⇒　ただし、画面に出ないだけで表示は行なう

	//	メッセージの早送りの出来るセクションか？
	bool		m_bSkipFast;		//	default : true
	bool		m_bSkipFastNow;		//	現在高速スキップ中であるか

	//	メッセージのプロンプトの表示
	bool		m_bMesNext;			//	default : false
	int			m_nMesNextX;		//	表示座標
	int			m_nMesNextY;
	CRootCounter m_nMesNextCount;	//	表示はプロンプトなので点滅
	bool		m_bWaitInput;		//	メッセージ待ち

	bool		m_bWaitTransition;	//	シーンは終わったけどトランジション待ち？

	bool		m_bGoNext;			//	その段落の文字はすべて表示したか？

	//	古くなったイメージの解放のためのカウンタ
	int			m_nOldImageCount;

	//	開始ラベルと終了ラベル
	string		m_szStartLabel;
	string		m_szEndLabel;
	int			m_nStartPos;
	int			m_nEndPos;
	int*		m_alpStartGameContext;

	//	コンテクスト保存のために...
	int			m_nBGMNo;		//	再生しているBGMナンバー
	bool		m_bBGMLoop;		//	BGMはループ中なのか？
	void		BGMPlay(int nNo,bool bLoop);

	vector<smart_ptr<CScenarioEffect> > m_vScenarioEffect;
	smart_ptr<CScenarioEffectFactory> m_vScenarioEffectFactory;
	smart_ptr<CScenarioDrawTransListener> m_vTransListener;

	//	エフェクト用の構造体
	class CEffectParam {
	public:
		int				m_nEffectNo;	//	Effect No.
		CRootCounterS	m_nCount;		//	Phaseカウンタ
		bool			m_bEnable;		//	使用するんか？
		int				m_nBG;			//	BGSurfaceとしてOnDrawBGSurfaceを呼び出したのならば、それを保存

		CEffectParam() {
			m_bEnable = false;
			m_nBG	  = -1;
		}
	};

	//	最大８エフェクトまで同時
	enum { EFFECT_MAX = 8 };	// enum hack
	//	⇒ GetGameContext/SetGameContextで、これを保存するので
	//	そのとき保存するワークのサイズが変わるので注意すること！
	
	CEffectParam		m_vAfterEffect[EFFECT_MAX*2];
	//	0		  ～EFFECT_MAX	-1 : BGのあとのコールバック
	//	EFFECT_MAX～EFFECT_MAX*2-1 : SCのあとのコールバック

	void	OnDrawCallBack(CPlaneBase* lpPlane,CEffectParam* lpEffect,int nEffectOffset);
	//--- 追加 '02/01/16  by ENRA ---
	void	OnMoveCallBack(CPlaneBase* lpPlane,CEffectParam* lpEffect,int nEffectOffset);	// for Effect Control
	//-------------------------------

	//	option
	int		m_anOption[16]; //	オプション

	//	key repeat
	//	キーリピートのためには、最初のストロークだけ、やや長目に入力されなくてはならない。
	bool	m_bKeyRepeat;

	// 選択フェイズへ
	void	OnSelectMes(CPlaneBase* );

	//	選択タグ(<Select n>～</Select n>)が混じっているならば、
	//	メッセージ描画後、選択画面にする
	bool	m_bSelect;
	int		m_nSelect;		//	現在選択中の場所
	int		m_nSelectedNo;	//	選択された場所
};

#endif
