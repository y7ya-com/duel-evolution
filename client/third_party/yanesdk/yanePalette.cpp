#include "stdafx.h"
#include "yanePalette.h"

//////////////////////////////////////////////////////////////////////////////

// @yo2? 0x00544b80 order
CPalette::CPalette(void){
}

// @yo2 0x00544bd0 vt
CPalette::~CPalette(){
}


// @yo2 0x00544bf0 review
LPPALETTEENTRY CPalette::GetPalette(void) { return &m_pal[0]; }

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00544c10 manual
LRESULT	CPalette::Get(HDC hdc){	//	PaletteÇéÊìæ
//	if (::GetSystemPaletteEntries(hdc,0,256,&m_pal[0])==0) return 1;
	return 0;
}

// @yo2 0x00544c30 review
LRESULT	CPalette::Set(HDC hdc){	//	PaletteÇê›íË
//	if (::SetPaletteEntries(hdc,0,256,&m_pal[0])==0) return 1;
	return 0;
}

/*
HPALETTE SelectPalette(
  HDC hdc, // handle of device context
  HPALETTE hpal, // handle of logical color palette
  BOOL bForceBackground // foreground/background mode
);
*/

//////////////////////////////////////////////////////////////////////////////

