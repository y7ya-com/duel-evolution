#include "stdafx.h"

#include "mtknPCMReader.h"
#include "enraAudioPlugin.h"
#include "enraPCMReaderFactory.h"
#include "yaneFile.h"
#include "yaneCriticalSection.h"

set< smart_ptr<CAudioPlugin> >	CPCMReaderFactory::m_lpAudioPlugin_List;
CCriticalSection				CPCMReaderFactory::m_vCS;

// @yo2 0x004241a0 vt
mtknLib::IkmPCMstream* CPCMReaderFactory::CreateReader(const string& filename)
{
	//	CFile経由で読む事を前提にさせる
	LPCSTR szFilename = filename.c_str();

	{	// PluginLoaderからReader interfaceを取得して、openする
		set< smart_ptr<CAudioPlugin> >::iterator it		= m_lpAudioPlugin_List.begin();
		set< smart_ptr<CAudioPlugin> >::iterator itEnd	= m_lpAudioPlugin_List.end();
		while (it!=itEnd){
			mtknLib::IkmPCMstream* f = (*it)->QueryInterface();
			if (f && f->Open(szFilename)){ return f; }
			if (f!=NULL){ f->DeleteSelf(); }
			++it;
		}
	}

	{	// mmioによるwaveファイルのopen
		mtknLib::IkmPCMstream* f = CreateRAW();
		if (f && f->Open(szFilename)){ return f; }
		if (f!=NULL){ f->DeleteSelf(); }
	}

	#if 1
	{	// DirectShowFilterによる各種ファイルのopen
		mtknLib::IkmPCMstream* f = CreateDirectShow();
		if (f && f->Open(szFilename)){ return f; }
		if (f!=NULL){ f->DeleteSelf(); }
	}
	#endif

	#if 1
	{	// ACMによる各種ファイル(mp3,aiff,...etc)のopen
		mtknLib::IkmPCMstream* f = CreateACM();
		if (f && f->Open(szFilename)){ return f; }
		if (f!=NULL){ f->DeleteSelf(); }
	}
	#endif

	Err.Out("CPCMReaderFactory::CreateReader Openできない-%s", szFilename);
	return NULL;
}

// @yo2 0x00424300 vt
void CPCMReaderFactory::AddPlugin(const string& strPluginFilename)
{
	//	マルチスレッド対応～
	m_vCS.Enter();
	AddPlugin(smart_ptr<CAudioPlugin>(new CAudioPlugin(strPluginFilename),true));
	m_vCS.Leave();
}

// @yo2 0x00424440 vt
void CPCMReaderFactory::AddPlugin(const smart_ptr<CAudioPlugin>& lpPlugin)
{
	//	マルチスレッド対応～
	m_vCS.Enter();
	m_lpAudioPlugin_List.insert(lpPlugin);
	m_vCS.Leave();
}
