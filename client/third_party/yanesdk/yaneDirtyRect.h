//
//	Dirty Rect (更新矩形)　管理クラス
//
//		programmed and designed by yaneurao '02/01/16

#ifndef __yaneDirtyRect_h__
#define __yaneDirtyRect_h__

/*
	使いかた。
		Clearでクリア。
		AddRectなんとかで、矩形を加算していく
		（描画ごとに幾度となく繰り返す）
		そのとき、このクラスの内部で、最大更新矩形(dirty rect)と
		なるように結合されていく。ただし、画面左上の少しと
		右下の少しを更新しただけなのに画面全体が最大更新矩形(dirty rect)
		として選択されてしまうのはまずいので、そのようなケースにそなえて
		最大5つのdirty rectを持っても良いことにする。

		最後、Refreshを呼び出すことにより、重複する（あるいは完全に含まれる）dirty rectを
		消去する。

		そして、GetRectNum,GetRectで、dirty rectの数と矩形が
		取得できる。


		SubRectなんとかで、矩形を減算できる
		この結果は、AddRectと違い、Refreshするまで反映されないことに注意する。
*/

class CDirtyRect {
public:

	//	すべてをクリアする
	void	Clear(){ 
		m_nRectLast = 0;
		m_vSubRect.clear();
	}

	//  配列をリサイズする
	void    Resize(int size){
		m_arcRect.resize(size+1);
		m_anRectArea.resize(size+1);
		m_nRectSize = size;
	}

	//	リフレッシュする
	void	Refresh();

	//	矩形の加算
		//	範囲指定タイプ
	void	AddRect(int left,int top,int right,int bottom, int nSize=nRectSize);
		//	座標＋大きさ指定タイプ
	void	AddRectSize(int x,int y,int sx,int sy, int nSize=nRectSize){ AddRect(x,y,x+sx,y+sy,nSize); }
		//	矩形で加算
	void	AddRect(const RECT& rc, int nSize=nRectSize){ AddRect(rc.left,rc.top,rc.right,rc.bottom,nSize); }

	//	矩形の減算
		//	範囲指定タイプ
	void	SubRect(int left,int top,int right,int bottom);
		//	座標＋大きさ指定タイプ
	void	SubRectSize(int x,int y,int sx,int sy){ SubRect(x,y,x+sx,y+sy); }
		//	矩形で加算
	void	SubRect(const RECT& rc){ SubRect(rc.left,rc.top,rc.right,rc.bottom); }

	//	--- property

	//	結果の取得
		//	生成された矩形合計数(0:なし)
	int		GetRectNum() { return m_nRectLast; }
		//	生成された矩形へのポインタを取得
	RECT*	GetRect() { return &m_arcRect[0]; }

	//	-----

	CDirtyRect() { Resize(nRectSize); Clear(); }
	// @yo2 0x00450100 vt
	virtual ~CDirtyRect(){};

protected:
	enum	{ nRectSize = 5 };
	//	この数だけ矩形を確保
	//	まあ、あまり細かくとると、ガーベジの効率が落ちるので
	//	5個ぐらいにしておく。

	//RECT	m_arcRect[nRectSize+1];	   //	矩形情報
	//int	m_anRectArea[nRectSize+1]; //   矩形面積
	smart_array<RECT>	m_arcRect;	   //	矩形情報
	smart_array<int>	m_anRectArea;  //   矩形面積
	int		m_nRectLast;	//	↑をいくつまで使っているかのカウンタ
							//	初期状態==0 : 未使用
	int     m_nRectSize;	//  ↑のサイズ

	//  減算するために必要
	smart_vector_ptr<RECT> m_vSubRect;
};

#endif