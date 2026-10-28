#include "stdafx.h"
#include "yaneTextLayer.h"

// @yo2 0x0057ee50 review
void	CTextLayer::OnDraw(HDC hdc){
	m_Font.OnDraw(hdc,m_nX,m_nY);
}
