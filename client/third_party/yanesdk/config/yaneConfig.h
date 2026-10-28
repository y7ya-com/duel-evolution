
/*

	yaneSDK configulation

	使わないものについてはここでdefineをコメントアウト
	すればコンパイルされない。

*/

#ifndef __yaneConfig_h__
#define __yaneConfig_h__

// [Konami] yo2 build: MIDI (MCI/DM), DirectDraw (CPlane), yane new/delete, movie (DS/AVI)
// and screen saver support are compiled out. Evidence in ../KONAMI_CHANGES.md.

// -=-=-=-=-=-=-=-=- 使わないクラスの排除 -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

// --- MIDI出力系  --------------------------------------------------------

//#define USE_MIDIOutputMCI	//	CMIDIOutputMCIを使うか
//#define USE_MIDIOutputDM	//	CMIDIOutputDMを使うか
	//	↑DirectMusicを使うには、DirectX6以降が必要なので注意！
	//	ただし、使えない環境ならば、USE_MIDIOutputMCIが有効であれば、
	//	自動的にMCIで再生するように切り替わる

// --- ストリーム再生  ----------------------------------------------------

#define USE_StreamSound		//	CStreamSoundを使うか

// --- 描画	 --------------------------------------------------------------

//#define USE_DirectDraw		//	CPlane,CDirectDrawを使うか
#define USE_DIB32			//	CDIB32,CDIBDrawを使うか
#define USE_FastDraw		//	CFastPlane,CFastDrawを使うか
	//	FastDrawを使うのならば、
	//	CDIB32経由で画像を読み込んでいるところがあるので、
	//	USE_DIB32もdefineすること！

#define USE_YGA				//	YGAを使うか

#define USE_DIRECTX
// このオプションを外せば、
// CDIBDrawとCDIB32オンリーで作ったウィンドゥモードでのみで
// 動作するアプリケーションは、描画に関してはDirectX(DirectDraw)が
// 無くても動作するようになる。

// --- メモリマネージメント -----------------------------------------------

//#define USE_MEMORY_CHECK	//	new,deleteごとにログ記録を残すか？
//#define USE_YANE_NEWDELETE	//	new,deleteのカスタマイズバージョン(超高速)
							//	上のUSE_MEMORY_CHECKと併用は不可

// --- JoyStick関連 -------------------------------------------------------

#define USE_DIRECTINPUT_JOYSTICK	//	DirectInputによるJoyStickのサポート
									//	実際に使用するには実行環境に要DirectX5。
									//	これをdefineするだけならDirectX5は無くても可。
#define USE_WIN32_JOYSTICK			//	Win32によるJoyStickのサポート
									//	こちらだと２本までしか認識できない

// --- ムービー再生系 -----------------------------------------------------

//#define USE_MovieDS			// DirectShowを使う（推奨） 
							// DirectShowに対応したフォーマットで有ればだいたい再生出来る
							// ただしDirectX6.1以上が入っている必要がある
							// DirectShowが入っていない場合、下のUSE_MovieAVIが定義されていれば
							// そちらで再生を試みるようになっている
//#define USE_MovieAVI		// AVIStream関数を用いる。ただしAVIファイルしか再生できない。

// 内部的にCDirectDrawかCDIB32か、どちらを用いるか指定します。
//		CDirectDrawを使用するならばUSE_DirectDrawをdefineしておくこと。
//		CDIB32を使用するならばUSE_DIB32をdefineしておくこと。

//#define USE_MovieAVI_DirectDraw
#define USE_MovieAVI_DIB32		// 併用不可。

// --- スクリーンセーバー系 ----------------------------------------------------
//#define USE_SAVER
//	スクリーンセーバークラスを利用するか？
	//	これを使うときはUSE_DIB32もdefineすべし

// --- CErrorLog出力系 ----------------------------------------------------

//#define USE_ErrorLog		//	CErrorLogクラスを有効にする。
//	これをdefineしなければ、CErrorLogクラスは空のクラスになり、デバッグ用のエラー
//	文字列等はVC++の最適化によって消滅する。

#endif
