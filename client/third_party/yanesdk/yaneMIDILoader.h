//
//	yaneMIDILoader.h :
//
//		MIDIの統括的ローディング
//

#ifndef __yaneMIDILoader_h__
#define __yaneMIDILoader_h__

#include "yaneLoadCache.h"

class CMIDIOutput;

class CMIDILoader : public CLoadCache {
public:
	CMIDIOutput* GetMIDI(int nNo);				//	サウンドの取得

	CMIDILoader(void);
	virtual ~CMIDILoader();

protected:
	auto_vector_ptr<CMIDIOutput>	m_lpSound;

	//	ひとつの要素に読み込み／解放
	virtual	LRESULT InnerLoad(int nNo);
	virtual LRESULT InnerRelease(int nNo);
	//	m_nMax分だけ配列を確保／解放
	virtual void	InnerCreate(void);
	virtual void	InnerDelete(void);
};

#endif