#include "stdafx.h"
#include "mtknWave.h"

namespace mtknLib {

class kmMp3File : public virtual IkmWaveFileReader
{
	bool isOpen;
	bool hasTag;
	HANDLE hFile;
	MPEGLAYER3WAVEFORMAT WFormat;
	DWORD availSize;
	DWORD dwDataLen;
	DWORD dwSkipLen;	// add kaine 01/04/06
						// データ先頭を指す
public:
	virtual bool close()
	{
		if(!isOpen)
			return false;
		::CloseHandle(hFile);
		isOpen=false;
		return true;
	}
	virtual bool open( const char *filename );
	
	virtual LONG read( BYTE *buf,DWORD bs )
	{
		DWORD NumberOfBytesRead;
		DWORD bufsize=bs;
		if (
			!::ReadFile(hFile, buf, min(availSize,bufsize ), 
						&NumberOfBytesRead,NULL)
			){
			Err.Out("kmMp3File::readでファイル読み込みに失敗.%x",GetLastError());
			return 0; // ファイルの読み込みに失敗。
		}
		availSize -= NumberOfBytesRead;
		return LONG(NumberOfBytesRead);
	}
	virtual int seekToTop()	// fix kaine 01/04/07
	{
		if(!isOpen)
			return -1;
		::SetFilePointer(hFile,dwSkipLen,0,FILE_BEGIN);
//		availSize = ::GetFileSize(hFile,NULL)-4;
		availSize = dwDataLen;
//		if(hasTag)
//			availSize -= 128;
		return 0;
	}

	virtual int seek(LONG pos)
	{
		if(pos == 0)
			return 0;
		if(!isOpen)
			return -1;
		availSize -= pos;
		return ::SetFilePointer(hFile,pos,0,FILE_CURRENT);
		//	相対位置になっているが大抵seekToTop()を呼んでいるようなので問題にはなっていないらしい...
	}

	virtual LONG GetCurrentPos(void)	// byte;
	{
		return ::SetFilePointer(hFile,0,0,FILE_CURRENT) - dwSkipLen;
	}

	kmMp3File()
	{
		hFile=NULL;
		hasTag=false;
		isOpen=false;
	}
	~kmMp3File(){
		close();
	}
	
	virtual DWORD		  getFileSize() const
	{	return dwDataLen;	}

