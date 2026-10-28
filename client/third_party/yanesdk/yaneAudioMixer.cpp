
//
//	Audio Mixer :
//		programmed by Tia Deen
//		reprogrammed and bug-fixed by Yaneurao(M.Isozaki) '00/09/12-14
//		special thanks to Kaine
//		final bug-fixed by Yaneurao(M.Isozaki) '00/10/25
//

#include "stdafx.h"
#include "yaneAudioMixer.h"

// @yo2 0x0042d3d0 cg
CAudioMixer::CAudioMixer( void )
{
	for ( int i = 0 ; i < 4 ; i++ ) {
		m_bAudioComponent[i] = false;	//	4つのコンポーネントがサポートされているか否かのフラグ
		m_dwOriginalVolC1[i] = 0;		//	元のボリューム設定(チャンネル1)
		m_dwOriginalVolC2[i] = 0;		//	元のボリューム設定(チャンネル2)
	}

	m_hMixer = NULL;				//	ミキサデバイスのハンドル
	m_MixerID = NULL;				//	有効なミキサデバイスの識別子
	ZERO(m_MixerCaps);				//	ミキサデバイス情報構造体
	ZERO(m_MixerLine);				//	オーディオライン状態とメトリックス情報が入る構造体
	ZERO(m_MixerControl);			//	オーディオラインコントロールのステータスとメトリックス情報が入る構造体
	ZERO(m_MixerLineControl);		//	オーディオラインのコントロール情報が入る構造体
	ZERO(m_MCD);					//	ミキサコントロールの状態情報構造体

	//m_MCD_UnSigned = NULL;		//	ミキサコントロールのプロパティを取得、設定できる構造体

	m_dwVol = 0;					//	元のボリューム設定(Absで)
	m_lPan = 0;						//	元のパン設定

	m_bSuccessInit = (Open()==0);
}

