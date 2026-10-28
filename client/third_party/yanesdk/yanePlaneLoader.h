//
//	yanePlaneLoader.h :
//
//		プレーンの統括的ローディング
//

#ifndef __yanePlaneLoader_h__
#define __yanePlaneLoader_h__

#include "yaneLoadCache.h"

class CPlane;
class CDIB32;
class CDIB32YGA;
class CFastPlane;
class CPlaneBase;

class CPlaneLoaderBasePre : public CLoadCache {
public:
	virtual	CPlaneBase* GetPlaneBase(int nNo) = 0;
	virtual void SetColorKey(int r,int g,int b) = 0;
};
//	テンプレートによって生成されたクラスをベーステンプレートに
//	差し戻す変換が出来無いので、こういうことをしなくてはならなくなる。
//	※　テンプレート化された、CPlaneLoader、CDIB32Loaderの基底クラスは、
//	このクラスである。

template <class T>
class CPlaneLoaderBase : public CPlaneLoaderBasePre {
public:
	T* GetPlane(int nNo);				//	プレーンの取得
	CPlaneBase* GetPlaneBase(int nNo);

	CPlaneLoaderBase(void);
	virtual ~CPlaneLoaderBase();
	virtual void SetColorKey(int r,int g,int b){
		m_bColorKey = true;
		m_nR = r; m_nG = g; m_nB = b;
	};

protected:
	auto_vector_ptr<T>	m_lpPlane;
	bool m_bColorKey;
	int m_nR,m_nG,m_nB;

	//	ひとつの要素に読み込み／解放
	virtual	LRESULT InnerLoad(int nNo);
	virtual LRESULT InnerRelease(int nNo);
	//	m_nMax分だけ配列を確保／解放
	virtual void	InnerCreate(void);
	virtual void	InnerDelete(void);
};

#include "yanePlaneLoader.h"
#include "yanePlane.h"
#include "yaneDIB32.h"
#include "yaneFastPlane.h"

//////////////////////////////////////////////////////////////////////////////
//	テンプレート化したので実体も読み込まなくてはならない

template <class T>
CPlaneLoaderBase<T>::CPlaneLoaderBase(void){
	m_bColorKey = false;
	m_nR = m_nG = m_nB = 0;
}

template <class T>
CPlaneLoaderBase<T>::~CPlaneLoaderBase(){
	InnerDelete();	//	これは、こちらのデストラクタで行なう必要あり
}

template <class T>
void		CPlaneLoaderBase<T>::InnerCreate(void){
	m_lpPlane.resize(m_nMax);
}

template <class T>
void		CPlaneLoaderBase<T>::InnerDelete(void){
	ReleaseAll();	//	こいつで全解放する
	m_lpPlane.clear();
}

//////////////////////////////////////////////////////////////////////////////

template <class T>
T*	CPlaneLoaderBase<T>::GetPlane(int nNo){
	//	置換するかも
	m_vLoadCacheListener->OnLoad(nNo);

	WARNING(nNo >= m_nMax,"CPlaneLoader::GetPlaneで範囲外");

	LRESULT hr;
	hr = Load(nNo);			//	読み込んでいなければここで読み込む必要あり
	if (hr) {
		
#ifdef _DEBUG
		CHAR szBuf[_MAX_PATH];
		::wsprintf(szBuf,"CPlaneLoaderBase::GetPlaneでファイル読み込みに失敗\n⇒ %s"
			,m_lpSLOAD_CACHE[nNo].lpszFilename);
		WARNING(true,szBuf);
#endif
	//		return NULL;	//	だめだこりゃ＾＾
	//	失敗しても正規のポインタを返しておかないと不正な呼び出しになる...
	}

	m_lpnStaleTime[nNo] = 0;	//	使用したでフラグをＯｎ＾＾；
	return m_lpPlane[nNo];
}

template <class T>
CPlaneBase*	CPlaneLoaderBase<T>::GetPlaneBase(int nNo){
	//	置換するかも
	m_vLoadCacheListener->OnLoad(nNo);

	WARNING(nNo >= m_nMax,"CPlaneLoader::GetPlaneBaseで範囲外");

	LRESULT hr;
	hr = Load(nNo);			//	読み込んでいなければここで読み込む必要あり
	if (hr) {
		WARNING(true,"CPlaneLoaderBase::GetPlaneBaseでファイル読み込みに失敗");
//		return NULL;	//	だめだこりゃ＾＾
	//	失敗しても正規のポインタを返しておかないと不正な呼び出しになる...
	}

	m_lpnStaleTime[nNo] = 0;	//	使用したでフラグをＯｎ＾＾；
	return m_lpPlane[nNo];		//	このアップキャストはlegalなはず…
}

//////////////////////////////////////////////////////////////////////////////

template <class T>
LRESULT		CPlaneLoaderBase<T>::InnerLoad(int nNo){
	WARNING(m_lpPlane[nNo]!=NULL,"CPlaneLoader::InnerLoadでm_lpPlane[nNo]!=NULL");
	m_lpPlane[nNo].Add();			//	プレーン作成して読み込み
	HRESULT hr = m_lpPlane[nNo]->Load(m_lpSLOAD_CACHE[nNo].lpszFilename);
	if ( hr!=0 ){

/*	//	画像データが無いときはエラーにしてまう．．（デバッグ用）
#ifdef _DEBUG
		CHAR szErr[1024];
		::wsprintf(szErr,"fail,CPlaneLoaderBase::InnerLoad(%d,%s)",nNo,m_lpSLOAD_CACHE[nNo].lpszFilename);
		WARNING(true,szErr);
#endif
*/
	}
	if ( m_bColorKey ){
		m_lpPlane[nNo]->SetColorKey(m_nR,m_nG,m_nB);
	}
	return hr;
}

template <class T>
LRESULT		CPlaneLoaderBase<T>::InnerRelease(int nNo){
	m_lpPlane[nNo].Delete();		//	解放しちまう
	return 0;
}

//////////////////////////////////////////////////////////////////////////////

//	テンプレート化
typedef CPlaneLoaderBase<CPlane> CPlaneLoader;
typedef CPlaneLoaderBase<CDIB32> CDIB32Loader;
typedef CPlaneLoaderBase<CFastPlane> CFastPlaneLoader;

#endif
