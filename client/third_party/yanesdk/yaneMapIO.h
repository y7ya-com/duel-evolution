
#ifndef __yaneMapIO_h__
#define __yaneMapIO_h__

#include "yaneFile.h"

//////////////////////////////////////////////////////////////////////////////
// ゲーム用のマップの入出力関係

class TMapChip {
public:
	WORD	dwDownchip;		// 下にあるチップ
	WORD	dwMiddlechip;	// 真ん中にあるチップ
	WORD	dwUpperchip;	// 上にあるチップ
	WORD	dwHeight;		// 高さを持っている			(未使用)
	BYTE	hit;			// 接触判定(on or off)
	BYTE	nBankNo[4];		// 各チップのバンクナンバー(0-31) nBank[3]は未使用
};	//	Revolution

class TMapFileHeader {
public:
	DWORD	dwTitle;		// "TMA3"
	WORD	dwBankNo[32];	// バンクナンバー(0:no use) => 例)bank001.bmp
	WORD	dwMapX;			// X方向のチップ数
	WORD	dwMapY;			// Y方向のチップ数
	WORD	dwMapCX;		// X方向のマップチップサイズ
	WORD	dwMapCY;		// Y方向のマップチップサイズ
	WORD	dwFeature;		// 拡張情報の数(reserved)
};

class TMap { // ビットマップファイルとかでよくやる手法
public:
	TMapFileHeader	Header;
	TMapChip		Chip[1]; // これで配列を超えてアクセスできる
};

class CMapIO {	// マップ入出力
public:
	LRESULT	Write(LPSTR filename);	// そのまんま書き込み
	LRESULT	Read(LPSTR filename);	// そのまんま読み込み
	void	Create(int x,int y);	// サイズ(x,y)のマップを用意する

	TMap*	GetMap(void) { return m_lpTMap; }	// こいつを介してアクセスして！
	LRESULT	Resize(int x,int y);				// マップのResize
	LRESULT	Resize(int cx,int cy,int vx,int vy); // 複雑なResize

	CMapIO(void);
	virtual ~CMapIO();

protected:
	void	Release(void);
	CFile	m_file;				// マップを保持しておくためのファイル
	TMap*	m_lpTMap;			// マップファイルへのポインタ
	bool	m_bMyMap;			// 自分でnewしたマップかそれともCFileの保持しているものか？
};

#endif
