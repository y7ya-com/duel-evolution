//
// yaneGameObjectBase.h :
//

#ifndef __yaneGameObjectBase_h__
#define __yaneGameObjectBase_h__

class CGameObjectBase {
public:
	/////////////////////////////////////////////
	//	操作子
	
	// @yo2 0x00530bd0 vt
	virtual void OnPreDraw(void) {}
	// @yo2 0x00530bf0 vt
	virtual	void OnDraw(void) {}
	// @yo2 0x00530c10 vt
	virtual void OnMove(void) {}
	virtual void Kill(void);
	bool IsValid(void) { return m_bValid; }

	/////////////////////////////////////////////
	//	まあ、ゲームオブジェクトとして、いるやろ的なメンバ関数

	void	SetPos(int x,int y);	//	位置の設定
	void	GetPos(int&x,int&y);	//	位置の取得

	void	SetID(int nID) { m_nID = nID; }
	int		GetID(void) { return m_nID; }

	/////////////////////////////////////////////
	//	property...
	
	//	解放レベル L1ならば1。
	//	ReleaseAllでL1を解放したときL0,L1は解放されるがL2以上は解放されない
	virtual int GetReleaseLevel(void); // ディフォルトで0

	/////////////////////////////////////////////
	//	全インスタンスに関わる操作

	static void OnPreDrawAll(void);	//	OnPreDraw
	static void OnDrawAll(void);	//	OnDraw
	static void OnMoveAll(void);	//	OnMove

	static void	KillAll(int nReleaseLevel); // このレベル以下のものをKillする
	static void Garbage(void);		//	!IsValid()なクラスを消す
	static set<CGameObjectBase*>* GetList(void) { return &m_GameObjectList;}

	/////////////////////////////////////////////

	CGameObjectBase(void);
	virtual ~CGameObjectBase();	//	当然virtual..

protected:
	//	static members..
	static set<CGameObjectBase*> m_GameObjectList;

	//	管理用
	bool	m_bValid;	//	有効なんか？(これがFalseならばガーベジされる)

	//	GameObjectとして、いるやろ、的なクラス
	int		m_nX;		//	キャラクターの座標
	int		m_nY;
	int		m_nID;		//	キャラクターのＩＤ
};

#endif
