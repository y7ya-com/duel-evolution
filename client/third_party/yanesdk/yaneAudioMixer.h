//	yaneAudioMix.h : ウェーブオーディオミキサ
//
//		programmed by yaneurao '00/02/28
//

#ifndef __yaneAudioMixer_h__
#define __yaneAudioMixer_h__

enum eAudioMix {
	AUDIO_MIX_MASTER,
	AUDIO_MIX_WAVE,
	AUDIO_MIX_MIDI,
	AUDIO_MIX_CD
};

class CAudioMixer {
public:
	LRESULT SetVolumeRel(eAudioMix eDevice,double dRelVolume,int nRelPan);		//	相対ボリューム設定
	LRESULT SetVolumeAbs(eAudioMix eDevice,DWORD dwVolume,LONG lPan);			//	絶対ボリューム設定
	LRESULT SetVolumeOrg(eAudioMix eDevice);									//	初期ボリュームに設定
	LRESULT GetVolumeRel(eAudioMix eDevice,double &dRelVolume,int &nRelPan);	//	相対ボリューム取得
	LRESULT GetVolumeAbs(eAudioMix eDevice,DWORD &dwVolume,LONG &lPan);			//	絶対ボリューム取得
	LRESULT	GetVolumeOrg(eAudioMix eDevice,DWORD &vol1,DWORD &vol2 )const;		//	初期ボリューム取得

	bool	IsSuccessInit(void) const { return m_bSuccessInit; }				//	初期化に成功したか？

	CAudioMixer(void);
	virtual ~CAudioMixer();

protected:
	DWORD	m_dwVol;				//	現在のボリューム設定
	LONG	m_lPan;					//	現在のパン設定
	bool	m_bAudioComponent[4];	//	4つのコンポーネントがサポートされているか否かのフラグ

private:
	DWORD	m_dwOriginalVolC1[4];	//	元のボリューム設定(チャンネル1)
	DWORD	m_dwOriginalVolC2[4];	//	元のボリューム設定(チャンネル2)

	HMIXER		m_hMixer;			//	ミキサデバイスのハンドル
	UINT		m_MixerID;			//	有効なミキサデバイスの識別子
	MIXERCAPS	m_MixerCaps;		//	ミキサデバイス情報構造体
	MIXERLINE	m_MixerLine[4];		//	4つのAudioMixに対するLine(順番はenum順)
	MIXERCONTROL		m_MixerControl;
	MIXERLINECONTROLS	m_MixerLineControl;
	MIXERCONTROLDETAILS	m_MCD;
	auto_array<MIXERCONTROLDETAILS_UNSIGNED>	m_MCD_UnSigned;

protected:
	LRESULT	Open(void);
	LRESULT Close(void);

	LRESULT	GetMixerLineControl( int iLineID );		//	Detailの取得も兼ねる。下の関数に委譲する
	LRESULT GetMixerLineControl(MIXERLINE& ml);		//	こちらが本物＾＾；
	LRESULT	SetMixerControlDetails( int iLineID, bool bMono );

private:
	LRESULT	GetMixerDev( void );
	void	ErrAudioMixer( MMRESULT AMErr, LPCSTR strBuf );
	bool	m_bSuccessInit;
};

#endif
