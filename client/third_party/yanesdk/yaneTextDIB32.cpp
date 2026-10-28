#include "stdafx.h"

#ifdef USE_DIB32

#include "yaneTextDIB32.h"

// @yo2 0x00577910 review
CTextDIB32::CTextDIB32(void){
	m_nTextX = 0;
	m_nTextY = 0;
	m_bVertical = false;
	UseDIBSection(true);
}

// @yo2 0x00577a50 review
void CTextDIB32::SetVertical(bool bVertical){
	m_bVertical = bVertical;
}

// @yo2 0x00577a70 manual
LRESULT	CTextDIB32::UpdateText(void){
	LRESULT lr;
	if (!IsVertical()) {	// 横書きの場合
		lr = UpdateTextHorizontal();
	} else {				// 縦書きの場合
		const string font(m_Font.GetFont());
		if (!font.empty() && font[0]=='@') {
			// 元から縦書きフォントだから何もしない
		} else {
			// 一時的に縦書きフォントに変更する
			m_Font.SetFont('@'+font);
		}
		// 描画
		lr = UpdateTextVertical();
		// フォントを元に戻す
		m_Font.SetFont(font);
	}
	return lr;
}

// @yo2 0x00577ed0 review
LRESULT	CTextDIB32::UpdateTextA(void){	//	アンチェリ付き描画
	LRESULT lr;
	if (!IsVertical()) {	// 横書きの場合
		lr = UpdateTextHorizontalA();
	} else {				// 縦書きの場合
		const string font(m_Font.GetFont());
		if (!font.empty() && font[0]=='@') {
			// 元から縦書きフォントだから何もしない
		} else {
			// 一時的に縦書きフォントに変更する
			m_Font.SetFont('@'+font);
		}
		// 描画
		lr = UpdateTextVerticalA();
		// フォントを元に戻す
		m_Font.SetFont(font);
	}
	return lr;
}

//	↑上のコピペした＾＾；
// @yo2 0x005780a0 review
LRESULT	CTextDIB32::UpdateTextAA(void){	//	アンチェリ付き描画
	LRESULT lr;
	if (!IsVertical()) {	// 横書きの場合
		lr = UpdateTextHorizontalAA();
	} else {				// 縦書きの場合
		const string font(m_Font.GetFont());
		if (!font.empty() && font[0]=='@') {
			// 元から縦書きフォントだから何もしない
		} else {
			// 一時的に縦書きフォントに変更する
			m_Font.SetFont('@'+font);
		}
		// 描画
		lr = UpdateTextVerticalAA();
		// フォントを元に戻す
		m_Font.SetFont(font);
	}
	return lr;
}


//////////////////////////////////////////////////////////
// 横書き

inline LRESULT CTextDIB32::UpdateTextHorizontal(void){
	int sx,sy;

	if (!IsLoad()) {	//	ビットマップ読み込んでないならば．．．
		m_Font.GetSize(sx,sy);
		// m_Fontのテキストが空でもプレーンを作る．
		if ((sx == 0) || (sy == 0)) {
			sx = sy = 1;
		}
		if (CreateSurface(sx,sy)) return 1;
	}
	m_Font.OnDraw(GetDC(),m_nTextX,m_nTextY);

	*GetYGA() = false;	//	for BltNatural
	return 0;
}