	WAVEFORMATEX* getWaveFormat(){
		return reinterpret_cast<WAVEFORMATEX*>(&WFormat);
	}

};


// @yo2 0x00429870 feat
bool kmMp3File::open(const char *filename)
{	//	直接MP3のファイルとかをオープン:p
	hFile = ::CreateFile(filename,
		GENERIC_READ,		// Read
		FILE_SHARE_READ,	// ReadOpenなら共有を許すのはマナー 
		NULL,				// security
		OPEN_EXISTING,		// 存在してなければエラー
		FILE_ATTRIBUTE_NORMAL,	//	ファイル属性
		NULL				// テンプレートファイル
	);
	if(hFile == INVALID_HANDLE_VALUE)
		return false;

	availSize = ::GetFileSize(hFile,NULL);
	dwSkipLen = 0;
	if (availSize <= 128) {
		CloseHandle(hFile);
		return false; // そんな小さいわけあらへんがな:p
	}

	BYTE src[10];	//	ID3v2タグのために4→10に変更(yane '01/02/16)

	DWORD NumberOfBytesRead;
	if (!::ReadFile(hFile,src,10,&NumberOfBytesRead,NULL)){
		CloseHandle(hFile); // あれま...
		Err.Out("kmMp3Fileでファイル読み込みに失敗");
		return false; // ファイルの読み込みに失敗。
	}
	//	フレームヘッダからWAVEFORMATEXのデータを用意する

	//  ID3v2タグがついているならば、読み飛ばす
	if ((src[0] == 'I') && (src[1] == 'D') && (src[2] == '3')) {
		DWORD dwID3Size = src[9] + (src[8]<<7) + (src[7]<<14) + (src[6]<<21);
		
		// バージョンチェック
		if(src[3]>=0x04)
		{
			// ID3v2.4.0以降
			if(src[5]&0x10){	// フッタの有無
				dwID3Size+=20; // フッタあり
			}else{
				dwID3Size+=10; // フッタなし
			}
		}else{
			// ID3v2.3.0以前
			dwID3Size+=10; // フッタなし
		}

		if (availSize <= dwID3Size + 128) return 1;

		//	ID3v2ヘッダは可変長サイズ(http://www.id3.org/)

		//	これでええんかな？
		::SetFilePointer(hFile,dwID3Size,0,FILE_BEGIN) ;
		if (!::ReadFile(hFile,src,4,&NumberOfBytesRead,NULL)){
			CloseHandle(hFile); // あれま...
			Err.Out("kmMp3Fileでファイル読み込みに失敗");
			return false; // ファイルの読み込みに失敗。
		}

//		src += dwID3Size;
		//	↑bufを読み直したので不要
		availSize -= dwID3Size;
		dwSkipLen += dwID3Size;
	}

	//	MP3チェック
	if (  src[0] !=0xff ){CloseHandle(hFile);		return false;}
	if (!(src[1] & 0xf8)){CloseHandle(hFile);		return false;}

	int	anBitrate[2][3][16] = {
		{
		// MPEG-1
			{ 0,32,64,96,128,160,192,224,256,288,320,352,384,416,448,0 },	//	32000Hz(layer1)
			{ 0,32,48,56, 64, 80, 96,112,128,160,192,224,256,320,384,0 },	//	44100Hz(layer2)
			{ 0,32,40,48, 56, 64, 80, 96,112,128,160,192,224,256,320,0 },	//	48000Hz(layer3)
		},
		{
		// MPEG-2
			{ 0,32,48,56, 64, 80, 96,112,128,144,160,176,192,224,256,0 },	//	32000Hz(layer1)
			{ 0, 8,16,24, 32, 40, 48, 56, 64, 80, 96,112,128,144,160,0 },	//	44100Hz(layer2)
			{ 0, 8,16,24, 32, 40, 48, 56, 64, 80, 96,112,128,144,160,0 },	//	48000Hz(layer3)
		},
	};
	int anFreq[2][4] = {
		{ 44100,48000,32000,0 },
		{ 22050,24000,16000,0 },
	};

	int nLayer		= 4-((src[1] >> 1) & 3);
	if (nLayer == 4) {
		Err.Out("kmMp3File::Open MP3が無効なレイヤ");
		CloseHandle(hFile);
		return false;
	}
	
	int nMpeg		= ((src[1] & 8) == 0) ? 1 : 0;
	int nBitrate	= anBitrate[nMpeg][nLayer-1][ src[2]>>4 ];
	int nFreq		= anFreq[nMpeg][(src[2] >> 2) & 3];
	int nChannel	= ((src[3] >> 6) == 3) ? 1 : 2;
	int nFrameSize	= 144000 * nBitrate / nFreq;

	//	無理矢理MP3のタグを用意する
	ZeroMemory(&WFormat,sizeof(WFormat));
	WFormat.wfx.cbSize			= MPEGLAYER3_WFX_EXTRA_BYTES;
	WFormat.wfx.wFormatTag		= WAVE_FORMAT_MPEGLAYER3;
	WFormat.wfx.nChannels		= nChannel;
	WFormat.wfx.nSamplesPerSec	= nFreq;
	WFormat.wfx.nAvgBytesPerSec	= nBitrate * 1000 / 8;
	WFormat.wfx.nBlockAlign		= 1;
	WFormat.wfx.wBitsPerSample	= 0;
	WFormat.wID					= MPEGLAYER3_ID_MPEG;
	WFormat.fdwFlags			= MPEGLAYER3_FLAG_PADDING_OFF;
	WFormat.nBlockSize			= nFrameSize;
	WFormat.nFramesPerBlock		= 1;
	WFormat.nCodecDelay			= 0x0571;

	::SetFilePointer(hFile,-128,0,FILE_END) ;
	char tag[3];
	if (!::ReadFile(hFile,tag,3,&NumberOfBytesRead,NULL)){
		CloseHandle(hFile); // あれま...
		// Err.Out("CYFileでファイル読み込みに失敗");
		return false; // ファイルの読み込みに失敗。
	}
	//	ID3タグがついているならば、その分を除外する
	if ((tag[0] == 'T') && (tag[1] == 'A') && (tag[2] == 'G')) {
		hasTag=true;
		availSize -= 128;
	}
	availSize -= 4;
	dwSkipLen += 4;
	dwDataLen=availSize;
	::SetFilePointer(hFile,dwSkipLen,0,FILE_BEGIN);
	isOpen=true;
	return true;
};

// @yo2 0x0042a130 review
IkmWaveFileReader* IkmWaveFileReader::createMP3()
{
	return new kmMp3File;
}
};
