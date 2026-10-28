// yaneMovie
// 2001/3/8 kaine

#ifndef USE_DirectDraw
#ifndef USE_FastDraw
#undef USE_MovieDS
#undef USE_MovieAVI
#endif //end USE_FastDraw
#endif //end USE_DirectDraw

#ifndef USE_DIB32
#undef USE_MovieDS
#undef USE_MovieAVI
#endif

#include "stdafx.h"
#include "yaneMovieBase.h"
#include "yaneMovie.h"
#include "yaneMovieDS.h"
#include "yaneMovieAVI.h"

class CMovieNull;

int	CMovie::m_nMovieType = 
#ifdef USE_MovieDS
	1;
#else
	#ifdef USE_MovieAVI
		2;
//	#else
//		#ifdef USE_MovieMCI
//			3;
	#else
		0;
	#endif
#endif

// @yo2 0x00543230 review
CMovie::CMovie(void){
	CreateInstance(this);
}

// @yo2 0x00543600 vt
CMovie::~CMovie(){
}

// @yo2 0x00543680 review
void	CMovie::CreateInstance(CMovie* t){
	switch (m_nMovieType) {
	case 0 : t->m_lpMovie.Add(new CMovieNull); break;
#ifdef USE_MovieDS
	case 1 : {
		t->m_lpMovie.Add(new CMovieDS);
		if ( ! ( (CMovieDS*)(CMovieBase*)t->m_lpMovie)->CanUseDirectShow() ){
		#ifdef USE_MovieAVI
			t->m_lpMovie.Add(new CMovieAVI);
		#else
//			#ifdef USE_MovieMCI
//			t->m_lpMovie.Add(new CMovieMCI);
//			#else
			t->m_lpMovie.Add(new CMovieNull);
//			#endif
		#endif
		}
		break;
		}
#endif
#ifdef USE_MovieAVI
		case 2 : t->m_lpMovie.Add(new CMovieAVI); break;
#endif
//#ifdef USE_MovieMCI
//		case 3 : t->m_lpMovie.Add(new CMovieMCI); break;
//#endif
	default: WARNING(true,"CMovie::CMovie‚ÅÄ¶–@‚Ì¶¬");
	}
}

