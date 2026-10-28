//
//	CSceneTransiter
//

#ifndef __yaneSceneTransiter_h__
#define __yaneSceneTransiter_h__

#include "yanePlaneBase.h"
#include "yaneScene.h"
#include "yaneRootCounter.h"

//	シーン間のトランジションを円滑に行なうためのプレーンの貯蔵庫＾＾；
//	次のシーンにプレーンを渡したいときなどに使うと便利
//	トランジション機能搭載＾＾
class CSceneTransiter {
public:
	//	そのプレーンをPlaneにバックアップする
	void	Backup(CPlaneBase*lp,int nPlaneNo=1);

	//	シーンコントローラーを設定
	void	SetSceneControl(smart_ptr<CSceneControl> v) { m_vSceneControl=v;}

	//	プレーンの設定／取得
	void	SetPlane(smart_ptr<CPlaneBase> v,int nPlaneNo) { m_vPlane[nPlaneNo] = v; }
	smart_ptr<CPlaneBase> GetPlane(int nPlaneNo) { return m_vPlane[nPlaneNo]; }
	//	バックアップしといたやつは↑で取り出せる。
	//	前のシーンでBackupでバックアップしたプレーンは、
	//	これでsmart_ptrに移して使うと良い。

	//	こいつの所有権だけ破棄
	void	ReleasePlane(int nPlaneNo) { m_vPlane[nPlaneNo].Delete(); }

	//	トランジションの設定
	void	BeginTransit(int nTransType,int nSpeed=16,int nStartPhase=0,int nEndPhase=256);
	//	トランジション中か？
	bool	IsEndTransit(void) const { return m_bTransition; }
	/*
		トランジションの方法
			１．現在のシーンをBackup(GetDraw());でプレーン１にコピーして、
			２．BeginTransitでコピー開始。
			３．次のシーンにJumpSceneすれば、
				最初のOnDrawの結果がプレーン２にコピーされて自動的に
				トランジションが開始される。
	*/

	//	トランジションを抑止する
	void	StopTransit() { m_bStop = true; }
	void	RestartTransit() { m_bStop = false; }

	LRESULT OnDraw(CPlaneBase* lp);
	//	↑をふたつに分離したやつ↓
	LRESULT OnSimpleDraw(CPlaneBase* lp);
	LRESULT OnSimpleMove(CPlaneBase* lp);

	//	---- 
	CSceneTransiter();
	virtual ~CSceneTransiter(){}

protected:
	smart_ptr<CPlaneBase>	m_vPlane[4];
	//	保持しているプレーン
	//	0:次のシーンに渡すための一時的なプレーン
	//	1:トランジションのためのプレーン１（前シーン）
	//	2:トランジションのためのプレーン２（次シーン）
	//	3:予備のプレーン（終了シーン等のため）

	bool			m_bTransition;		//	トランジション中か？
	bool			m_bSnapNextScene;	//	トランジションのために次のシーンをスナップする
	CRootCounter	m_nTransCount;		//	トランジションカウンタ
	int				m_nTransType;		//	トランジションのタイプ
	smart_ptr<CSceneControl> m_vSceneControl; // トランジション用のシーンコントロール
	bool			m_bStop;			//	トランジションの抑止中か？
};

#endif
