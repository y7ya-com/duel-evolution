#pragma once
namespace mtknLib {

class IkmWaveFileReader
{
	virtual bool close()=0;
	virtual bool open(const char *filename)=0;

	static class IkmWaveFileReader* createMMIO();
	static class IkmWaveFileReader* createMP3();

public:
	static class IkmWaveFileReader* create(const char *filename);
	virtual ~IkmWaveFileReader(){}

	virtual LONG read(BYTE *buf,DWORD size)=0;
	virtual int seekToTop()=0;
	virtual int seek(LONG pos)=0;
	virtual LONG GetCurrentPos(void)=0;
	
	virtual WAVEFORMATEX *getWaveFormat()=0;
	virtual DWORD		  getFileSize() const=0;
};

};