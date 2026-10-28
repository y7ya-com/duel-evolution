//
//	yaneRegion.h :
//
#ifndef __yaneRegion_h__
#define __yaneRegion_h__

/*
	Win95と98ではリージョン関係の処理が大きく変わっている！

	98ではウィンドウに割り当てたリージョンのコピーが作成されるので
	リージョンを::DeleteObjectしても大丈夫だが、95では作成されない。
	ヘルプにはただ単に、作成されないと書いてある。
*/

// CPlaneBase に対応 by れむ

class CPlaneBase;
class CRegion {
public:
	//	bmp読み込み後のCPlaneBase*を渡して、そのサーフェースに設定されている
	//	colorkey(ヌキ色)の部分を抜いたリージョンを作成。
	LRESULT Set(CPlaneBase* lpPlane);
	//	HRGN を直接指定してそのコピーを作成
	LRESULT Set(HRGN hRgn);

	//	bmpファイルを読み込んで、そのdwRGBの色を抜いたリージョンを作成。
	LRESULT	Load(const string szFileName,int r,int g,int b);
	//	bmpファイルを読み込んで、その(nPosX,nPosY)の座標の色を抜いたリージョンを作成。
	LRESULT	Load(const string szFileName,int nPosX=0,int nPosY=0);

	//	リージョン解放
	void	Release(void);

	//	空のリージョン作成
	LRESULT CreateEmptyRegion(void);

	//	現在リージョン取得
	HRGN	GetHRGN(void);

	CRegion(void);
	virtual ~CRegion();

	//	regionの加減
	CRegion& operator += (const CRegion& oSrc);
	CRegion& operator -= (const CRegion& oSrc);
	CRegion& operator = (const CRegion& oSrc);

protected:
	HRGN		m_hRgn;		//	リージョンハンドル
};

#endif
