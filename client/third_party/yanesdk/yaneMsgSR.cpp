#include "stdafx.h"
#include "yaneMsgSR.h"

// @yo2 0x00543e60 vt
CMsgReceiver::~CMsgReceiver(){
	//	自分に接続されているセンダーに遡及して削除
	vectorEx<CMsgSender*>::iterator it;
	for (it = m_lpaMsgSender.begin();it!=m_lpaMsgSender.end();it++){
		(*it)->m_lpaMsgReceiver.erase(this);
	}
}

// @yo2 0x00543f60 review
void	CMsgSender::AddReceiver(CMsgReceiver*lp){		//	レシーバー追加
	//	もし、このレシーバーとの接続が未確立ならば、レシーバー側にも接続を登録する
	if (m_lpaMsgReceiver.insert(lp).second) lp->m_lpaMsgSender.insert(this);
}

// @yo2 0x00543fe0 review
void	CMsgSender::DeleteReceiver(CMsgReceiver*lp){	//	レシーバー削除
	//	もし、このレシーバーと確立していた接続を断ち切るならば、レシーバー側からも削除する
	if (m_lpaMsgReceiver.erase(lp)) lp->m_lpaMsgSender.erase(this);
}

// @yo2 0x005440f0 cg
void	CMsgSender::DeleteReceivers(void){				//	全レシーバー削除
	//	自分に接続されているレシーバーに遡及して削除
	vectorEx<CMsgReceiver*>::iterator it;
	for (it = m_lpaMsgReceiver.begin();it!=m_lpaMsgReceiver.end();it++){
		(*it)->m_lpaMsgSender.erase(this);
	}
	m_lpaMsgReceiver.clear();
}

// @yo2 0x005441c0 tight
void	CMsgSender::NotifyReceivers(void* lpArg){		//	接続されているレシーバーに全通知
	//	自分に接続されているセンダーに遡及して削除
	vectorEx<CMsgReceiver*>::iterator it;
	for (it = m_lpaMsgReceiver.begin();it!=m_lpaMsgReceiver.end();it++){
		(*it)->OnNotifiedMsg(this,lpArg);
	}
}

// @yo2 0x00544200 vt
CMsgSender::~CMsgSender(){
	DeleteReceivers();
}
