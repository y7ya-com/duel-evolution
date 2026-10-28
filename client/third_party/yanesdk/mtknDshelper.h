#pragma once
namespace mtknLib {
class IkmStreamSoundHelper
{
public:
	static IkmStreamSoundHelper *create(
			class CDirectSound *a_cds,
			class IkmPCMstream *a_reader
		);
	virtual ~IkmStreamSoundHelper(){}

	virtual bool init()=0;
	virtual struct IDirectSoundBuffer *CreateDirectSoundBuffer(int time)=0;

	virtual DWORD UpdateDirectSound( DWORD size)=0;

	virtual DWORD getWritepos()=0;
	virtual bool setPos( DWORD pos)=0;
	virtual DWORD getBufferSize()=0;
	virtual LRESULT ClearDSBuffer(void)=0;

};
};