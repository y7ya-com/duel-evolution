//	yaneGraphicLoader.cpp

#include "stdafx.h"
#include "yaneGraphicLoader.h"
#include <ole2.h>		//	CreateStreamOnHGlobal

// @yo2 0x00531d00 review
CGraphicLoader::CGraphicLoader(){
	m_lpBI			= NULL;				//	for LoadPictureByOwn
	m_lpBF			= NULL;
	m_lpBits		= NULL;

	m_lpiPicture	= NULL;				//	for OLELoadPicture

	m_hDLL			= NULL;				//	for SPILoader
	m_hBm			= NULL;
	m_hBmInfo		= NULL;
}

// @yo2 0x00531d60 vt
CGraphicLoader::~CGraphicLoader(){
	ReleasePicture();
}

PrototypeFactory<CGraphicLoader> CGraphicLoader::m_factory;

// @yo2 0x00531e10 vt
LRESULT CGraphicLoader::LoadPicture(CFile& file){
	if (LoadPictureByOwn(file)==0) return 0;	//	Bitmap
	if (LoadPictureByOLE(file)==0) return 0;	//	JPEG,Gif
	if (LoadPictureBySPI(file)==0) return 0;	//	using by SPI
	return 1;
}

// @yo2 0x00531e60 vt
LRESULT CGraphicLoader::LoadPictureByOwn(CFile& file){
	//	自力でビットマップから読み出す
	//	将来的にはPng等にも対応させたいような、させたくないような…（どないやねん！）

	// これで、ファイルをまるごと読み込めた
	// あとは、filesizeとfileadrで頑張るのだ。
	m_lpBF = (BITMAPFILEHEADER*)file.GetMemory();
	if (file.GetSize() < sizeof(BITMAPFILEHEADER)+sizeof(BITMAPINFOHEADER) ||
			m_lpBF->bfType!=0x4D42) {
		// BMとちごたらBMPとちゃうんでない
		m_lpBF = NULL;
		return 1;
	}

	m_lpBI = (BITMAPINFOHEADER*)((BYTE*)m_lpBF + sizeof(BITMAPFILEHEADER));
	m_lpBits = (void*)((BYTE*)m_lpBF + m_lpBF->bfOffBits);

	return 0;
}

// @yo2 0x00531ed0 vt
LRESULT CGraphicLoader::LoadPictureByOLE(CFile& file){
	IStream* iStream;

/* UeSyuさんより：
CreateStreamOnHGlobalの１番目の引数（データの位置）で渡すポインタの示す領域
が、newで作ったBYTEの配列だとWin98では動かないようになっているみたいです。
で、GlobalAllocで作った領域にするとちゃんと動くようになりました。
ただ、Win2000の場合、どちらでも動くようです。
*/

	if(!SUCCEEDED(::CreateStreamOnHGlobal((HGLOBAL)file.GetMemory(),FALSE,&iStream))) {
		ReleasePicture();
		return 1;
	}
	if(!SUCCEEDED(::OleLoadPicture(iStream,file.GetSize(), TRUE, IID_IPicture, (LPVOID*)&m_lpiPicture))){
		iStream->Release();
		ReleasePicture();
		return 2;
	}
	iStream->Release();

	return 0;
}

// @yo2 0x00531f70 vt
LRESULT CGraphicLoader::LoadPictureBySPI(CFile& file){
	//	拡張子を調べる
	string suffix;
	suffix = file.GetSuffix();
	string DllName;
	DllName = "spi/if" + suffix + ".spi";
	CFile::MakeFullName(DllName);

	m_hDLL = ::LoadLibrary(DllName.c_str());
	if(m_hDLL==NULL) return 1;

	m_pIsSupported		= (SpiFuncIsSupported)		GetProcAddress(m_hDLL, "IsSupported");
	m_pGetPictureInfo	= (SpiFuncGetPictureInfo)	GetProcAddress(m_hDLL, "GetPictureInfo");
	m_pGetPicture		= (SpiFuncGetPicture)		GetProcAddress(m_hDLL, "GetPicture");
	m_lpFile			= &file;

	//	小さすぎるファイルは読み込むとエラーになってしまう！
	if (file.GetSize() < 2048) return 1;

	if (!m_pIsSupported(NULL,(DWORD)file.GetMemory())) {
		ReleasePicture();	//	DLLの解放
		return 1;
	}
	return 0;
}

// @yo2 0x005322e0 vt
LRESULT CGraphicLoader::GetSize(LONG& x,LONG& y){			//	これで読み込んだ画像のサイズを取得
	if (m_lpBI!=NULL) {
		x = m_lpBI->biWidth;
		y = m_lpBI->biHeight;
		return 0;
	}
	if (m_lpiPicture!=NULL){
		m_lpiPicture->get_Width(&x);
		m_lpiPicture->get_Height(&y);

		//	なぜか26.45724907倍が返ってくるのだ:p
		//	→いや？26.45かえ？('00/08/24)
		//	→いやHimetricをpixelsに変換してるんだろ？('00/08/25)
		HDC hdc = ::GetDC(NULL);
		x = ::MulDiv(x,::GetDeviceCaps(hdc,LOGPIXELSX),2540);
		y = ::MulDiv(y,::GetDeviceCaps(hdc,LOGPIXELSY),2540);
		::ReleaseDC(NULL,hdc);

		return 0;
	}
	if (m_hDLL!=NULL){
		SpiPictureInfo info;
		m_pGetPictureInfo((LPSTR)m_lpFile->GetMemory(),(LONG)m_lpFile->GetSize(),1,&info);
		x = info.width;
		y = info.height;
		return 0;
	}
	return 1;
}

