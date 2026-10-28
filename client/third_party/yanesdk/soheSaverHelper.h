//	
//	soheSaverHelper.h
//		スクリーンセーバー作成用の補助クラス
//		引数の処理など基本部分を担当
//			2001/07/31	sohei	create
//
#ifdef  USE_SAVER	//	スクリーンセーバ関係のクラスを使うかどうか

#ifndef __soheSaverHelper_h__
#define __soheSaverHelper_h__

#include "yaneIMEBase.h"
#include "yaneAppInitializer.h"
#include "yaneFile.h"
#include "yaneWindow.h"

enum {
	modeMain,
	modePreview,
	modeConfig,
	modePassword
};
class CSaverHelper {
public:
	void	GetSize(int&width, int&height) { width = m_nWidth; height = m_nHeight; }
	bool	IsPreview (void) { return m_nMode == modePreview;	}
	bool	IsMain    (void) { return m_nMode == modeMain;		}
	bool	IsConfig  (void) { return m_nMode == modeConfig;	}
	bool	IsPassword(void) { return m_nMode == modePassword;	}
	int		GetMode   (void) { return m_nMode; }
	HWND	GetParent (void) { return m_hParent; }
	LRESULT Init(void);
protected:
	void	SetSize(int width, int height) { m_nWidth=width; m_nHeight=height; }
	
	void	SetCmdLine(LPSTR lpCmdLine);

	int		m_nWidth, m_nHeight;
	int		m_nMode;
	HWND	m_hParent;
	string	m_sCaption;
};

#endif

#endif