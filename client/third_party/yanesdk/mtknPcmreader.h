#pragma once
#ifndef __IPCMStream_h__
#define __IPCMStream_h__

struct IMultiMediaStream;
namespace mtknLib {

//--- 修正 '01/11/19  by enra ---
class IkmPCMstream {
protected:
	// 直接delete禁止！DeleteSelf()を使ってね。
	virtual ~IkmPCMstream(){}

public:
	// DLLからもらったIkmPCMstreamの場合は、DLL空間内でdeleteする必要がある。
	// そのための自殺メソッド。
	virtual void DeleteSelf() { delete this; }

	// 指定されたファイルがオープンし、その成否を返す。
	virtual bool			Open(const char *filename)=0;
	// lpDestBufに、destSize分展開する。
	virtual DWORD 			Read(BYTE *lpDestBuf,DWORD destSize)=0;

	// 曲の長さをmsec単位で返す。
	virtual LONG			GetLength(void) = 0;
	// 現在の再生位置をByteで返す。
	virtual LONG			GetCurrentPos(void)=0;
	// 再生位置を変更する。
	virtual bool			SetPos(DWORD posByte)=0;

	// ループするかどうかを指定する。
	// [Konami] added lLoopPos (name is ours): where a looping stream restarts
	//          (RAW: in sample frames, DirectShow: STREAM_TIME for Seek, ACM: stored only)
	virtual bool			SetLoop(bool loop, LONG lLoopPos=0)=0;

	// WAVEFORMATEX構造体を返す。
	virtual WAVEFORMATEX*	GetFormat(void)=0;
	// ファイルの展開後のByte長を返す。
	virtual DWORD			GetPCMLength(void)=0;
	// size秒の保持に必要な展開後のByte長を返す。
	virtual DWORD			GetBlockAlignedBufferSize(DWORD size)=0;

	// msec->Byteの変換
	virtual DWORD			GetPosToByte(LONG lPos)=0;
	// Byte->msecの変換
	virtual LONG			GetByteToPos(DWORD dwByte)=0;// [Byte]->[ms]
};
//-------------------------------


};

#endif