// @yo2 0x00532420 vt
LRESULT CGraphicLoader::ReleasePicture(){
	m_lpBI			= NULL;				//	for LoadPictureByOwn
	m_lpBF			= NULL;
	m_lpBits		= NULL;

	if (m_lpiPicture!=NULL) {
		LRESULT lr = 0;
		if (m_lpiPicture->Release()!=S_OK) lr++;
		m_lpiPicture = NULL;
		return lr;
	}

	if (m_hDLL!=NULL){
		::FreeLibrary(m_hDLL);
		m_hDLL		= NULL;
	}
	FreeLocalMemory();
	return 0;
}

// @yo2 0x00532490 vt
void	CGraphicLoader::FreeLocalMemory(){
	if (m_hBm!=NULL) {
		::LocalFree(m_hBm);
		m_hBm		= NULL;
	}
	if (m_hBmInfo!=NULL){
		::LocalFree(m_hBmInfo);
		m_hBmInfo	= NULL;
	}
}

//	bmp自前で読み込まんとあかん。何せ、解像度切り替わっても、
//	GetDCは、最初起動したときのDC返しよるから...
// @yo2 0x005324d0 vt
LRESULT CGraphicLoader::Render(DWORD *pDstSurface,LONG lPitch){	//	XRGB8888
	if (m_lpBI==NULL) {
		return 1;	//	自前で読み込んでへんやん．．
	}
/*	
typedef struct tagBITMAPINFOHEADER {
	unsigned long		biSize;			// 当構造体のサイズ(バイト)
	long				biWidth;		// イメージの幅			  [*1]
	long				biHeight;		// イメージの高さ		  [*1]
	unsigned int		biPlanes;		// must be 1
	unsigned int		biBitCount;		// 色数					  [*2]
	unsigned long		biCompression;	// 圧縮タイプ			  [*3]
	unsigned long		biSizeImage;	// イメージのサイズ		  [*3]
	long				biXPixPerMeter; // 水平解像度			  [*4]
	long				biYPixPerMeter; // 垂直解像度			  [*4]
	unsigned long		biClrUsed;		// →カラーテーブルを参照
	unsigned long		biClrImporant;	// →カラーテーブルを参照
} BITMAPINFOHEADER;

・RGBQUAD/RGBTRIPLE --------------------------------------------------
　以下に示すのはRGBQUADであり、RGBTRIPLEにおいては｢rgbReserved｣がなく
　なるだけである。

typedef struct tagRGBQUAD {
	unsigned char		rgbBlue;		// 青の輝度
	unsigned char		rgbGreen;		// 緑の輝度
	unsigned char		rgbRed;			// 赤の輝度
	unsigned char		rgbReserved;	// must be 0
} RGBQUAD;
*/

	//	変な圧縮掛けてあらへんやろな？ヽ(`Д´)ノ
	if (m_lpBI->biCompression!=BI_RGB) {
		return 2;
	}

	int nBpp = m_lpBI->biBitCount;
	LONG sx,sy;
	GetSize(sx,sy);
	LONG align_sx = ((sx*nBpp)/8 + 3) & ~3;	//	４でアライン

	switch (nBpp){
	case 1:	//	グレースケール
	case 4:	//	１６色
	case 8:	//	２５６色
		{
			return 3;	//	ごめん、、実装やりかけ。非対応だべさ．．
			break;
		}
	case 24://	フルカラー
		{
			for(int y=0;y<sy;y++){
				BYTE* pSrc = (BYTE*)((BYTE*)m_lpBits + align_sx * (sy-y-1));
				DWORD* pDst = (DWORD*)((BYTE*)pDstSurface + lPitch * y);
				for(int x=0;x<sx;x++){
					pDst[x] = *(DWORD*)pSrc & 0xffffff;	//	最上位は無視
					pSrc+=3;
					//	誰や24bppのときはRGBQUADやってゆったんは．．
				}
			}
			break;
		}
	case 32:	// [Konami] added: 32bpp bitmaps are copied line by line (bottom-up source)
		{
			for(int y=0;y<sy;y++){
				BYTE* pSrc = (BYTE*)((BYTE*)m_lpBits + align_sx * (sy-y-1));
				DWORD* pDst = (DWORD*)((BYTE*)pDstSurface + lPitch * y);
				::CopyMemory(pDst,pSrc,lPitch);
			}
			break;
		}
	default:
		return 3;	//	非対応だべさ
	}

	return 0;
}

