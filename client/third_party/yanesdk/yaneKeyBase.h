// yaneKeyBase.h
//	 This is a based wrapper of input.
//		programmed by yaneurao(M.Isozaki) '99/11/13

#ifndef __yaneKeyBase_h__
#define __yaneKeyBase_h__

// ---------------------------------------------------------------------------
// buffer‚Ìflip! (C)yaneurao
#define FlipKeyBuffer(var) \
	var = 1 - var;
// ---------------------------------------------------------------------------

class CKeyBase {
public:
	CKeyBase(void);
	virtual ~CKeyBase();
	//////////////////////////////////////////////////////////////////
	virtual LRESULT	GetKeyState(void) = 0;	// must be override...
	virtual bool	IsKeyPress(int key) const;
	virtual bool	IsKeyPush(int key) const;
	virtual bool	IsKeyRelease(int key) const;	//	[Konami] released since last frame (name is ours)
	virtual BYTE*	GetKeyData(void) const;
	//////////////////////////////////////////////////////////////////
protected:
	int		m_nKeyBufNo;				//	— ‚Æ•\‚ğflip‚µ‚ÄA·•ª‚ğ‚Æ‚é‚Ì‚É—˜—p
	BYTE	m_byKeyBuffer[2][256];		//	key buffer
};

#endif
