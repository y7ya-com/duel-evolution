#include "stdafx.h"
#include "mtknWave.h"
#include "yaneFile.h"

namespace mtknLib {

class kmMmioFile : public virtual IkmWaveFileReader
{
	std::string m_filename;
	// [Konami] removed: HMMIO hmmio; (the file is now parsed through a stream-mode CFile)
	DWORD dwDataLen;
	WAVEFORMATEX  *m_pWaveFormat;
	LONG dwDataPos;
	CFile m_file;

public:
	kmMmioFile() 
		: m_pWaveFormat(NULL)
		// [Konami] removed: ,hmmio(NULL)
	{}

	~kmMmioFile(){close();}

	WAVEFORMATEX *getWaveFormat()
	{
		// [Konami] removed: if(!hmmio) return NULL;
		return m_pWaveFormat;
	}

	bool close(){
		// [Konami] rewritten for the stream-mode CFile
		m_file.Close();
		if(m_pWaveFormat){
			free(m_pWaveFormat);
			m_pWaveFormat = NULL;
		}
		return true;
	}
	bool open(const char *filename){
		m_filename=filename;
		// [Konami] rewritten: the RIFF/WAVE chunks are read straight from a stream-mode CFile
		//          (fopen "rb") instead of reading the whole file into memory and using mmio
		if (m_file.Open(m_filename,"rb")) {
			Err.Out("kmMmioFile::open " + m_filename + "のファイル読み込み時のエラー");
			return 1; // ファイル読み込みエラー
		}
		DWORD dwID;
		DWORD dwSize;
		m_file.ReadData((BYTE*)&dwID,4);
		if (dwID != mmioFOURCC('R','I','F','F')){
			m_file.Close();
			return false;
		}
		m_file.ReadData((BYTE*)&dwSize,4);
		m_file.ReadData((BYTE*)&dwID,4);
		if (dwID != mmioFOURCC('W','A','V','E')){
			m_file.Close();
			return false;
		}
		for(;;){
			m_file.ReadData((BYTE*)&dwID,4);
			m_file.ReadData((BYTE*)&dwSize,4);
			if (dwID == mmioFOURCC('f','m','t',' ')){
				m_pWaveFormat = (WAVEFORMATEX*)calloc(1, max(sizeof(WAVEFORMATEX),(size_t)dwSize) );
				m_file.ReadData((BYTE*)m_pWaveFormat,dwSize);
				if(m_pWaveFormat->cbSize ==0 )
					m_pWaveFormat->cbSize=sizeof(WAVEFORMATEX);
			} else if (dwID == mmioFOURCC('d','a','t','a')){
				break;
			} else {
				m_file.Seek(dwSize);	//	知らないチャンクは読み飛ばす
			}
		}
		dwDataLen = dwSize; // データサイズ
		dwDataPos = m_file.Tell();
		return m_pWaveFormat!=NULL && dwDataLen!=0;
		// [Konami] removed: the upstream body (CFile::Read into memory, mmioOpen(FOURCC_MEM),
		//          mmioDescend RIFF/'fmt '/'data', dwDataPos=mmioSeek(hmmio,0,SEEK_CUR))
	}
	virtual DWORD		  getFileSize() const
	{	
		return dwDataLen;
	}
	
	// [Konami] read/seekToTop/seek/GetCurrentPos now go through the stream-mode CFile
	LONG read(BYTE *buf,DWORD size)
	{
		return m_file.ReadData(buf,size);
	}

	virtual int seekToTop()
	{
		m_file.Reset();
		return m_file.Seek(dwDataPos);

	}

	virtual int seek(LONG pos)
	{
		return m_file.Seek(pos);
	}

	virtual LONG GetCurrentPos(void)
	{
		return m_file.Tell()-dwDataPos;
	}
	/*
	virtual LRESULT SetCurrentPos(LONG lPos)
	{
		if ( !hmmio ) return -1;
		seek(
		return mmioSeek(hmmio,lPos+dwDataPos,SEEK_SET);
	}
	*/

};

// @yo2 0x00428c50 review
IkmWaveFileReader* IkmWaveFileReader::createMMIO()
{
	return new kmMmioFile;
}
};