// @yo2 0x005326b0 vt
LRESULT CGraphicLoader::Render(HDC hdc){
	LONG sx,sy;
	GetSize(sx,sy);

	if (m_lpBI!=NULL) {
		if (::SetDIBitsToDevice(hdc,0,0,m_lpBI->biWidth,m_lpBI->biHeight,0,0,0,m_lpBI->biHeight,
			m_lpBits,(BITMAPINFO*)m_lpBI,DIB_RGB_COLORS)==0) {
			return 1;	//	なんでよー...
		}
		return 0;
	}

	if (m_lpiPicture!=NULL) {
		LONG x,y;
		m_lpiPicture->get_Width(&x);
		m_lpiPicture->get_Height(&y);
		return m_lpiPicture->Render(hdc, 0, 0, sx, sy ,	 0,y,x,-y,NULL)==S_OK ? 0:1;
	}

	if (m_hDLL!=NULL) {
		FreeLocalMemory();
		if (m_pGetPicture((LPSTR)m_lpFile->GetMemory(),(LONG)m_lpFile->GetSize(),1,&m_hBmInfo, &m_hBm,NULL,NULL)!=0){
			ReleasePicture();
			return 1;
		}

		BITMAPINFO*	lpBitmap = (BITMAPINFO*)::LocalLock(m_hBmInfo);
		void*	lpBits		 = (void*)::LocalLock(m_hBm);
		if (::SetDIBitsToDevice(hdc,0,0,sx,sy,0,0,0,sy,lpBits,lpBitmap,DIB_RGB_COLORS)==0) {
			ReleasePicture();
			::LocalUnlock(m_hBmInfo);
			::LocalUnlock(m_hBm);
			FreeLocalMemory();
			return 1;
		}
		::LocalUnlock(m_hBmInfo);
		::LocalUnlock(m_hBm);
		FreeLocalMemory();
		return 0;
	}
	return 1;	//	not loaded
}


//////////////////////////////////////////////////////////////////////////////

// @yo2 0x005328c0 vt
LRESULT	CGraphicLoader::GetPalette(PALETTEENTRY pal[256]){
	if (m_lpBI==NULL) return 1;				//	読み込んでいない
	if (m_lpBI->biBitCount >8) return 2;	//	8bppのグラフィックではない

	// biBitCount == 1 or 4 or 8
	// ScreenColorMode2 == 8 (256Color)
	// ディスプレーモードが256色モードかつ、読み込むビットマップが
	// パレットを使用している場合、自前でパレットを再現する。

	RGBQUAD *lpRGBquad = (RGBQUAD*) ((BYTE*) m_lpBI + sizeof(BITMAPINFOHEADER));

//	DWORD dwFlags;
	int num;
	// これで場所はわかったから...
	switch (m_lpBI->biBitCount){
	case 1: /* dwFlags = DDPCAPS_1BIT; */ num = 2;	 break;
	case 2: /* dwFlags = DDPCAPS_2BIT; */ num = 4;	 break;
	case 4: /* dwFlags = DDPCAPS_4BIT; */ num = 16;	 break;
	case 8: /* dwFlags = DDPCAPS_8BIT; */ num = 236; break; // 256は勘弁ちて:p
//	default: /* dwFlags = 0; */	// おかしいねんけどな
	} // エントリー数を数えて...

	// また、236色パレットというのは、0～235までを使用するのであって、
	// そいつを10～245の範囲にシフトしてやる必要がある
		
	// RGBQUADとPALETTEENTRYとではRとBが入れ替わる！(謎)	
	// よってメンバ単位でのコピーが必要

	// 0～9,246～255は、システムパレット(静的エントリ)
	int i;	// [portable] MSVC6 for-scope: i is used after the loop
	for(i=0;i<10;i++){
		pal[i].peFlags	= PC_EXPLICIT; // このオプションとともに、
		pal[i].peRed	= i; // システムパレットインデックスを指定する
		pal[i].peGreen	= 0;
		pal[i].peBlue	= 0;

		// 0～9,246～255の色の相補性を考慮すれば、足し算ではなくxorするほうが健全
		pal[i ^ 0xff].peFlags	= PC_EXPLICIT;
		pal[i ^ 0xff].peRed		= i ^ 0xff;
		pal[i ^ 0xff].peGreen	= 0;
		pal[i ^ 0xff].peBlue	= 0;
	}

	// ユーザーパレットの設定
	for(i=10;i<10+num;i++) {
		pal[i].peFlags = PC_NOCOLLAPSE | PC_RESERVED;
		// 他のアプリに使われては困るし、変更されても困る
		pal[i].peRed	= lpRGBquad[i-10].rgbRed; // パレットのシフト
		pal[i].peGreen	= lpRGBquad[i-10].rgbGreen;
		pal[i].peBlue	= lpRGBquad[i-10].rgbBlue;
	}

	for(;i<246;i++){ // 一応、うめとこか？
		pal[i].peFlags	= 0; // 何も指定しない
		pal[i].peRed	= 0;
		pal[i].peGreen	= 0;
		pal[i].peBlue	= 0;
	}

	return 0;
}
