//	yaneVirtualKey.h :
//		Virtual Key Class for CKeyBase
//				programmed by yaneurao(M.Isozaki) '99/11/13
//

#ifndef __yaneVirtualKey_h__
#define __yaneVirtualKey_h__

#include "yaneKeyBase.h"

const int KEY_DEVICE_MAX= 16;	//	デバイスの登録可能最大数
const int VIRTUAL_KEY_MAX=88;	//	仮想キーの最大（88鍵:p）

class CVKeyBase {
public:
	CKeyBase*	m_lpKeyBase;
	int			m_key;
};
//	setのinsert,eraseには比較演算子の定義が必要（ダサ...）
//	bool	operator <(const CVKeyBase& x,const CVKeyBase& y);

typedef auto_vector_ptr<CVKeyBase> CVKeyList;

class CVirtualKey {
public:
	CVirtualKey(void);
	virtual ~CVirtualKey();

	//	キーデバイスの登録
	void	ClearKeyDevice(void);					//	デバイスのクリア
	void	AddDevice(CKeyBase*);					//	デバイスの追加
	void	RemoveDevice(CKeyBase*);				//	デバイスの削除
	CKeyBase* GetDevice(int n);						//	ｎ番目に登録したデバイスの取得
	void	Input(void);							//　登録しておいたデバイスから読みこみ

	//	仮想キーの追加・削除
	void	ClearKeyList(void);						//	仮想キーのリセット
	void	AddKey(int vkey,CKeyBase*,int key);		//	仮想キーの追加
	void	RemoveKey(int vkey,CKeyBase*,int key);	//	仮想キーの削除

	bool	IsVKeyPress(int vkey);					//	仮想キーを調べる
	bool	IsVKeyPush(int vkey);					//	仮想キーを調べる
	bool	IsVKeyRelease(int vkey);				//	[Konami] released this frame (name is ours)

	void	ResetKey(void);							//	今回のキー入力のクリア

protected:
	int			m_nDeviceMax;						//	登録デバイス数
	CKeyBase*	m_lpDevice[KEY_DEVICE_MAX];			//	入力キーデバイスリスト
	CVKeyList	m_VKey[VIRTUAL_KEY_MAX];			//	仮想キーリスト
	bool		m_bResetKey;						//	キーリセット中＾＾；（次回のInputまで）
};

#endif
