// enraAudioPlugin.cpp

#include "stdafx.h"
#include "mtknPcmreader.h"
#include "yaneFile.h"
#include "enraAudioPlugin.h"

bool operator < ( const smart_ptr<CAudioPlugin>& l, const smart_ptr<CAudioPlugin>& r)
{
	// filename‚Å”»•Ê‚µ‚æ‚¤^^;
	return (l->GetFilename()) < (r->GetFilename());
}

// @yo2 0x004234e0 cg
CAudioPlugin::CAudioPlugin(const string& strPluginFilename)
{
	InitPlugin(strPluginFilename);
}

// @yo2 0x00423590 vt
CAudioPlugin::~CAudioPlugin()
{
	ReleasePlugin();
}

// @yo2 0x00423620 feat
void CAudioPlugin::InitPlugin(const string& strPluginFilename)
{
	// ‰Šú‰»
	ReleasePlugin();
	m_strFilename = CFile::MakeFullName(strPluginFilename);
	// DLL‚ğ“Ç‚İ‚Ş
	m_hDll = ::LoadLibrary(m_strFilename.c_str());
	if(m_hDll==NULL){
		Err.Out("CAudioPlugin::InitPlugin \"%s\"‚Ìƒ[ƒh‚É¸”s", m_strFilename.c_str());
	}
}

// @yo2 0x004236f0 feat
void CAudioPlugin::ReleasePlugin()
{
	// Dll‚ÌŠJ•ú
	if(m_hDll!=NULL){
		::FreeLibrary(m_hDll);
		m_hDll = NULL;
	}
}

// @yo2 0x00423720 feat
mtknLib::IkmPCMstream* CAudioPlugin::QueryInterface()
{
	// DLL‚ÌŠÖ”‚ğæ“¾‚·‚é
	if(m_hDll==NULL){ return NULL; }
	typedef void (WINAPI *Func)(LPVOID*,LPCSTR);
	Func CreateInstance = (Func)::GetProcAddress(m_hDll, "CreateInstance");
	if(CreateInstance==NULL){ return NULL; }

	// DLL“à‚ÌReader‚ğæ“¾‚·‚é
	LPVOID lp = NULL;
	CreateInstance(&lp, "AudioReaderPlugin");
	return (mtknLib::IkmPCMstream*)lp;
}