// @yo2 0x00578270 review
inline LRESULT CTextDIB32::UpdateTextHorizontalA(void){	//	アンチェリ付き描画
	int sx,sy;
	m_Font.GetSize(sx,sy);
	// m_Fontのテキストが空でもプレーンを作る．
	if ((sx == 0) || (sy == 0)) {
		sx = sy = 1;
	}
	if (!IsLoad()) {	//	ビットマップ読み込んでないならば．．．
		if (CreateSurface(sx,sy)) return 1;
	} else {
		GetSize(sx,sy);	//	プレーンのサイズをサイズとする＾＾；
	}

	COLORREF rgb = m_Font.GetColor();
	COLORREF bk	 = m_Font.GetBackColor();

	m_Font.SetBackColor(CLR_INVALID);
	m_Font.SetColor(RGB(255,255,255));	//	白にして
	int	nQuality = m_Font.GetQuality();
	m_Font.SetQuality(4);	//	アンチェリ無しで書く
	int nFontSize = m_Font.GetSize();
	int nFontHeight = m_Font.GetHeight();
	m_Font.SetSize(nFontSize<<1);	//	2倍サイズで描画
	m_Font.SetHeight(nFontHeight<<1); //　行間も2倍サイズで描画
	//	SetSizeは、行間も変更してしまうので、
	//	SetSizeする前に、行間を取得しておき、それを２倍しなければならない

	CDIB32 d_dib;
	d_dib.UseDIBSection(true);
	int sx2,sy2;
	m_Font.GetSize(sx2,sy2);
	// m_Fontのテキストが空でもプレーンを作る．
	if ((sx2 == 0) || (sy2 == 0)) {
		sx2 = sy2 = 1;
	}
	if (d_dib.CreateSurface(sx2,sy2)) return 2;
	m_Font.OnDraw(d_dib.GetDC(),m_nTextX<<1,m_nTextY<<1);	//	2倍のフォントサイズで描画

/*
	//	等倍のときの転送はこれで良いが．．．
	DWORD *lpdw = GetPtr();
	DWORD dwColor = ((rgb & 0xff) << 16) + (rgb & 0xff00) + ((rgb & 0xff0000)>>16);	//	転置して
	//	明るさをαチャンネルに持っていく
	int nSize = GetRect()->right * GetRect()->bottom;
	for (int i=0;i<nSize;i++){
		*lpdw = ((*lpdw << 8)&0xff000000) + dwColor;	//	色は、rgbで指定された色
		lpdw++;
	}
*/

	//	２×２→等倍に縮小
	{
	  sx2>>=1; sy2>>=1;
	  if (sx2<sx) { sx = sx2; }	//　なんや？生成されたプレーン／２のほうが小さいで...
	  if (sy2<sy) { sy = sy2; }
	  DWORD dwColor = ((rgb & 0xff) << 16) + (rgb & 0xff00) + ((rgb & 0xff0000)>>16);	//	転置して
	  for(int y=0;y<sy;y++){
		DWORD *lpdw = GetPtr() + (GetRect()->right * y);
		DWORD *lpdw2a = d_dib.GetPtr() + (d_dib.GetRect()->right * (y*2	 ));
		DWORD *lpdw2b = lpdw2a		   +  d_dib.GetRect()->right; // 次ライン
		//	得られた明るさをαチャンネルに持っていく
		for(int x=0;x<sx;x++){
			DWORD dwAlpha;
			dwAlpha =  ((*lpdw2a)&0xff) + ((*(lpdw2a+1))&0xff);
			dwAlpha += ((*lpdw2b)&0xff) + ((*(lpdw2b+1))&0xff);
			*lpdw = ((dwAlpha << (24-2)) & 0xff000000) + dwColor;	//	色は、rgbで指定された色
			lpdw++; lpdw2a+=2; lpdw2b+=2;
		}
	  }
	}

	//	復帰させる＾＾；　なんぎやなー（笑）
	m_Font.SetSize(nFontSize);
	m_Font.SetHeight(nFontHeight);
	//	↑ここで戻さないと、文字の影を生成するときに嘘のフォントサイズになっちまう＾＾；

	//	文字の影
	if (bk!=CLR_INVALID) {
	//	影つき文字やんか．．．やらしいなぁ＾＾；
		CTextDIB32 dib;
		*dib.GetFont() = *GetFont();	//	フォントまるごとコピーしてまえー！！＾＾；
		dib.GetFont()->SetColor(bk);
		dib.GetFont()->SetBackColor(CLR_INVALID);	//	これをCLR_INVALIDにしておけば、この再帰は２度目で停止する
//		dib.GetFont()->SetText(m_Font.GetText());
//		dib.SetTextPos(2,2);	//	ずらして描画！
		{
			int nOx, nOy;
			dib.GetFont()->GetShadowOffset(nOx,nOy);
			dib.SetTextPos(nOx,nOy); // ずらして描画！
		}
		dib.UpdateTextA();
		//	PhotoShopのレイヤ的不透明度付き合成

		int alpha;
		int beta;
		int total;
		DWORD dwRGB;

		//	このdibのサイズは、同サイズと仮定できないかも知れない．．
//		int nSize = GetRect()->right*GetRect()->bottom;
//		for (int i=0;i<nSize;i++){

		//	dibにあらたに描画させたやつとサイズが異なるかも知れない．．
		for(int y=0;y<sy;y++){
			DWORD *lpdw = GetPtr() + (GetRect()->right * y);
			DWORD *lpdw2 = dib.GetPtr() + (dib.GetRect()->right * y);
			//	得られた明るさをαチャンネルに持っていく
			for(int x=0;x<sx;x++){
				/*
				このアルゴリズムについては、やねうらおのホームページの
				スーパープログラマーへの道　「第CB回　PhotoShopのレイヤ合成アルゴリズムについて（YGAフォーマットを提唱する) 00/10/18」
				を参照のこと
				*/
				alpha = *lpdw >> 24;
				beta  = *lpdw2 >> 24;
				beta  = (255-alpha)*beta / 255;	//	エネルギー残量の計算
				//	分配比率が決まったので、これに基づいて分配
				total = alpha + beta;
				if (total != 0){	//	ゼロのときは、当然何もしなくて良い
					if (beta == 0){		//転送先が０なら、そのまま転送
						*lpdw2 = *lpdw;
					}else{
						dwRGB = ((*lpdw & 0xff) * alpha + (*lpdw2 & 0xff) * beta) / total;
						dwRGB += (((*lpdw & 0xff00) * alpha + (*lpdw2 & 0xff00) * beta) / total) & 0xff00;
						dwRGB += (((*lpdw & 0xff0000) * alpha + (*lpdw2 & 0xff0000) * beta) / total) & 0xff0000;
						dwRGB += total << 24;	//	alpha値は、エネルギー総量
						*lpdw = dwRGB;
					}
				}
				lpdw++; lpdw2++;
			}
		}
	}

	//	復帰させる＾＾；　なんぎやなー２（笑）
	m_Font.SetQuality(nQuality);
	m_Font.SetColor(rgb);
	m_Font.SetBackColor(bk);

	*GetYGA() = true;	//	for BltNatural

	return 0;
}

