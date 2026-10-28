//
//	yaneSoundLoader.h :
//
//		サウンドの統括的ローディング
//

#ifndef __yaneSoundLoader_h__
#define __yaneSoundLoader_h__

#include "yaneLoadCache.h"

class CSound;

class CSoundLoader : public CLoadCache {
public:
	CSound* GetSound(int nNo);				//	サウンドの取得

	CSoundLoader(void);
	virtual ~CSoundLoader();

protected:
	auto_vector_ptr<CSound> m_lpSound;

	//	ひとつの要素に読み込み／解放
	virtual	LRESULT InnerLoad(int nNo);
	virtual LRESULT InnerRelease(int nNo);
	//	m_nMax分だけ配列を確保／解放
	virtual void	InnerCreate(void);
	virtual void	InnerDelete(void);
};

#endif