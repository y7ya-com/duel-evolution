#include "stdafx.h"
#include "yaneMouse.h"
#include "yaneFlagDebugger.h"

// @yo2 0x0052e240 review
CFlagDebugger::CFlagDebugger(void){
	m_nGameFlagOffset	= 0;
	m_nSelectedGameFlag = 0;
	m_lpdw				= NULL;
}

// @yo2 0x0052e2c0 vt
CFlagDebugger::~CFlagDebugger(){
}

// @yo2 0x0052e2e0 vt
void	CFlagDebugger::OnDraw(HDC hdc){
	ShowGameFlagList(hdc);
}

// @yo2 0x0052e300 feat
void	CFlagDebugger::ShowGameFlagList(HDC hdc)
{
	if (m_lpdw == NULL) return ;	// error end

	const int baseY=0;
	const int baseX=64;

	CHAR szBuffer[_MAX_PATH];

	::SetBkMode(hdc, TRANSPARENT);
	::SetTextColor(hdc,RGB(128,255,128));

	::wsprintf(szBuffer,"ゲームフラグ編集");
	::TextOut(hdc,0,baseY,szBuffer,::lstrlen(szBuffer));

	int x,y,b;
	bool b1,b2;
	GetMouse()->GetInfo(x,y,b);
	GetMouse()->GetButton(b1,b2);

	//	マウスが表の中にあるか？
	int  nSelected=(((x-baseX)>>4)+(((y-baseY-80)>>4)<<5));
	bool bRange=(0+baseX<x) && (x<((16<<5)+baseX)) && (baseY+80<y) && (y<((16<<4)+baseY+80));
	bRange &= (nSelected+m_nGameFlagOffset < m_nSize);

	if(bRange) {
		::wsprintf(szBuffer,"FLAG NO:%04d",nSelected+m_nGameFlagOffset);
		::TextOut(hdc,baseX-48,baseY+64,szBuffer,::lstrlen(szBuffer));
	}

	::wsprintf(szBuffer,"gameflag[ %d ] = %u",m_nSelectedGameFlag,m_lpdw[m_nSelectedGameFlag]);
	::SetTextColor(hdc,RGB(0,0,0));			::TextOut(hdc,baseX+2,baseY+16+2,szBuffer,::lstrlen(szBuffer));
	::SetTextColor(hdc,RGB(255,255,255));	::TextOut(hdc,baseX  ,baseY+16  ,szBuffer,::lstrlen(szBuffer));

	::wsprintf(szBuffer,"　30　28　26　24　22　20　18　16　14　12　10　08　06　04　02　00");
	::SetTextColor(hdc,RGB(0,0,0));			::TextOut(hdc,baseX+2,baseY+32+2,szBuffer,::lstrlen(szBuffer));
	::SetTextColor(hdc,RGB(128,255,128));	::TextOut(hdc,baseX  ,baseY+32  ,szBuffer,::lstrlen(szBuffer));

	::wsprintf(szBuffer,"");
	int i;	// [portable] MSVC6 for-scope: i is used after the loop
	for(i=0;i<32;i++)
	{
		if(((m_lpdw[m_nSelectedGameFlag]>>(31-i))&0x1)==1)
			::lstrcat(szBuffer,"●");
		else
			::lstrcat(szBuffer,"○");
	}
	::SetTextColor(hdc,RGB(0,0,0));			::TextOut(hdc,baseX+2,baseY+48+2,szBuffer,::lstrlen(szBuffer));
	::SetTextColor(hdc,RGB(255,255,255));	::TextOut(hdc,baseX  ,baseY+48  ,szBuffer,::lstrlen(szBuffer));

	for(i=0;i<16;i++)
	{
		for(int j=0;j<32;j++)
		{
			int i5=i<<5;	//	iを5ビット左シフトしたのんー
			int i4=i<<4;
			::SetTextColor(hdc,RGB(255,255,255));
			if((nSelected==(i5+j))&&bRange)
			{
				SetTextColor(hdc,RGB(255,0,0));
				if(b1) m_nSelectedGameFlag=(i5+j)+m_nGameFlagOffset;
			}

			int now = i5+j+m_nGameFlagOffset;
			if (now == m_nSize) goto LoopEnd;

			if (m_nSelectedGameFlag==now)
				::TextOut(hdc,(j<<4)+baseX,i4+80+baseY,"★",::lstrlen("★"));	//	編集中
			else if(m_lpdw[i5+j+m_nGameFlagOffset]!=0)
				::TextOut(hdc,(j<<4)+baseX,i4+80+baseY,"●",::lstrlen("●"));	//	非０
			else
				::TextOut(hdc,(j<<4)+baseX,i4+80+baseY,"○",::lstrlen("○"));	//	０

		}
	}
LoopEnd:;

	::SetTextColor(hdc,RGB(255,255,255));
	CHAR buf[_MAX_PATH];
	::wsprintf(buf," + 1    + 10   + 100");
	::TextOut(hdc,baseX,baseY+360,buf,::lstrlen(buf));
	::wsprintf(buf," - 1    - 10   - 100");
	::TextOut(hdc,baseX,baseY+360+32,buf,::lstrlen(buf));

	//	フラグビット編集
	if((0+baseX<x) && (x<((32+baseX)<<4)) && (baseY+48<y) && (y<baseY+48+16) && (b1))
	{
		m_lpdw[m_nSelectedGameFlag]^=(1<<(31-((x-baseX)>>4)));
	}
	if (b1) {
		if      (baseX<x     && x<baseX+64  && baseY+360-16<y && y<360+16) m_lpdw[m_nSelectedGameFlag]++;
		else if (baseX+64<x  && x<baseX+128 && baseY+360-16<y && y<360+16) m_lpdw[m_nSelectedGameFlag]+=10;
		else if (baseX+128<x && x<baseX+192 && baseY+360-16<y && y<360+16) m_lpdw[m_nSelectedGameFlag]+=100;
		else if (baseX<x     && x<baseX+64  && baseY+392-16<y && y<392+16) m_lpdw[m_nSelectedGameFlag]--;
		else if (baseX<x+64  && x<baseX+128 && baseY+392-16<y && y<392+16) m_lpdw[m_nSelectedGameFlag]-=10;
		else if (baseX<x+128 && x<baseX+192 && baseY+392-16<y && y<392+16) m_lpdw[m_nSelectedGameFlag]-=100;
	}

	if (b2) {	//	次のフラグ位置まで送る
		m_nGameFlagOffset += 512;
		if (m_nGameFlagOffset >= m_nSize) {
			m_nGameFlagOffset = 0;
		}
	}
}
