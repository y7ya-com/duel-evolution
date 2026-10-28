
#include "stdafx.h"
#include "yaneSpriteChara.h"

#include "yanePlane.h"
#include "yaneDIB32.h"

#include "yaneAppManager.h"
#include "yaneLineParser.h"
#include "yaneFile.h"

// @yo2? 0x00570090 order
CSpriteChara::CSpriteChara(void){
	m_nSpriteMax = 0;
}

// @yo2 0x00570270 vt
CSpriteChara::~CSpriteChara(){
	Release();
}

// @yo2 0x005703c0 review
void	CSpriteChara::Release(void){
	m_lpPlaneList.clear();
	//	↑auto_ptrなのでこれでいいんでしょ？
	m_lpSprite.clear();
}

// @yo2 0x00570450 feat
LRESULT CSpriteChara::Load(LPSTR szFileName){
	CFile file;
	if (file.Read(szFileName)!=0) return 1;

	//	ReadLine()で一行ずつ解析してスプライト設定を行なう

	//	スプライトスライスの用意
	SSprite ssprite[256];
	ZERO(ssprite);

	int		nLine = 0;
	CHAR	szBuf[256];
	while (true) {
		nLine++;

		CLineParser		lineParser;
		if( file.ReadLine( szBuf ) !=0 ) break;
		lineParser.SetLine( szBuf );					//	ライン パーサーに文字列をセットする

		//////////////////////////////////////////////////
		// 各コマンド別に実行させる

		// スプライト定義数の設定
		if ( lineParser.IsMatch( "#SpriteMax" ) ){
			int		n;
			if ( lineParser.GetNum( n ) != 0 ) { Err.Out("CSpriteChara::Loadで#SpriteMaxに失敗"); return 2; }
			m_lpSprite.resize(n);
			m_nSpriteMax = n;
			continue;
		}
		////	最大一致法 SpriteMax > SpriteF > Sprite
		//	スプライトxの矩形循環の設定 (ただし抜き色は無効)
		if ( lineParser.IsMatch( "#SpriteF" ) ){
			WARNING(m_lpSprite==NULL,"CSpriteChara::LoadでSpriteMaxなしに#Spriteが有る");
			int		n,m;
			lineParser.GetNum(n);
			while (true){
				if (lineParser.GetNum(m)) break;
				ssprite[m].bFast=true;

				//	高さは、足元
				ssprite[m].nHeight = 32;
					//	今回はこれで統一したほうがよさげ...
					//	もし変更が必要な場合は、各キャラクラスで変更すること

				m_lpSprite[n].SetSpriteAdd(&ssprite[m]);
			}
			continue;
		}
/*
	⇒　一括定義
	#SpritePlane 0,0,34					//	スプライト0～34は、プレーン0から35個目(プレーン34)とする。
	#SpritePlaneF 0,0,34					//	スプライト0～34は、プレーン0から35個目(プレーン34)とする。ただし抜き色は無効
*/

		//	非循環スプライトxの設定
		if ( lineParser.IsMatch( "#SpritePlaneF" ) ){
			WARNING(m_lpSprite==NULL,"CSpriteChara::LoadでSpriteMaxなしに#Spriteが有る");
			int		n,m,l;
			lineParser.GetNum(n);
			if (lineParser.GetNum(m)) break;
			if (lineParser.GetNum(l)) break;

			SSprite s = {0};
			for(int i=n;i<n+l;i++){
				ssprite[i].bFast=true;
				//	高さは、足元
				ssprite[i].nHeight = 32;
				//	今回はこれで統一したほうがよさげ...
				//	もし変更が必要な場合は、各キャラクラスで変更すること
				s.lpPlane = m_lpPlaneList[m+i].get();
				{
					int sx,sy;
					s.lpPlane->GetSize(sx,sy);
					::SetRect(&s.rcRect,0,0,sx,sy);
				}
				m_lpSprite[i].SetSpriteAdd(&s);
			}
			continue;
		}

		//	非循環スプライトxの設定
		if ( lineParser.IsMatch( "#SpritePlane" ) ){
			WARNING(m_lpSprite==NULL,"CSpriteChara::LoadでSpriteMaxなしに#Spriteが有る");
			int		n,m,l;
			lineParser.GetNum(n);
			if (lineParser.GetNum(m)) break;
			if (lineParser.GetNum(l)) break;

			SSprite s = {0};
			for(int i=n;i<n+l;i++){
				ssprite[i].bFast=false;
				//	高さは、足元
				ssprite[i].nHeight = 32;
				//	今回はこれで統一したほうがよさげ...
				//	もし変更が必要な場合は、各キャラクラスで変更すること
				s.lpPlane = m_lpPlaneList[m+i].get();
				{
					int sx,sy;
					s.lpPlane->GetSize(sx,sy);
					::SetRect(&s.rcRect,0,0,sx,sy);
				}
				m_lpSprite[i].SetSpriteAdd(&s);
			}
			continue;
		}


		//	スプライトxの矩形循環の設定
		if ( lineParser.IsMatch( "#Sprite" ) ){
			WARNING(m_lpSprite==NULL,"CSpriteChara::LoadでSpriteMaxなしに#Spriteが有る");
			int		n,m;
			lineParser.GetNum(n);
			while (true){
				if (lineParser.GetNum(m)) break;
				ssprite[m].bFast=false;

				//	高さは、足元
				ssprite[m].nHeight = 32;
					//	今回はこれで統一したほうがよさげ...
					//	もし変更が必要な場合は、各キャラクラスで変更すること
				
				m_lpSprite[n].SetSpriteAdd(&ssprite[m]);
			}
			continue;
		}

		// 指定したプレーンpにスプライトデータを読み込む
		if ( lineParser.IsMatch( "#Plane" ) ){
			int		n;
			lineParser.GetNum( n );
			//	不足分は、newする
			while (m_lpPlaneList.size()<=n){
				m_lpPlaneList.insert(CPlaneBase::CreatePlane());
			}
			string szFile;
			lineParser.GetStr(szFile);
			m_lpPlaneList[n]->Load(szFile);
			continue;
		}

		//	指定したプレーンpの抜き色を座標で指定
		if ( lineParser.IsMatch( "#ColorKeyA" ) ){
			int		n,m;
			lineParser.GetNum( n );
			lineParser.GetNum( m );
			//	不足分は、newする
			//	(ただし、ここでnewしたものに対してSetColorKeyは不正だが．．)
			while (m_lpPlaneList.size()<=m){
				m_lpPlaneList.insert(CPlaneBase::CreatePlane());
			}
			int x,y;
			lineParser.GetNum( x );
			lineParser.GetNum( y );
			for(int i=n;i<=m;i++) {
				m_lpPlaneList[i]->SetColorKey(x,y);
			}
			continue;
		}

		//	指定したプレーンpの抜き色をRGBで指定
		if ( lineParser.IsMatch( "#ColorKeyB" ) ){
			int		n,m;
			lineParser.GetNum( n );
			lineParser.GetNum( m );
			//	不足分は、newする
			while (m_lpPlaneList.size()<=m){
				m_lpPlaneList.insert(CPlaneBase::CreatePlane());
			}
			int r,g,b;
			lineParser.GetNum( r );
			lineParser.GetNum( g );
			lineParser.GetNum( b );
			for(int i=n;i<=m;i++) {
				m_lpPlaneList[i]->SetColorKey(r,g,b);
			}
			continue;
		}

		//	指定したプレーンpの抜き色を座標で指定
		if ( lineParser.IsMatch( "#ColorKey" ) ){
			int		n;
			lineParser.GetNum( n );
			//	不足分は、newする
			while (m_lpPlaneList.size()<=n){
				m_lpPlaneList.insert(CPlaneBase::CreatePlane());
			}
			int x,y;
			lineParser.GetNum( x );
			lineParser.GetNum( y );
			m_lpPlaneList[n]->SetColorKey(x,y);
			continue;
		}

		//	最大一致法 (RectOffset > RectA > Rect)
		//	矩形aからbまでに、(x,y)のオフセットを与える
		if ( lineParser.IsMatch( "#RectOffset" ) ){
			int		a,b;
			lineParser.GetNum( a );
			lineParser.GetNum( b );
			int		x,y;
			lineParser.GetNum(x);
			lineParser.GetNum(y);
			for(int i=a;i<=b;i++){
				ssprite[i].nOx = x;
				ssprite[i].nOy = y;
			}
			continue;
		}

		//	矩形aから、プレーンpに対して、(x,y)からW×Hで横x列、縦y行の繰り替えし定義を行う
		if ( lineParser.IsMatch( "#RectA" ) ){
			int		n;
			lineParser.GetNum( n );
			int		nPlane;
			lineParser.GetNum( nPlane );

			int		x,y,w,h,xt,yt;
			lineParser.GetNum(x);
			lineParser.GetNum(y);
			lineParser.GetNum(w);
			lineParser.GetNum(h);
			lineParser.GetNum(xt);
			lineParser.GetNum(yt);
			for(int j=0;j<yt;j++){
				for(int i=0;i<xt;i++){
					::SetRect( &ssprite[n+i+j*xt].rcRect,x+w*i,y+h*j,x+w*(i+1),y+h*(j+1));
					ssprite[n+i+j*xt].lpPlane = m_lpPlaneList[nPlane].get();
				}
			}
			continue;
		}

		//	矩形aとしてプレーンpの(x,y)からW×Hの矩形とする
		if ( lineParser.IsMatch( "#Rect" ) ){
			int		n;
			lineParser.GetNum( n );
			WARNING(n<0||n>255,"CSpriteChara::Loadでn<0||n>255");
			int		nPlane;
			lineParser.GetNum( nPlane );
			int		x,y,sx,sy;
			lineParser.GetNum(x);
			lineParser.GetNum(y);
			lineParser.GetNum(sx);
			lineParser.GetNum(sy);
			::SetRect( &ssprite[n].rcRect,x,y,x+sx,y+sy);
			ssprite[n].lpPlane = m_lpPlaneList[nPlane].get();
			continue;
		}

		/*
		//	スプライトs1からs2はレイヤーLとして定義（ディフォルトで5）
		if ( lineParser.IsMatch( "#Layer" ) ){
			int		a,b;
			lineParser.GetNum( a );
			lineParser.GetNum( b );
			int		nLayer;
			lineParser.GetNum(nLayer);
			for(int i=a;i<=b;i++){
				m_lpSprite[i].SetLayer(nLayer);
			}
			continue;
		}
		*/
		if (lineParser.IsMatch("#")){
			Err.Out("CSpriteChara::Loadで%sの%d行に不明な命令",szFileName,nLine);
			return 1;
		}
	}

	return 0;
}

