#include "stdafx.h"
#include "yaneMapIO.h"

//////////////////////////////////////////////////////////////////////////////
//	Ｔ企画用のマップ入出力クラス
//////////////////////////////////////////////////////////////////////////////
// @yo2 0x0053c0f0 review
LRESULT	CMapIO::Write(LPSTR filename){
	return m_file.Write(filename,m_lpTMap,
		sizeof(TMapFileHeader)+
		sizeof(TMapChip)*(m_lpTMap->Header.dwMapX)*(m_lpTMap->Header.dwMapY));
}

// @yo2 0x0053c220 cg
LRESULT	CMapIO::Read(LPSTR filename){
	if (m_file.Read(filename)) {
		Release();
		m_bMyMap = false;
		return 1;
	}
	
	m_lpTMap = (TMap*)m_file.GetMemory();
	m_bMyMap = false; // これはCFileが保持しているメモリ
	
	if (m_lpTMap ->Header.dwTitle != 0x50414D34) {	// これちゃうやつやんか！
		m_bMyMap = false;
		Release();	// こうしておかないと、間違ってdeleteする
		return 2;
	}

	return 0;
}

// @yo2 0x0053c390 tight
void	CMapIO::Create(int x,int y){
	Release();
	DWORD size = sizeof(TMapFileHeader)+sizeof(TMapChip)*x*y;
	m_lpTMap = (TMap*)new BYTE[size];
	FillMemory(m_lpTMap,size,0xff); // -1
	m_lpTMap->Header.dwTitle = 0x50414D34; // TMA4
	m_lpTMap->Header.dwMapX = x;
	m_lpTMap->Header.dwMapY = y;
	m_lpTMap->Header.dwMapCX = 16; // とりあえずだよ
	m_lpTMap->Header.dwMapCY = 16;

	m_lpTMap->Header.dwBankNo[0] = 0;
	for(int i=1;i<32;i++){
		m_lpTMap->Header.dwBankNo[i] = 0; // -1
	}

	//	高さはリセットしとこかー
	for(int j=0;j<y;j++){
		for(int i=0;i<x;i++){
			m_lpTMap->Chip[i+j*x].dwHeight	= 0;
			m_lpTMap->Chip[i+j*x].nBankNo[0]= 0;
			m_lpTMap->Chip[i+j*x].nBankNo[1]= 0;
			m_lpTMap->Chip[i+j*x].nBankNo[2]= 0;
			m_lpTMap->Chip[i+j*x].nBankNo[3]= 0;
		}
	}

	m_bMyMap = true;	// これは、newしたメモリ
}

// @yo2 0x0053c4d0 cg
void CMapIO::Release(void){
	if (m_bMyMap) {
		DELETEPTR_SAFE(m_lpTMap);
	} else {
		m_file.Close();
		m_lpTMap=NULL;
	}
}

// @yo2 0x0053c520 review
CMapIO::CMapIO(void){
	m_lpTMap = NULL;
	m_bMyMap = true;
}