//	↑上のコピペした＾＾；
// @yo2 0x00578990 review
inline LRESULT CTextDIB32::UpdateTextHorizontalAA(void){	//	アンチェリ付き描画
	int sx,sy;
	m_Font.GetSize(sx,sy);
	// m_Fontのテキストが空でもプレーンを作る．
	if ((sx == 0) || (sy == 0)) {
		sx = sy = 1;
	}
	if (!IsLoad()) {	//	ビットマップ読み込んでないならば．．．
		if (CreateSurface(sx,sy)) return 1;
	} else {
		GetSize(sx,sy);	//	プレーンのサイズをサイズとする＾＾；
	}

	COLORREF rgb = m_Font.GetColor();
	COLORREF bk	 = m_Font.GetBackColor();

	m_Font.SetBackColor(CLR_INVALID);
	m_Font.SetColor(RGB(255,255,255));	//	白にして
	int	nQuality = m_Font.GetQuality();
	m_Font.SetQuality(4);	//	アンチェリ無しで書く
	int nFontSize = m_Font.GetSize();
	int nFontHeight = m_Font.GetHeight();
	m_Font.SetSize(nFontSize<<2);	//	4倍サイズで描画
	m_Font.SetHeight(nFontHeight<<2); //　行間も4倍サイズで描画

	CDIB32 d_dib;
	d_dib.UseDIBSection(true);
	int sx2,sy2;
	m_Font.GetSize(sx2,sy2);
	// m_Fontのテキストが空でもプレーンを作る．
	if ((sx2 == 0) || (sy2 == 0)) {
		sx2 = sy2 = 1;
	}
	if (d_dib.CreateSurface(sx2,sy2)) return 2;
	m_Font.OnDraw(d_dib.GetDC(),m_nTextX<<2,m_nTextY<<2);	//	4倍のフォントサイズで描画

	//	４×４→等倍に縮小
	{
	  sx2>>=2; sy2>>=2;
	  if (sx2<sx) { sx = sx2; }	//　なんや？生成されたプレーン／２のほうが小さいで...
	  if (sy2<sy) { sy = sy2; }
	  DWORD dwColor = ((rgb & 0xff) << 16) + (rgb & 0xff00) + ((rgb & 0xff0000)>>16);	//	転置して
	  for(int y=0;y<sy;y++){
		DWORD *lpdw = GetPtr() + (GetRect()->right * y);
		DWORD *lpdw2a = d_dib.GetPtr() + (d_dib.GetRect()->right * (y*4	 ));
		DWORD *lpdw2b = lpdw2a		   +  d_dib.GetRect()->right; // 次ライン
		DWORD *lpdw2c = lpdw2b		   +  d_dib.GetRect()->right; // 次ライン
		DWORD *lpdw2d = lpdw2c		   +  d_dib.GetRect()->right; // 次ライン
		//	得られた明るさをαチャンネルに持っていく
		for(int x=0;x<sx;x++){
			DWORD dwAlpha;
			dwAlpha =	((*lpdw2a)&0xff) + ((*(lpdw2a+1))&0xff) + ((*(lpdw2a+2))&0xff) + ((*(lpdw2a+3))&0xff);
			dwAlpha +=	((*lpdw2b)&0xff) + ((*(lpdw2b+1))&0xff) + ((*(lpdw2b+2))&0xff) + ((*(lpdw2b+3))&0xff);
			dwAlpha +=	((*lpdw2c)&0xff) + ((*(lpdw2c+1))&0xff) + ((*(lpdw2c+2))&0xff) + ((*(lpdw2c+3))&0xff);
			dwAlpha +=	((*lpdw2d)&0xff) + ((*(lpdw2d+1))&0xff) + ((*(lpdw2d+2))&0xff) + ((*(lpdw2d+3))&0xff);
			*lpdw = ((dwAlpha << (24-4)) & 0xff000000) + dwColor;	//	色は、rgbで指定された色
			lpdw++; lpdw2a+=4; lpdw2b+=4; lpdw2c+=4; lpdw2d+=4;
		}
	  }
	}

	//	復帰させる＾＾；　なんぎやなー（笑）
	m_Font.SetSize(nFontSize);
	m_Font.SetHeight(nFontHeight);
	//	↑ここで戻さないと、文字の影を生成するときに嘘のフォントサイズになっちまう＾＾；

	//	文字の影
	if (bk!=CLR_INVALID) {
	//	影つき文字やんか．．．やらしいなぁ＾＾；
		CTextDIB32 dib;
		*dib.GetFont() = *GetFont();	//	フォントまるごとコピーしてまえー！！＾＾；
		dib.GetFont()->SetColor(bk);
		dib.GetFont()->SetBackColor(CLR_INVALID);	//	これをCLR_INVALIDにしておけば、この再帰は２度目で停止する
//		dib.GetFont()->SetText(m_Font.GetText());
//		dib.SetTextPos(2,2);	//	ずらして描画！
		{
			int nOx, nOy;
			dib.GetFont()->GetShadowOffset(nOx,nOy);
			dib.SetTextPos(nOx,nOy); // ずらして描画！
		}
		dib.UpdateTextAA();

		//	PhotoShopのレイヤ的不透明度付き合成
		int alpha;
		int beta;
		int total;
		DWORD dwRGB;

		//	dibにあらたに描画させたやつとサイズが異なるかも知れない．．
		for(int y=0;y<sy;y++){
			DWORD *lpdw = GetPtr() + (GetRect()->right * y);
			DWORD *lpdw2 = dib.GetPtr() + (dib.GetRect()->right * y);
			//	得られた明るさをαチャンネルに持っていく
			for(int x=0;x<sx;x++){
				/*
				このアルゴリズムについては、やねうらおのホームページの
				スーパープログラマーへの道　「第CB回　PhotoShopのレイヤ合成アルゴリズムについて（YGAフォーマットを提唱する) 00/10/18」
				を参照のこと
				*/
				alpha = *lpdw >> 24;
				beta  = *lpdw2 >> 24;
				beta  = (255-alpha)*beta / 255;	//	エネルギー残量の計算
				//	分配比率が決まったので、これに基づいて分配
				total = alpha + beta;
				if (total != 0){	//	ゼロのときは、当然何もしなくて良い
					if (beta == 0){		//転送先が０なら、そのまま転送
						*lpdw2 = *lpdw;
					}else{
						dwRGB = ((*lpdw & 0xff) * alpha + (*lpdw2 & 0xff) * beta) / total;
						dwRGB += (((*lpdw & 0xff00) * alpha + (*lpdw2 & 0xff00) * beta) / total) & 0xff00;
						dwRGB += (((*lpdw & 0xff0000) * alpha + (*lpdw2 & 0xff0000) * beta) / total) & 0xff0000;
						dwRGB += total << 24;	//	alpha値は、エネルギー総量
						*lpdw = dwRGB;
					}
				}
				lpdw++; lpdw2++;
			}
		}
	}

	//	復帰させる＾＾；　なんぎやなー２（笑）
	m_Font.SetQuality(nQuality);
	m_Font.SetColor(rgb);
	m_Font.SetBackColor(bk);

	*GetYGA() = true;	//	for BltNatural

	return 0;
}


