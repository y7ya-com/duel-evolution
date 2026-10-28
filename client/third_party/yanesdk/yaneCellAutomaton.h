//
//	Fadeå^ÇÃblt
//
#ifdef USE_DIB32

#ifndef __yaneCellAutomaton_h__
#define __yaneCellAutomaton_h__

#include "yaneDIB32.h"

class CCellAutomaton {
public:
	static void UpFade(CDIB32* lpSrc,LPRECT lpRect=NULL);
	static void DownFade(CDIB32* lpSrc,LPRECT lpRect=NULL);
	static void LeftFade(CDIB32* lpSrc,LPRECT lpRect=NULL);
	static void RightFade(CDIB32* lpSrc,LPRECT lpRect=NULL);


};

#endif

#endif // USE_DIB32
