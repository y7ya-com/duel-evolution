//
//	yaneSpriteLoader.h :
//
//		スプライトの統括的ローディング
//

#ifndef __yaneSpriteLoader_h__
#define __yaneSpriteLoader_h__

#include "yaneLoadCache.h"

class CSpriteBase;
class CSpriteChara;

class CSpriteLoader : public CLoadCache {
public:
	CSpriteBase*GetSprite(int nNo);					//	スプライトの取得

	CSpriteLoader(void);
	virtual ~CSpriteLoader();

protected:
	auto_array<CSpriteChara> m_lpChara;

	//	ひとつの要素に読み込み／解放
	virtual	LRESULT InnerLoad(int nNo);
	virtual LRESULT InnerRelease(int nNo);
	//	m_nMax分だけ配列を確保／解放
	virtual void	InnerCreate(void);
	virtual void	InnerDelete(void);
};

#endif