//////////////////////////////////////////////////////////
// 縦書き

inline LRESULT CTextDIB32::UpdateTextVertical(void){
	int sx,sy;

	if (!IsLoad()) {	//	ビットマップ読み込んでないならば．．．
		m_Font.GetSize(sx,sy);
		// m_Fontのテキストが空でもプレーンを作る．
		if ((sx == 0) || (sy == 0)) {
			sx = sy = 1;
		}
//----------------------------変更
	//	if (CreateSurface(sx,sy)) return 1;
		if (CreateSurface(sy,sx)) return 1;	// 逆になる
	} else {
		GetSize(sx,sy);	//	プレーンのサイズをサイズとする＾＾；
	}

	// 影の向きを縦書き用に変更
	int nOx, nOy;
	m_Font.GetShadowOffset(nOx, nOy);
	m_Font.SetShadowOffset(nOy, -nOx);

	// 縦書き変換用にもう一つサーフェスを作成
	CDIB32 d_dib2;
	d_dib2.UseDIBSection(true);
	if (d_dib2.CreateSurface(sx, sy)) return 2;

 //	m_Font.OnDraw(GetDC(),m_nTextX,m_nTextY);
	m_Font.OnDraw(d_dib2.GetDC(),m_nTextX,m_nTextY);

	// 横→縦変換
	{
		int width, height;
		GetSize(width, height);
		for (int y=0;y<sy;y++) {
			DWORD *lpdw = GetPtr() + (width - y -1);	// 横書きの上→下は縦書きの右→左
			DWORD *lpdw2 = d_dib2.GetPtr() + (d_dib2.GetRect()->right * y);
			for (int x=0;x<sx;x++) {
				*lpdw = *lpdw2;
				lpdw+=width;	// １つ下へ
				lpdw2++;
			}
		}
	}

	// 影の向きを元に戻す
	m_Font.SetShadowOffset(nOx, nOy);
//----------------------------


	*GetYGA() = false;	//	for BltNatural
	return 0;
}