// @yo2 0x0042d510 vt
CAudioMixer::~CAudioMixer(){
	Close();
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x0042d5b0 feat
LRESULT		CAudioMixer::Open( void )
{
	if ( Close()!=0 ) return 1;

	if ( mixerGetNumDevs() == 0 ) {
		Err.Out( "ミキサデバイス数が 0か、エラーが発生しました" );
		return 2;
	}

	// ミキサデバイスをオープンする
	MMRESULT	res;
	res = ::mixerOpen( &m_hMixer, m_MixerID, 0, 0, MIXER_OBJECTF_MIXER );
	if ( res != MMSYSERR_NOERROR ) {
		ErrAudioMixer( res, "ミキサデバイスをオープンできませんでした\n" );		
		return 3;
	}

	//	ミキサデバイスを取得する
	if ( GetMixerDev() != 0 ) return 4;

	//	元のボリュームを得る
	for ( int i = 0 ; i < 4 ; i++ ) {
		// 特定のミキサコントロールを得る
		if ( GetMixerLineControl( i ) != 0 ) continue;
		// 元のボリュ－ムを保存する
		m_dwOriginalVolC1[i] = m_MCD_UnSigned[0].dwValue;			//	元のボリューム設定(チャンネル1)
		m_dwOriginalVolC2[i] = m_MCD_UnSigned[1].dwValue;			//	元のボリューム設定(チャンネル2)
	}

	return 0;
}


////////////////////////////////////
//	SetVolumeRel
//	ボリュームの設定(相対)
//	nBalace [ -65536/2(-50%) +65535/2(+50%) ]
////////////////////////////////////
// @yo2 0x0042d680 feat
LRESULT		CAudioMixer::SetVolumeRel( eAudioMix eDevice, double dRelVolume, int nRelPan )
{
	//	元のボリュームに対する音量の設定
	DWORD	nowVol[2];
	DWORD	vol;
	LONG	pan;

	GetVolumeOrg( eDevice, nowVol[0], nowVol[1] );				//	元のボリュームを取得する

	//	vol = (DWORD)(nowVol[0] * dRelVolume);						//	元のボリュームに対して +x%
//	pan = (1<<15) - (nowVol[1]<<15) / nowVol[0];				//	元のパンに対して +y
	//	違うやろこれ...
	if (nowVol[0]==0 && nowVol[1]==0) {
		pan = 0;
		vol = 0;
	} else if (nowVol[0] >= nowVol[1]) {
		pan =  32768 - ::MulDiv(32768,nowVol[1],nowVol[0]);
		vol = nowVol[0] * dRelVolume;
	} else {
		pan = -32767 + ::MulDiv(32767,nowVol[0],nowVol[1]);
		vol = nowVol[1] * dRelVolume;
	}

	pan += nRelPan;

	// ボリュームの設定(委譲する)
	return SetVolumeAbs( eDevice, vol, pan );
}


///////////////////////////////////////////////////////////////
//	SetVolumeAbs
//	ボリュームの設定(絶対)
//	dwVolume[ 0..0xffff]		lPan [ 0x7fff..0x8000 ]
///////////////////////////////////////////////////////////////
// @yo2 0x0042d770 cg
LRESULT		CAudioMixer::SetVolumeAbs( eAudioMix eDevice, DWORD dwVolume, LONG lPan )
{
	// データの補正
	if ( dwVolume > 65535 )
		dwVolume = 65535;
	if ( dwVolume < 0 )
		dwVolume = 0;
	if ( lPan > 32768 )
		lPan = 32768;
	if ( lPan < -32767 )
		lPan = -32767;

	// 現在のコントロールの取得
	if (GetMixerLineControl( eDevice )!=0) return -1;

	// 音量の設定
	DWORD	vol[2];
	// モノラル時は、そのままデータを入れる
	if ( m_MixerLine[eDevice].cChannels == 1 ){
		vol[0] = dwVolume;
	} else if ( lPan >= 0 ) {
		// パンにより、振り分けた音量を設定する
		vol[0] = dwVolume;
		vol[1] = dwVolume * (32768-lPan) / 32768;
	} else {
		vol[0] = dwVolume * (32767+lPan) / 32767;
		vol[1] = dwVolume;
	}

	//	2ch以上は、対応できんわい＾＾；
	for ( DWORD i = 0 ; i < min(m_MixerLine[eDevice].cChannels,(DWORD)2) ; i++ )	// [portable] (DWORD)2
		m_MCD_UnSigned[i].dwValue = vol[i];

	// ボリュームの更新
	SetMixerControlDetails( eDevice, false );

	return 0;
}


//////////////////////////////////////////
//	GetVolumeRel
//	ボリュームの取得(相対)
//////////////////////////////////////////
// @yo2 0x0042d8b0 feat
LRESULT		CAudioMixer::GetVolumeRel(eAudioMix eDevice,double &dRelVolume,int &nRelPan) {

	// 現在のボリューム値の取得
	DWORD	getVol;
	LONG	getPan;

	if ( GetVolumeAbs( eDevice, getVol, getPan ) != 0 ) return 1;

	//	元のボリュームに対する音量の設定
	DWORD	nowVol[2];
	LONG	pan;
	DWORD	nvol;

	GetVolumeOrg( eDevice, nowVol[0], nowVol[1] );				//	元のボリュームを取得する
//	pan = (1<<15) - (nowVol[1]<<15)/nowVol[0];					//	元のパンに対して +y
	//	違うやろこれ...
	if (nowVol[0]==0 && nowVol[1]==0) {
		pan = 0;
		nvol = 0;
	} else if (nowVol[0] >= nowVol[1]) {
		pan =  32768 - ::MulDiv(32768,nowVol[1],nowVol[0]);
		nvol= nowVol[0];
	} else {
		pan = -32767 + ::MulDiv(32767,nowVol[0],nowVol[1]);
		nvol= nowVol[1];
	}

	// 値の更新	(現在の値 - 元の値)

	if (nowVol[0]!=0) {	//	この判定いるやろ..
		dRelVolume = (double)(getVol / nvol);
	} else {
		dRelVolume = 0xffff;	// infinity..
	}

	nRelPan = getPan - pan;

	return 0;
}


//////////////////////////////////////////
//	GetVolumeAbs
//	ボリュームの取得(絶対)
//////////////////////////////////////////
// @yo2 0x0042d9d0 feat
LRESULT		CAudioMixer::GetVolumeAbs(eAudioMix eDevice,DWORD &dwVolume,LONG &lPan)
{
	// 現在のボリューム値の取得
	DWORD	nowVol[2];

	//	bug-fixed '00/09/13
	if (GetMixerLineControl( eDevice )!=0) return -1;

	nowVol[0] = m_MCD_UnSigned[0].dwValue;
	nowVol[1] = m_MCD_UnSigned[1].dwValue;

	// モノラルだった時
	if ( m_MixerLine[eDevice].cChannels == 1 ) {
		dwVolume = m_MCD_UnSigned[0].dwValue;					// 現在の音量を得る
		lPan = 0;												// 現在のパンを得る
	} else {
		// パンとボリュームの更新
/*
		if ( nowVol[0] > nowVol[1] ){
			dwVolume = nowVol[0];								// 現在の音量を得る
			lPan = (1<<15) - (nowVol[1]<<15)/nowVol[0];			// 現在のパンを得る
		} else {
			dwVolume = nowVol[1];								// 現在の音量を得る
			lPan = (1<<15) - (nowVol[0]<<15)/nowVol[1];			// 現在のパンを得る
		}
*/
		//	違うやろ↑これ...
		if (nowVol[0]==0 && nowVol[1]==0) {
			lPan = 0;
			dwVolume = 0;
		} else if (nowVol[0] >= nowVol[1]) {
			lPan =	32768 - ::MulDiv(32768,nowVol[1],nowVol[0]);
			dwVolume = nowVol[0];
		} else {
			lPan = -32767 + ::MulDiv(32767,nowVol[0],nowVol[1]);
			dwVolume = nowVol[1];
		}
	}

	return 0;
}

////////////////////////////////////////
//	GetVolumeOrg
//	元のボリュームを取得する
////////////////////////////////////////
// @yo2 0x0042dae0 cg
LRESULT	CAudioMixer::GetVolumeOrg( eAudioMix eDevice, DWORD &vol1, DWORD &vol2 ) const
{
	vol1 = m_dwOriginalVolC1[eDevice];
	vol2 = m_dwOriginalVolC2[eDevice];
	return 0;
}

////////////////////////////////////////
//	SetVolumeOrg
//	元のボリュームに設定する
////////////////////////////////////////
// @yo2 0x0042db10 cg
LRESULT	CAudioMixer::SetVolumeOrg(eAudioMix eDevice)
{
	int nLineID = (int)eDevice;
	if ( m_hMixer == NULL ) return 1;
	if (GetMixerLineControl(nLineID)!=0) return 2;

	m_MCD_UnSigned[0].dwValue = m_dwOriginalVolC1[nLineID];		//	元のボリューム設定(チャンネル1)
	m_MCD_UnSigned[1].dwValue = m_dwOriginalVolC2[nLineID];		//	元のボリューム設定(チャンネル2)
	return SetMixerControlDetails(nLineID,false);
}

////////////////////////////////
//	Close
//	close audio mixer(and retrive volume)
////////////////////////////////
// @yo2 0x0042db90 feat
LRESULT		CAudioMixer::Close( void ){

	// mixerOpenを閉じていない時
	if ( m_hMixer != NULL ){
		for ( int i = 0 ; i < 4 ; i++ )
			SetVolumeOrg((eAudioMix)i);	//	元のボリューム値に戻す

		MMRESULT	res;
		res = mixerClose ( m_hMixer );								//	ミキサデバイスを閉じる
		if ( res != MMSYSERR_NOERROR ) {
			ErrAudioMixer( res, "ミキサデバイスを閉じられませんでした\n" );
			m_hMixer = NULL;
			m_MCD_UnSigned.clear();
			return 1;
		}
		m_hMixer = NULL;
	}

	//	ミキサコントロールのプロパティを取得、設定できる構造体のメモリ解放
	m_MCD_UnSigned.clear();

	return 0;
}

//////////////////////////////////////////////
//	GetMixerLineControl
//	オーディオラインのコントロール情報を得る
//////////////////////////////////////////////
// @yo2 0x0042dc60 tight
LRESULT	CAudioMixer::GetMixerLineControl( int iLineID ){

	// ミキサデバイスのハンドルを予め得ているか否かの判定
	if ( m_hMixer == NULL ) {
		Err.Out( "ミキサデバイスのハンドルがありませんでした" );
		return 1;
	}

	// iLineIDをサポートしているか否かの判定
	if (! m_bAudioComponent[iLineID] ) {
		Err.Out("%dのIDのオーディオ コンポーネントは、このサウンドボードにはサポートされていませんでした",iLineID);
		return 1;
	}

	return GetMixerLineControl(m_MixerLine[iLineID]);
}

// @yo2 0x0042dcb0 feat
LRESULT CAudioMixer::GetMixerLineControl(MIXERLINE& ml){

	// ミキサコントロールを仮に得る変数にメモリを確保する
	auto_array<MIXERCONTROL> pMc(ml.cControls);

	// オーディオラインコントロール情報の初期化処理
	MIXERLINECONTROLS&	mlc =  m_MixerLineControl;
	mlc.cbStruct	= sizeof (MIXERLINECONTROLS);
	mlc.dwLineID	= ml.dwLineID;
	mlc.cControls	= ml.cControls;
	mlc.cbmxctrl	= sizeof (MIXERCONTROL);
	mlc.pamxctrl	= pMc;

	// オーディオラインコントロール情報を得る
	MMRESULT	res;
	res = ::mixerGetLineControls( (HMIXEROBJ)m_hMixer, &mlc, MIXER_GETLINECONTROLSF_ALL );
	if ( res != MMSYSERR_NOERROR) {
		ErrAudioMixer( res, "オーディオラインのコントロール情報を得られませんでした\n" );
		return 1;
	}

	bool	bResult = false;
	for (DWORD i = 0 ; i < mlc.cControls ; i++ ){
		if ( pMc[i].dwControlType == MIXERCONTROL_CONTROLTYPE_VOLUME ){

			//	ミキサコントロール状態情報構造体を得る
			//	ミキサコントロールのプロパティを取得、設定できる構造体のメモリ確保
			DWORD channels = ml.cChannels;
			if (channels == 0) {
//				Err.Out("%dのIDのオーディオ コンポーネントはチャンネル数が0でした",i);
				continue;
			}

			m_MCD_UnSigned.resize(max(channels,(DWORD)2));	// [portable] (DWORD)2
			//	channel数が1でも2として扱わないと、音量保存の部分がめんどう＾＾；

			// ミキサコントロール状態情報構造体の初期化処理
			m_MCD.cbStruct		=	sizeof (MIXERCONTROLDETAILS);
			m_MCD.dwControlID	=	pMc[i].dwControlID;
			m_MCD.cChannels		=	channels;
			m_MCD.cMultipleItems=	pMc[i].cMultipleItems;
			m_MCD.cbDetails		=	sizeof (MIXERCONTROLDETAILS_UNSIGNED);
			m_MCD.paDetails		=	m_MCD_UnSigned;

			// ミキサコントロール状態情報構造体の取得
			res = ::mixerGetControlDetails( (HMIXEROBJ)m_hMixer, &m_MCD, MIXER_GETCONTROLDETAILSF_VALUE );
			if ( res != MMSYSERR_NOERROR ) {
//				ErrAudioMixer( res, "ミキサコントロール状態情報構造体の取得ができませんでした\n" );
				continue;
			}

			//	ようやくコピー
			m_MixerControl = pMc[i];
			bResult = true;
			break;
		}
	}

	// 失敗していたら
	if ( !bResult ) {
		Err.Out( "MixerControl構造体に関連付けられるオーディオラインコントロールがありませんでした" );
		return 1;
	}

	return 0;
} // GetMixerControlDetails


///////////////////////////////////////////////
//	SetMixerControlDetails
//	ミキサコントロール状態情報構造体を得る
///////////////////////////////////////////////
// @yo2 0x0042df20 feat
LRESULT	CAudioMixer::SetMixerControlDetails( int iLineID, bool bMono )
{
	// ミキサデバイスのハンドルを予め得ているか否か
	if ( m_hMixer == NULL ) {
		Err.Out( "ミキサデバイスのハンドルがありませんでした" );
		return 1;
	}
	// iLineIDをサポートしているか否かの判定
	if ( !m_bAudioComponent[iLineID]) {
		Err.Out( iLineID + "のIDのオーディオ コンポーネントは、このサウンドボードにはサポートされていませんでした" );
		return 1;
	}

	// ミキサコントロール状態情報構造体の初期化処理
	m_MCD.cbStruct		= sizeof (MIXERCONTROLDETAILS);
	m_MCD.dwControlID	= m_MixerControl.dwControlID;
	if ( bMono ) {
		m_MCD.cChannels		=	1;
	} else {
		m_MCD.cChannels		=	m_MixerLine[iLineID].cChannels;
	}
	m_MCD.cMultipleItems	=	m_MixerControl.cMultipleItems;
	m_MCD.cbDetails			=	sizeof (MIXERCONTROLDETAILS_UNSIGNED);
	m_MCD.paDetails			=	m_MCD_UnSigned;

	// ミキサコントロール状態情報構造体の取得
	MMRESULT	res;
	res = ::mixerSetControlDetails( (HMIXEROBJ)m_hMixer, &m_MCD, MIXER_GETCONTROLDETAILSF_VALUE );
	if ( res != MMSYSERR_NOERROR ){
		ErrAudioMixer( res, "ミキサコントロール状態情報構造体の取得ができませんでした\n" );
		return 1;
	}

	return 0;
} // SetMixerControlDetails


/////////////////////////////////////////// Private /////////////////////////////////////////
//////////////////////////////
//private for Open
//	GetMixerDev
//	ミキサデバイスを取得する
//////////////////////////////
// @yo2 0x0042e010 feat
LRESULT	CAudioMixer::GetMixerDev( void )
{
	// ミキサデバイスの情報を得る
	MMRESULT	res;
	res = mixerGetDevCaps( (UINT)m_MixerID, &m_MixerCaps, sizeof (m_MixerCaps) );
	if ( res != MMSYSERR_NOERROR ) {
		ErrAudioMixer( res, "ミキサデバイス情報を得られませんでした\n" );
		return 1;
	}


	for (DWORD i = 0 ; i < m_MixerCaps.cDestinations ; i++ )
	{
		// ミキサデバイスのディスティネ―ション、ソース情報を得る
		MIXERLINE	ml;		//	オーディオライン状態とメトリックス情報が入る構造体
		ZERO(ml);

		// ミキサデバイスのディスティネ―ション情報を得る
		ml.cbStruct = sizeof (ml);
		ml.dwDestination = i;
		res = ::mixerGetLineInfo( (HMIXEROBJ)m_hMixer, &ml, MIXER_GETLINEINFOF_DESTINATION );
		if ( res != MMSYSERR_NOERROR ) {
			ErrAudioMixer( res, "ミキサデバイスのディスティネ―ション情報を得られませんでした\n" );
			return 1;
		}
		//	Getしたディスティネーションが、オーディオ出力に対するコンポーネントか否かを
		//	判定する(ヘッドホンもこれに入る)
		if ( ml.dwComponentType == MIXERLINE_COMPONENTTYPE_DST_SPEAKERS ) {

			//	bug-fixed '00/09/13
			//	こいつは、ライン出力できるのかを調べて、ライン出力できるならば、これを取得する
			if (GetMixerLineControl(ml)!=0) continue;	//	こんな奴は資格なし！＾＾；

			m_MixerLine[0] = ml;
			m_bAudioComponent[0] = true;

			DWORD	iDstConnect = ml.cConnections;
			// ミキサデバイスのソース情報を得る
			for (DWORD j = 0 ; j < iDstConnect ; j++ )
			{
				ml.cbStruct = sizeof (ml);
				ml.dwDestination = i;
				ml.dwSource = j;
				res = ::mixerGetLineInfo( (HMIXEROBJ)m_hMixer, &ml, MIXER_GETLINEINFOF_SOURCE );
				if ( res != MMSYSERR_NOERROR ) {
					ErrAudioMixer( res, "ミキサデバイスのソース情報を得られませんでした\n" );
					return 1;
				}
				int nLineNo=0;
				switch (ml.dwComponentType) {
				case MIXERLINE_COMPONENTTYPE_SRC_WAVEOUT:
					nLineNo = 1; break;
				case MIXERLINE_COMPONENTTYPE_SRC_SYNTHESIZER:
					nLineNo = 2; break;
				case MIXERLINE_COMPONENTTYPE_SRC_COMPACTDISC:
					nLineNo = 3; break;
				}

				//	最初に取得したところから上書きは出来ないようにする '00/09/13
				if (nLineNo!=0 && !m_bAudioComponent[nLineNo]
					&& GetMixerLineControl(ml)==0) {
					m_MixerLine[nLineNo] = ml;
					m_bAudioComponent[nLineNo] = true;
				}
			}
		}
	}
	return 0;
} // GetMixerDev


/////////////////////////////////////
//	ErrAudioMixer
//	オーディオミキサのエラー処理
/////////////////////////////////////
// @yo2 0x0042e240 cg
void	CAudioMixer::ErrAudioMixer( MMRESULT AMErr, LPCSTR strBuf )
{
	switch ( AMErr )
	{
		case MMSYSERR_NOERROR:
			Err.Out( "CAudioMixer::あれ？NOERRORが返ってますよ" );
			break;
		case MMSYSERR_INVALHANDLE:
			Err.Out( "CAudioMixer::指定したデバイスハンドルが不正です" );
			break;
		case MIXERR_INVALCONTROL:
			Err.Out( "CAudioMixer::コントロールの参照が不正です" );
			break;
		case MMSYSERR_BADDEVICEID:
			Err.Out( "CAudioMixer::デバイス識別子が不正または有効範囲外でした" );
			break;
		case MMSYSERR_INVALFLAG:
			Err.Out( "CAudioMixer::フラグの指定が不正です" );
			break;
		case MMSYSERR_INVALPARAM:
			Err.Out( "CAudioMixer::アドレスが不正です" );
			break;
		case MMSYSERR_NODRIVER:
			Err.Out( "CAudioMixer::デバイスドライバが存在しませんでした" );
			break;
		case MMSYSERR_ALLOCATED:
			Err.Out( "CAudioMixer::指定したリソースは、最大許容数のクライアントにすでに割り当てられていました" );
			break;
		case MMSYSERR_NOMEM:
			Err.Out( "CAudioMixer::必要なメモリを割り当てることができませんでした" );
			break;

		default:
			Err.Out( "CAudioMixer::原因不明のエラーが起こりました" );
			break;
	}
	Err.Out( strBuf );
} // ErrAudioMixer
