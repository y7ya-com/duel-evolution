// enraPCMReaderFactory.h
//	"kmPCMstream" Factory
//
//		programmed by		ENRA '01/12/13
//		reprogrammed by		ENRA '02/05/20
//
#pragma once

#include "mtknPCMreader.h"
#include "enraAudioPlugin.h"

class CCriticalSection;
class CPCMReaderFactory
{
public:
	CPCMReaderFactory(){};
	virtual ~CPCMReaderFactory(){};

	// kmPCMstreamÇÃê∂ê¨
	virtual mtknLib::IkmPCMstream*	CreateReader(const string& filename);

	// CAudioPluginÇÃí«â¡
	virtual void	AddPlugin(const string& PluginFilename);
	virtual void	AddPlugin(const smart_ptr<CAudioPlugin>& lpPlugin);

protected:
	static mtknLib::IkmPCMstream*	CreateRAW();
	static mtknLib::IkmPCMstream*	CreateDirectShow(IMultiMediaStream* a_pMMStream=NULL);
	static mtknLib::IkmPCMstream*	CreateACM();

private:
	static set< smart_ptr<CAudioPlugin> >	m_lpAudioPlugin_List;
	static CCriticalSection					m_vCS;
};