// @yo2 0x005791b0 review
inline LRESULT CTextDIB32::UpdateTextVerticalA(void){	//	アンチェリ付き描画
	int sx,sy;
	m_Font.GetSize(sx,sy);
	// m_Fontのテキストが空でもプレーンを作る．
	if ((sx == 0) || (sy == 0)) {
		sx = sy = 1;
	}
	if (!IsLoad()) {	//	ビットマップ読み込んでないならば．．．
//----------------------------変更
	//	if (CreateSurface(sx,sy)) return 1;
		if (CreateSurface(sy,sx)) return 1;	// 逆になる
//----------------------------
	} else {
		GetSize(sx,sy);	//	プレーンのサイズをサイズとする＾＾；
	}

	COLORREF rgb = m_Font.GetColor();
	COLORREF bk	 = m_Font.GetBackColor();

	m_Font.SetBackColor(CLR_INVALID);
	m_Font.SetColor(RGB(255,255,255));	//	白にして
	int	nQuality = m_Font.GetQuality();
	m_Font.SetQuality(4);	//	アンチェリ無しで書く
	int nFontSize = m_Font.GetSize();
	int nFontHeight = m_Font.GetHeight();
	m_Font.SetSize(nFontSize<<1);	//	2倍サイズで描画
	m_Font.SetHeight(nFontHeight<<1); //　行間も2倍サイズで描画
	//	SetSizeは、行間も変更してしまうので、
	//	SetSizeする前に、行間を取得しておき、それを２倍しなければならない

	CDIB32 d_dib;
	d_dib.UseDIBSection(true);
	int sx2,sy2;
	m_Font.GetSize(sx2,sy2);
	// m_Fontのテキストが空でもプレーンを作る．
	if ((sx2 == 0) || (sy2 == 0)) {
		sx2 = sy2 = 1;
	}
	if (d_dib.CreateSurface(sx2,sy2)) return 2;
	m_Font.OnDraw(d_dib.GetDC(),m_nTextX<<1,m_nTextY<<1);	//	2倍のフォントサイズで描画


//----------------------------追加
	// 影の向きを縦書き用に変更
	int nOx, nOy;
	m_Font.GetShadowOffset(nOx, nOy);
	m_Font.SetShadowOffset(nOy, -nOx);

	// 縦書き変換用にもう一つサーフェスを作成
	CDIB32 d_dib2;
	d_dib2.UseDIBSection(true);
	if (d_dib2.CreateSurface(sx, sy)) return 2;
//----------------------------


/*
	//	等倍のときの転送はこれで良いが．．．
	DWORD *lpdw = GetPtr();
	DWORD dwColor = ((rgb & 0xff) << 16) + (rgb & 0xff00) + ((rgb & 0xff0000)>>16);	//	転置して
	//	明るさをαチャンネルに持っていく
	int nSize = GetRect()->right * GetRect()->bottom;
	for (int i=0;i<nSize;i++){
		*lpdw = ((*lpdw << 8)&0xff000000) + dwColor;	//	色は、rgbで指定された色
		lpdw++;
	}
*/

	//	２×２→等倍に縮小
	{
	  sx2>>=1; sy2>>=1;
	  if (sx2<sx) { sx = sx2; }	//　なんや？生成されたプレーン／２のほうが小さいで...
	  if (sy2<sy) { sy = sy2; }
	  DWORD dwColor = ((rgb & 0xff) << 16) + (rgb & 0xff00) + ((rgb & 0xff0000)>>16);	//	転置して
	  for(int y=0;y<sy;y++){
//----------------------------変更
	//	DWORD *lpdw = GetPtr() + (GetRect()->right * y);
		DWORD *lpdw = d_dib2.GetPtr() + (d_dib2.GetRect()->right * y);	// 縦書き変換用のものを使う
//----------------------------
		DWORD *lpdw2a = d_dib.GetPtr() + (d_dib.GetRect()->right * (y*2	 ));
		DWORD *lpdw2b = lpdw2a		   +  d_dib.GetRect()->right; // 次ライン
		//	得られた明るさをαチャンネルに持っていく
		for(int x=0;x<sx;x++){
			DWORD dwAlpha;
			dwAlpha =  ((*lpdw2a)&0xff) + ((*(lpdw2a+1))&0xff);
			dwAlpha += ((*lpdw2b)&0xff) + ((*(lpdw2b+1))&0xff);
			*lpdw = ((dwAlpha << (24-2)) & 0xff000000) + dwColor;	//	色は、rgbで指定された色
			lpdw++; lpdw2a+=2; lpdw2b+=2;
		}
	  }
	}

	//	復帰させる＾＾；　なんぎやなー（笑）
	m_Font.SetSize(nFontSize);
	m_Font.SetHeight(nFontHeight);
	//	↑ここで戻さないと、文字の影を生成するときに嘘のフォントサイズになっちまう＾＾；

	//	文字の影
	if (bk!=CLR_INVALID) {
	//	影つき文字やんか．．．やらしいなぁ＾＾；
		CTextDIB32 dib;
		*dib.GetFont() = *GetFont();	//	フォントまるごとコピーしてまえー！！＾＾；
		dib.GetFont()->SetColor(bk);
		dib.GetFont()->SetBackColor(CLR_INVALID);	//	これをCLR_INVALIDにしておけば、この再帰は２度目で停止する
//		dib.GetFont()->SetText(m_Font.GetText());
//		dib.SetTextPos(2,2);	//	ずらして描画！
		{
			int nOx, nOy;
			dib.GetFont()->GetShadowOffset(nOx,nOy);
			dib.SetTextPos(nOx,nOy); // ずらして描画！
		}
		dib.UpdateTextA();
		//	PhotoShopのレイヤ的不透明度付き合成

		int alpha;
		int beta;
		int total;
		DWORD dwRGB;

		//	このdibのサイズは、同サイズと仮定できないかも知れない．．
//		int nSize = GetRect()->right*GetRect()->bottom;
//		for (int i=0;i<nSize;i++){

		//	dibにあらたに描画させたやつとサイズが異なるかも知れない．．
		for(int y=0;y<sy;y++){
//----------------------------変更
	//		DWORD *lpdw = GetPtr() + (GetRect()->right * y);
			DWORD *lpdw = d_dib2.GetPtr() + (d_dib2.GetRect()->right * y);	// 縦書き変換用のものを使う
//----------------------------
			DWORD *lpdw2 = dib.GetPtr() + (dib.GetRect()->right * y);
			//	得られた明るさをαチャンネルに持っていく
			for(int x=0;x<sx;x++){
				/*
				このアルゴリズムについては、やねうらおのホームページの
				スーパープログラマーへの道　「第CB回　PhotoShopのレイヤ合成アルゴリズムについて（YGAフォーマットを提唱する) 00/10/18」
				を参照のこと
				*/
				alpha = *lpdw >> 24;
				beta  = *lpdw2 >> 24;
				beta  = (255-alpha)*beta / 255;	//	エネルギー残量の計算
				//	分配比率が決まったので、これに基づいて分配
				total = alpha + beta;
				if (total != 0){	//	ゼロのときは、当然何もしなくて良い
					if (beta == 0){		//転送先が０なら、そのまま転送
						*lpdw2 = *lpdw;
					}else{
						dwRGB = ((*lpdw & 0xff) * alpha + (*lpdw2 & 0xff) * beta) / total;
						dwRGB += (((*lpdw & 0xff00) * alpha + (*lpdw2 & 0xff00) * beta) / total) & 0xff00;
						dwRGB += (((*lpdw & 0xff0000) * alpha + (*lpdw2 & 0xff0000) * beta) / total) & 0xff0000;
						dwRGB += total << 24;	//	alpha値は、エネルギー総量
						*lpdw = dwRGB;
					}
				}
				lpdw++; lpdw2++;
			}
		}
	}

	//	復帰させる＾＾；　なんぎやなー２（笑）
	m_Font.SetQuality(nQuality);
	m_Font.SetColor(rgb);
	m_Font.SetBackColor(bk);


//----------------------------追加
	// 横→縦変換
	{
		int width, height;
		GetSize(width, height);
		for (int y=0;y<sy;y++) {
			DWORD *lpdw = GetPtr() + (width - y -1);	// 横書きの上→下は縦書きの右→左
			DWORD *lpdw2 = d_dib2.GetPtr() + (d_dib2.GetRect()->right * y);
			for (int x=0;x<sx;x++) {
				*lpdw = *lpdw2;
				lpdw+=width;	// １つ下へ
				lpdw2++;
			}
		}
	}

	// 影の向きを元に戻す
	m_Font.SetShadowOffset(nOx, nOy);
//----------------------------


	*GetYGA() = true;	//	for BltNatural

	return 0;
}

