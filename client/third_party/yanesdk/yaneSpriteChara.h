//	yaneSpriteChara.h :
//
//		Sprite Character Manager
//		programmed by yaneurao '00/07/20
//

#ifndef __yaneSpriteChara_h__
#define __yaneSpriteChara_h__

#include "yaneSprite.h"

typedef auto_vector_ptr<CPlaneBase> CPlaneList;

class CSpriteChara {
public:
	//	キャラパターン定義ファイルをテキストファイルから読み込む
	LRESULT	Load(LPSTR szFileName);		//	CPlane,CDIB32に読み込む
	void	Release(void);	//	解放

	CSpriteBase*	GetSprite(void) { return m_lpSprite; }
	//	スプライトを得ることはあっても、プレーンを得ることは無いだろう...

	int		GetSpriteMax(void) { return m_nSpriteMax; }

	CSpriteChara(void);
	virtual ~CSpriteChara();

protected:
	auto_array<CSpriteBase>	m_lpSprite;
	CPlaneList		m_lpPlaneList;
	int				m_nSpriteMax;	//	m_lpSpriteで確保された数
};

#endif