///////////////////////////////////////////////////////////////////////////////////

/*
	スプライト定義ファイルのフォーマット
	・大文字小文字は区別しない
	・１行は２５６文字まで
	・矩形定義は256まで
	・スプライトとは、ある一連の動き（CSprite）を定義する
	・スプライト定義は、矩形を順番に指定することによって行なう
	・各行、//以降はコメントとできる
	・プレーンは無限に利用できる
	・矩形とともに、足の位置（ベースライン）を指定することがある
	・矩形とともに、オフセットを指定することがある
	・スプライト・矩形番号は０から始まる
	#SpriteMax	4			//	スプライト定義数は４。これは先頭で指定する
	#Plane 0,"test.bmp"		//	プレーン0としてtest.bmpを読み込む
	#ColorKey 0,4,10		//	0番のプレーンの抜き色を位置で指定し、それは(4,10)とする(ディフォルトは(0,0))
	#Plane 1,"test2.bmp"	//	プレーン1としてtest2.bmpを読み込む
	#Rect 0,1,48,48,64,128	//	矩形0としてプレーン1の(48,48)からW64×H128の矩形とする
	#Rect 1,1,112,48,64,128	//	矩形1としてプレーン1の(112,48)からW64×H128の矩形とする
	#Sprite 1,0,1,1,0		//	スプライト1は矩形0→矩形1→矩形1→矩形0という循環とする
	#SpriteF 0,0,1,1,0		//	スプライト0は矩形0→矩形1→矩形1→矩形0という循環とする。ただし抜き色は無効


	⇒　一括定義
	#SpritePlane 0,0,34					//	スプライト0～34は、プレーン0から35個(プレーン0からプレーン34)とする。
	#SpritePlaneF 0,0,34				//	スプライト0～34は、プレーン0から35個(プレーン0からプレーン34)とする。ただし抜き色は無効
	#ColorKeyA 0,34,4,10				//	0～34のプレーンのカラーキーは位置で指定し、それは(4,10)とする(ディフォルトは(0,0))
	#ColorKeyB 0,107,0,255,0			
	//	0-107番のプレーンの抜き色をRGBで指定し、それは(0,255,0)とする

//	#SpriteA 0,0,34						//	スプライト0～34は、矩形0から35個目の矩形までとする。（未実装）

	#RectA	12,0,10,15,32,64,4,3	//	矩形12～は、プレーン0に対する、W32×H64のサイズであり、
									//	それは(10,15)に始まり、横4列、縦3行の12回分繰り替えし
									//	定義される。つまり矩形12～23までが一気に定義される
	#RectOffset 10,16,5,6	//	矩形10から16までに、(5,6)のオフセットを与える

//	#Layer 1,3,5			//	スプライト1から3はLayer5として定義（ディフォルトで5）
//

*/
