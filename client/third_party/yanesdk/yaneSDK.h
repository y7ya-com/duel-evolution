//
//			yaneurao GAME SDK 2nd for Windows95/98,SE/ME/NT4.0/2000
//					programmed by yaneurao(M.Isozaki)
//
//					http://www.sun-inet.or.jp/~yaneurao/
//					email : yaneurao@sun-inet.or.jp
//
//					road to a super programmer
//					http://www.sun-inet.or.jp/~yaneurao/rsp/
//
//					Genius Great Gameprogrammers' Gypsum to a super programmer
//					http://www.sun-inet.or.jp/~yaneurao/ggg/
//
//					yaneurao GameSDK 2nd Support
//					http://www.sun-inet.or.jp/~yaneurao/yaneSDK/
//
//					direct download site
//					http://www.sun-inet.or.jp/~yaneurao/download/
//
//						reprogrammed since	Feb.24 on 2000
//
//

#ifndef __yaneSDK_h__
#define __yaneSDK_h__

//////////////////////////////////////////////////////////////////////////////

#include "yaneAppInitializer.h"	//	for Application Initialize
#include "yaneAppFrame.h"		//	for Application Frame
#include "yaneAppBase.h"		//	for main frame

//////////////////////////////////////////////////////////////////////////////
//	すべて独立性の高いユニットであって不要なものはincludeしなくて良い。
//	Each unit is so independent that you don't have to include all files.

//	Draw Tools
#include "yaneDirectDraw.h"		//	for DirectDraw interface
#include "yanePlane.h"			//	for DirectDrawSurface
#include "yanePlaneLoader.h"	//	for Generic PlaneLoader
#include "yanePlaneEffectBlt.h"	//	for CPlane Effect Blt
#include "yaneDIBitmap.h"		//	for DIB loader/saver
#include "yaneDIBDraw.h"		//	for DIB32Draw interface
#include "yaneDIB32.h"			//	for 32bpp Device Independent Bitmap
#include "yaneDIB32Effect.h"	//	for DIB32 Effect ( and functor )
#include "yaneCellAutomaton.h"	//	for DIB32 Cell Automaton Effecter
#include "yaneBumpMap.h"		//	for DIB32 Bump Mapping
#include "yaneFastDraw.h"		//	for FastDraw interface
#include "yaneFastPlane.h"		//	for FastPlane interface
#include "yanePlaneBase.h"		//	for dealing CPlane & DIB32 & CFastPlane
#include "yaneMorpher.h"		//	for Morphing
#include "yaneLayer.h"			//	for DirectDraw Layer
#include "yaneSprite.h"			//	for SpriteDefinition
#include "yaneSpriteChara.h"	//	for SpriteCharacterManager
#include "yaneSpriteLoader.h"	//	for Generic SpriteLoader
#include "yaneGameObjectBase.h"	//	for Game Object
#include "yaneMouseDecorator.h"	//	for Mouse Message management
#include "yanePlaneTransiter.h"	//	for transition of plane
#include "soheSaverBase.h"		//	for screen saver

//	GUI	Tools
#include "yaneGUIParts.h"		//	for GUI Tools
#include "yaneGUIButton.h"		//	for GUI Button
#include "yaneGUISlider.h"		//	for GUI Slider

//	Main Tools
#include "yaneCDDA.h"			//	for CDDA playing
#include "yaneWindow.h"			//	for Window

// Movie Tools
#include "yaneMovie.h"			// for Movie Plane&Sound

//	Sound Tools
#include "yaneSound.h"			//	for DirectSound
#include "yaneSoundLoader.h"	//	for Generic SoundLoader
#include "yaneSELoader.h"		//	for Generic SoundEffectLoader
#include "yaneStreamSound.h"	//	for StreamSoundPlaying

//	MIDI Sound & Volume Control
#include "yaneMIDIOutput.h"		//	for MIDI Output
#include "yaneMIDILoader.h"		//	for MIDI Loading
#include "yaneBGMLoader.h"		//	for BGM Managing
#include "yaneAudioMixer.h"		//	for AudioMixer
#include "yaneVolumeFader.h"	//	for Volume Fader of Audio Mixer
#include "yaneSoundFader.h"		//	for Volume Fader of DirectSound

//	for Timing
#include "yaneTimer.h"			//	for Game Timer
#include "yaneFPSTimer.h"		//	for FPS adjusting Timer
#include "yaneSequencer.h"		//	for Sequence Manager

//	Input Device
#include "yaneMIDIInput.h"		//	for MIDI Input
#include "yaneDirectInput.h"	//	for Keyboard Input
#include "yaneJoyStick.h"		//	for JoyStick Input
#include "yaneVirtualKey.h"		//	for Virtual Key manager
#include "yaneKey.h"			//	for standard KeyInput
#include "yaneMouse.h"			//	for MouseInput

//	DirectDraw Layer
#include "yaneMouseLayer.h"		//	for Software Mouse Cursor
#include "yaneFPSLayer.h"		//	for Layer Displaying

//	Text Drawing
#include "yaneFont.h"			//	for TextDrawing to HDC
#include "yaneTextPlane.h"		//	for Text CPlane used DirectDrawSurface
#include "yaneTextDIB32.h"		//	for Text CDIB32 used Device Independent Bitmap
#include "yaneTextFastPlane.h"	//	for Text CFastPlane
#include "yaneTextLayer.h"		//	for Text Layer
#include "yaneTextDraw.h"		//	for Text Message Drawing
#include "yaneScenarioView.h"	//	for Scenario Drawing

//	Map Drawing
#include "yaneMapLayer.h"		//	for Map Drawing
#include "yaneSpriteEx.h"		//	for Map Sprite

//	Auxiliary
#include "yaneError.h"			//	for error-log output
#include "yaneFile.h"			//	for File wrapper
#include "yaneCPUID.h"			//	for CPU Identifier
#include "yaneDebugWindow.h"	//	for DebugOutput Window
#include "yaneDir.h"			//	for Directory Searching
#include "yaneSingleApp.h"		//	for single Application
#include "yaneLineParser.h"		//	for a line parsing
#include "yaneStringScanner.h"	//	for a string scanning
#include "yaneRootCounter.h"	//	for root counting
#include "yaneInteriorCounter.h"//	for interior division counting
#include "yaneFileDialog.h"		//	for File Dialog
#include "yaneMsgDlg.h"			//	for Message Dialog
#include "yaneSinTable.h"		//	for sin-cos table
#include "yaneFindWindow.h"		//	for Finding Window
#include "yaneShell.h"			//	for Shell Execute
#include "yaneMsgSR.h"			//	for Generic Message Sending & Receiving
#include "yaneRegion.h"			//	for Region maker by CDIB32
#include "yaneRegionHook.h"		//	for window message hooker for CRegion
#include "yaneRand.h"			//	for generating random number by MT method
#include "yaneFlagDebugger.h"	//	for real-time visual Memory editing
#include "yaneScene.h"			//	for Scene Management
#include "yaneSceneTransiter.h"	//	for transition among scene and scene
#include "yaneSerialize.h"		//	for Stream Serialization
#include "yaneStringMap.h"		//	for mapping from string to string
#include "yaneDirtyRect.h"		//	for dirty rect management

#endif
