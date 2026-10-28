// yaneMapLayer.h
//
//		programmed by yaneurao(M.Isozaki)	'99/08/09	for	盗撮マニア (WAFFLE制作・販売)
//		reprogrammed by yaneurao(M.Isozaki) '00/07/20	for Revolution (WAFFLE制作・販売)
//

#ifndef __yaneMapLayer_h__
#define __yaneMapLayer_h__

/*
　※　マップチップ番号について
	バンクを表すビットマップの左上のマップチップ番号が0。
	その一つ右（チップサイズ分だけ右）が1。
	さらに一つ右が２。さらに、右端まで１ずつ増える。

	そして、左上のチップの一つ下のマップチップ番号256。
	さらに、一つ下が512。以下、256ずつ増える。

	その部分のマップチップが存在しない場合、-1。

	マップバンクは、一つのマップに対して、相対バンク（ＲＢａｎｋ）を３２まで指定出来る。

	マップチップは、上・中・下の３つのレイヤで構成される。
	ひとつのチップは、上チップ・中チップ・下チップで構成される。
	１つのチップは、マップチップ番号と、相対バンクナンバーから成る。

	詳しくは、yaneMapIOのTMapFileHeaderとTMapChipを見てね。

*/

#include "yanePlaneBase.h"
#include "yaneSpriteChara.h"
#include "yaneMapIO.h"

////////////////////////////////////////////////////////////////////////////////////

//	マップチップクラス
class CMapChip {
public:
	WORD		chip[4];		//	下・中・上のチップ／一つは予備
	CPlaneBase* plane[3];		//	各チップの転送元プレーン
	DWORD		hit;			//	床判定

	CMapChip(void)	{
		ZERO(chip); ZERO(plane);	//	これ変更したければ変更するとええのだ
		hit = 0;
	}
};

////////////////////////////////////////////////////////////////////////////////////

const int MAPCHARA_MAX=256;		//	各レイヤの最大キャラ数
const int MAPLAYER_MAX=12;		//	レイヤの最大数

////////////////////////////////////////////////////////////////////////////////////

class CMapLayer {
public:

	LRESULT	Load(LPSTR szFileName);	//	マップの読み込み
	void	Release(void);			//	マップの解放

	//	マップキャラのリセット（CMapCharaへの登録とOnDrawに先行して呼び出してね）
	void	ResetMapChara(void);
	//	マップキャラの登録
	void	RegistMapChara(SSprite&chara,int layer){
		m_MapChara[layer][m_nMapChara[layer]++] = chara;
	}
	//	先頭を取得（マップキャプチャー用）
	SSprite*	GetMapChara(void) { return &m_MapChara[0][0]; }
	//	デバッグ用クリア矩形
	void	SetClearRect(RECT&rc) { m_rcClear = rc; }

	virtual void	OnDraw(CPlaneBase*);	//	実描画
	virtual void	OnDraw2(CPlaneBase*);	//	こちらは画面クリッピング無し
	void	SetPos(int x,int y);		//	表示エリア左上の来るべき仮想スクリーン座標
	void	GetPos(int&x,int&y);		//	↑の取得
	void	SetView(LPRECT lpRect);		//	描画エリア
	LPRECT	GetView(void);				//	↑の取得

	//////////////////////////////////////////////////////////////////////

	void	SetMapSize(int x,int y);		//	マップ全体のサイズ設定
	void	GetMapSize(int &x,int &y);		//	マップ全体のサイズ取得
	void	SetMapChipSize(int x,int y);	//	マップチップのサイズ設定
	void	GetMapArea(int &x,int &y);		//	各軸方向のマップチップ×配置チップ数で仮想画面サイズを得る
	CMapChip*GetMapChip(int x,int y);		//	マップチップへのポインタを得る
	void	ResizeMap(int x,int y);			//	出来る限り、いまのマップを温存してサイズ変更。

	//////////////////////////////////////////////////////////////////////
	//	床判定

	bool	IsWall(int x,int y);			//	(x,y)は床か？
	DWORD*	GetWall(int x,int y);			//	(x,y)の床情報へのポインタを直接得る
	void	InvalidateWall(bool b);			//	すべての壁を無効にする（デバッグ用）

	//////////////////////////////////////////////////////////////////////
	//	スプライト描画にも対応

	//	通常描画
	void	Blt(CSprite*lpSprite){int x,y;lpSprite->GetPos(x,y);Blt(lpSprite,x,y);}
	//	(x,y)に描画
	void	Blt(CSprite*lpSprite,int x,int y){ BltFix(lpSprite,x,y); lpSprite->IncMotion(); }
	//	通常描画(モーション進めず)
	void	BltFix(CSprite*lpSprite){int x,y;lpSprite->GetPos(x,y);BltFix(lpSprite,x,y);}
	//	(x,y)に描画(モーション進めず)
	void	BltFix(CSprite*lpSprite,int x,int y);
	//	ケツになっていたら、それ以上は加算しない
	void	BltOnce(CSprite*lpSprite,int x,int y);

	
	CMapLayer(void);
	virtual ~CMapLayer();

protected:
	//	マップに表示するキャラクター
	SSprite		m_MapChara[MAPLAYER_MAX][MAPCHARA_MAX];
	int			m_nMapChara[MAPLAYER_MAX];
	int			m_nMapChara2[MAPLAYER_MAX];	//	カウンタ

	int		m_nMapX,m_nMapY;		// マップ全体のサイズ
	int		m_nMapCX,m_nMapCY;		// マップチップの大きさ
	auto_array<CMapChip> m_MapData;	// マップデータ(サイズ分だけ。すなわちm_MapX×m_MapYだけ)
	CPlaneBase*	m_MapPlane[32];			// マップを表すバンク

	// ４段階に分けて、下・中・上レイヤを表示する
	void	OnPaint0(CPlaneBase*);		//	クリッピングルーチン
	void	OnPaint1(CPlaneBase*);		//	下
	void	OnPaint2(CPlaneBase*);		//	中
	void	OnPaint3(CPlaneBase*);		//	上
	//	数字指定でのレイヤ描画
	void	OnPaintLayer(CPlaneBase*,int nStartLayer,int nEndLayer=-1);
	//	立ち位置で整順する
	void	OnSortLayer(int nStartLayer,int nEndLayer=-1);

	//	表示ポジション
	int		m_nX,m_nY;

	//	画面の表示矩形
	RECT	m_rcDraw;

	//	壁の無効化フラグ
	bool	m_bInvalid;

	//	クリア矩形（デバッグ用）
	RECT	m_rcClear;
};

#endif