// @yo2 0x0053c580 vt
CMapIO::~CMapIO(){
	Release();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0053c5f0 review
LRESULT CMapIO::Resize(int x,int y){
// 右と下を削るようなResize
	DWORD size = sizeof(TMapFileHeader)+sizeof(TMapChip)*x*y;
	TMap* lpTMap;
	lpTMap = (TMap*)new BYTE[size];
//	FillMemory(lpTMap,size,0xff); // -1
	lpTMap->Header.dwTitle = m_lpTMap->Header.dwTitle;
	{for(int i=0;i<32;i++){
		lpTMap->Header.dwBankNo[i] = m_lpTMap->Header.dwBankNo[i];
	}}
	lpTMap->Header.dwMapX = x;
	lpTMap->Header.dwMapY = y;
	lpTMap->Header.dwMapCX = m_lpTMap->Header.dwMapCX;
	lpTMap->Header.dwMapCY = m_lpTMap->Header.dwMapCY;

	// 出来る限り、コピー
	for(int j=0;j<y;j++){
		for(int i=0;i<x;i++){
//			if (i<m_lpTMap->Header.dwMapCX && j<m_lpTMap->Header.dwMapCY) {
			if (i<m_lpTMap->Header.dwMapX && j<m_lpTMap->Header.dwMapY) {	//	fixed '00/01/03
//				lpTMap->Chip[i + j*x] = m_lpTMap->Chip[i + j*x];
				lpTMap->Chip[i + j*x] = m_lpTMap->Chip[i + j*m_lpTMap->Header.dwMapX];	//	fixed '00/01/03
			} else {
				lpTMap->Chip[i + j*x].dwDownchip	= -1; // unsignedに-1で良いのか？
				lpTMap->Chip[i + j*x].dwMiddlechip	= -1;
				lpTMap->Chip[i + j*x].dwUpperchip	= -1;
				lpTMap->Chip[i + j*x].dwHeight		= 0;
				lpTMap->Chip[i + j*x].hit			= -1;
				lpTMap->Chip[i + j*x].nBankNo[0]	= 0;
				lpTMap->Chip[i + j*x].nBankNo[1]	= 0;
				lpTMap->Chip[i + j*x].nBankNo[2]	= 0;
				lpTMap->Chip[i + j*x].nBankNo[3]	= 0;
			}
		}
	}

	Release();

	m_bMyMap = true;	// これは、newしたメモリ！
	m_lpTMap = lpTMap;
	return 0;
}

// @yo2 0x0053c7d0 review
LRESULT	CMapIO::Resize(int cx,int cy,int vx,int vy){ // 複雑なResize
	if (m_lpTMap==NULL) return 1; // よぶなっちゅーに！

	// 現在のマップをベクトル(vx,vy)だけリサイズして、(cx,cy)方向にコピー！
	int mapx,mapy;
	mapx = m_lpTMap->Header.dwMapX;
	mapy = m_lpTMap->Header.dwMapY;
	mapx += vx;
	mapy += vy;
	if (mapx <= 0 || mapy <= 0) return 1; // そんなResizeでけへんがな
	
	DWORD size = sizeof(TMapFileHeader)+sizeof(TMapChip)*mapx*mapy;
	TMap* lpTMap;
	lpTMap = (TMap*)new BYTE[size];

	lpTMap->Header.dwTitle = m_lpTMap->Header.dwTitle;
	{for(int i=0;i<32;i++){
		lpTMap->Header.dwBankNo[i] = m_lpTMap->Header.dwBankNo[i];
	}}
	lpTMap->Header.dwMapX = mapx;
	lpTMap->Header.dwMapY = mapy;
	lpTMap->Header.dwMapCX = m_lpTMap->Header.dwMapCX;
	lpTMap->Header.dwMapCY = m_lpTMap->Header.dwMapCY;

	// 出来る限り、コピー
	int i,j;
	for(j=0;j<mapy;j++){
		for(i=0;i<mapx;i++){
				lpTMap->Chip[i + j*mapx].dwDownchip		= -1; // unsignedに-1で良いのか？
				lpTMap->Chip[i + j*mapx].dwMiddlechip	= -1;
				lpTMap->Chip[i + j*mapx].dwUpperchip	= -1;
				lpTMap->Chip[i + j*mapx].dwHeight		= 0;
				lpTMap->Chip[i + j*mapx].hit			= -1;
				lpTMap->Chip[i + j*mapx].nBankNo[0]		= 0;
				lpTMap->Chip[i + j*mapx].nBankNo[1]		= 0;
				lpTMap->Chip[i + j*mapx].nBankNo[2]		= 0;
				lpTMap->Chip[i + j*mapx].nBankNo[3]		= 0;
		}
	}
	int mapxx,mapyy;
	for (j=0;j<m_lpTMap->Header.dwMapY;j++){
		for(i=0;i<m_lpTMap->Header.dwMapX;i++){
			mapxx = i + cx;	// 移動変換先が範囲内ならばコピー！
			mapyy = j + cy;
			if (mapxx>=0 && mapyy >=0 &&
				mapxx<mapx && mapyy < mapy) {
				lpTMap->Chip[mapxx + mapyy*mapx] =
					m_lpTMap->Chip[i + j*m_lpTMap->Header.dwMapX];
			}
		}
	}

	Release();

	m_bMyMap = true;	// これは、newしたメモリ！
	m_lpTMap = lpTMap;

	return 0;
}

//////////////////////////////////////////////////////////////////////////////

// TMapIOでマップを作るサンプル
	/*
	TMapIO tmap;
	tmap.CreateMap(100,100);
	tmap.GetTMap()->Header.dwMapCX = 32;
	tmap.GetTMap()->Header.dwMapCY = 32;
	tmap.GetTMap()->Header.dwBankNo = 0;
	for(int y=0;y<99;y++){
		for(int x=0;x<100;x++){
			if (y&4 || (x+y)%5 ==0) {
				tmap.GetTMap()->Chip[x+y*100].dwDownchip		= 0;
				tmap.GetTMap()->Chip[x+y*100+100].dwUpperchip	= 256;
			}
		}
	}
	tmap.Write("TestMap2.bin");
	*/