//	↑上のコピペした＾＾；
// @yo2 0x00579a40 review
inline LRESULT CTextDIB32::UpdateTextVerticalAA(void){	//	アンチェリ付き描画
	int sx,sy;
	m_Font.GetSize(sx,sy);
	// m_Fontのテキストが空でもプレーンを作る．
	if ((sx == 0) || (sy == 0)) {
		sx = sy = 1;
	}
	if (!IsLoad()) {	//	ビットマップ読み込んでないならば．．．
//----------------------------変更
	//	if (CreateSurface(sx,sy)) return 1;
		if (CreateSurface(sy,sx)) return 1;	// 逆になる
//----------------------------
	} else {
		GetSize(sx,sy);	//	プレーンのサイズをサイズとする＾＾；
	}

	COLORREF rgb = m_Font.GetColor();
	COLORREF bk	 = m_Font.GetBackColor();

	m_Font.SetBackColor(CLR_INVALID);
	m_Font.SetColor(RGB(255,255,255));	//	白にして
	int	nQuality = m_Font.GetQuality();
	m_Font.SetQuality(4);	//	アンチェリ無しで書く
	int nFontSize = m_Font.GetSize();
	int nFontHeight = m_Font.GetHeight();
	m_Font.SetSize(nFontSize<<2);	//	4倍サイズで描画
	m_Font.SetHeight(nFontHeight<<2); //　行間も4倍サイズで描画

	CDIB32 d_dib;
	d_dib.UseDIBSection(true);
	int sx2,sy2;
	m_Font.GetSize(sx2,sy2);
	// m_Fontのテキストが空でもプレーンを作る．
	if ((sx2 == 0) || (sy2 == 0)) {
		sx2 = sy2 = 1;
	}
	if (d_dib.CreateSurface(sx2,sy2)) return 2;
	m_Font.OnDraw(d_dib.GetDC(),m_nTextX<<2,m_nTextY<<2);	//	4倍のフォントサイズで描画


//----------------------------追加
	// 影の向きを縦書き用に変更
	int nOx, nOy;
	m_Font.GetShadowOffset(nOx, nOy);
	m_Font.SetShadowOffset(nOy, -nOx);

	// 縦書き変換用にもう一つサーフェスを作成
	CDIB32 d_dib2;
	d_dib2.UseDIBSection(true);
	if (d_dib2.CreateSurface(sx, sy)) return 2;
//----------------------------


	//	４×４→等倍に縮小
	{
	  sx2>>=2; sy2>>=2;
	  if (sx2<sx) { sx = sx2; }	//　なんや？生成されたプレーン／２のほうが小さいで...
	  if (sy2<sy) { sy = sy2; }
	  DWORD dwColor = ((rgb & 0xff) << 16) + (rgb & 0xff00) + ((rgb & 0xff0000)>>16);	//	転置して
	  for(int y=0;y<sy;y++){
//----------------------------変更
	//	DWORD *lpdw = GetPtr() + (GetRect()->right * y);
		DWORD *lpdw = d_dib2.GetPtr() + (d_dib2.GetRect()->right * y);	// 縦書き変換用のものを使う
//----------------------------
		DWORD *lpdw2a = d_dib.GetPtr() + (d_dib.GetRect()->right * (y*4	 ));
		DWORD *lpdw2b = lpdw2a		   +  d_dib.GetRect()->right; // 次ライン
		DWORD *lpdw2c = lpdw2b		   +  d_dib.GetRect()->right; // 次ライン
		DWORD *lpdw2d = lpdw2c		   +  d_dib.GetRect()->right; // 次ライン
		//	得られた明るさをαチャンネルに持っていく
		for(int x=0;x<sx;x++){
			DWORD dwAlpha;
			dwAlpha =	((*lpdw2a)&0xff) + ((*(lpdw2a+1))&0xff) + ((*(lpdw2a+2))&0xff) + ((*(lpdw2a+3))&0xff);
			dwAlpha +=	((*lpdw2b)&0xff) + ((*(lpdw2b+1))&0xff) + ((*(lpdw2b+2))&0xff) + ((*(lpdw2b+3))&0xff);
			dwAlpha +=	((*lpdw2c)&0xff) + ((*(lpdw2c+1))&0xff) + ((*(lpdw2c+2))&0xff) + ((*(lpdw2c+3))&0xff);
			dwAlpha +=	((*lpdw2d)&0xff) + ((*(lpdw2d+1))&0xff) + ((*(lpdw2d+2))&0xff) + ((*(lpdw2d+3))&0xff);
			*lpdw = ((dwAlpha << (24-4)) & 0xff000000) + dwColor;	//	色は、rgbで指定された色
			lpdw++; lpdw2a+=4; lpdw2b+=4; lpdw2c+=4; lpdw2d+=4;
		}
	  }
	}

	//	復帰させる＾＾；　なんぎやなー（笑）
	m_Font.SetSize(nFontSize);
	m_Font.SetHeight(nFontHeight);
	//	↑ここで戻さないと、文字の影を生成するときに嘘のフォントサイズになっちまう＾＾；

	//	文字の影
	if (bk!=CLR_INVALID) {
	//	影つき文字やんか．．．やらしいなぁ＾＾；
		CTextDIB32 dib;
		*dib.GetFont() = *GetFont();	//	フォントまるごとコピーしてまえー！！＾＾；
		dib.GetFont()->SetColor(bk);
		dib.GetFont()->SetBackColor(CLR_INVALID);	//	これをCLR_INVALIDにしておけば、この再帰は２度目で停止する
//		dib.GetFont()->SetText(m_Font.GetText());
//		dib.SetTextPos(2,2);	//	ずらして描画！
		{
			int nOx, nOy;
			dib.GetFont()->GetShadowOffset(nOx,nOy);
			dib.SetTextPos(nOx,nOy); // ずらして描画！
		}
		dib.UpdateTextAA();

		//	PhotoShopのレイヤ的不透明度付き合成
		int alpha;
		int beta;
		int total;
		DWORD dwRGB;

		//	dibにあらたに描画させたやつとサイズが異なるかも知れない．．
		for(int y=0;y<sy;y++){
//----------------------------変更
		//	DWORD *lpdw = GetPtr() + (GetRect()->right * y);
			DWORD *lpdw = d_dib2.GetPtr() + (d_dib2.GetRect()->right * y);	// 縦書き変換用のものを使う
//----------------------------
			DWORD *lpdw2 = dib.GetPtr() + (dib.GetRect()->right * y);
			//	得られた明るさをαチャンネルに持っていく
			for(int x=0;x<sx;x++){
				/*
				このアルゴリズムについては、やねうらおのホームページの
				スーパープログラマーへの道　「第CB回　PhotoShopのレイヤ合成アルゴリズムについて（YGAフォーマットを提唱する) 00/10/18」
				を参照のこと
				*/
				alpha = *lpdw >> 24;
				beta  = *lpdw2 >> 24;
				beta  = (255-alpha)*beta / 255;	//	エネルギー残量の計算
				//	分配比率が決まったので、これに基づいて分配
				total = alpha + beta;
				if (total != 0){	//	ゼロのときは、当然何もしなくて良い
					if (beta == 0){		//転送先が０なら、そのまま転送
						*lpdw2 = *lpdw;
					}else{
						dwRGB = ((*lpdw & 0xff) * alpha + (*lpdw2 & 0xff) * beta) / total;
						dwRGB += (((*lpdw & 0xff00) * alpha + (*lpdw2 & 0xff00) * beta) / total) & 0xff00;
						dwRGB += (((*lpdw & 0xff0000) * alpha + (*lpdw2 & 0xff0000) * beta) / total) & 0xff0000;
						dwRGB += total << 24;	//	alpha値は、エネルギー総量
						*lpdw = dwRGB;
					}
				}
				lpdw++; lpdw2++;
			}
		}
	}

	//	復帰させる＾＾；　なんぎやなー２（笑）
	m_Font.SetQuality(nQuality);
	m_Font.SetColor(rgb);
	m_Font.SetBackColor(bk);


//----------------------------追加
	// 横→縦変換
	{
		int width, height;
		GetSize(width, height);
		for (int y=0;y<sy;y++) {
			DWORD *lpdw = GetPtr() + (width - y -1);	// 横書きの上→下は縦書きの右→左
			DWORD *lpdw2 = d_dib2.GetPtr() + (d_dib2.GetRect()->right * y);
			for (int x=0;x<sx;x++) {
				*lpdw = *lpdw2;
				lpdw+=width;	// １つ下へ
				lpdw2++;
			}
		}
	}

	// 影の向きを元に戻す
	m_Font.SetShadowOffset(nOx, nOy);
//----------------------------


	*GetYGA() = true;	//	for BltNatural

	return 0;
}

#endif
