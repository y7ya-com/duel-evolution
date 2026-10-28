//
//	for Generic Message Sending & Receiving
//	クラス間のメッセージSend - Receiveクラス
//
//		（JavaのObservable - Observerクラス）
//
//	このクラスを実際に使うときはRTTIを有効にしてね＾＾
//

#ifndef __yaneMsgSR_h__
#define __yaneMsgSR_h__

class CMsgSender;
class CMsgReceiver {
public:
	friend class CMsgSender;

	virtual ~CMsgReceiver();

	//	これオーバーライドしてね
	virtual void OnNotifiedMsg(CMsgSender*lpSender,void*lpArg=NULL) = 0;

protected:
	vectorEx<CMsgSender*> m_lpaMsgSender;			//	接続されているセンダーを保持しておいて
												//	このデストラクタで接続を切るために使う
};

class CMsgSender {
public:
	friend class CMsgReceiver;

	void	AddReceiver(CMsgReceiver*);			//	レシーバー追加
	void	DeleteReceiver(CMsgReceiver*);		//	レシーバー削除
	void	DeleteReceivers(void);				//	全レシーバー削除
	void	NotifyReceivers(void* lpArg=NULL);	//	接続されているレシーバーに全通知
	virtual ~CMsgSender();

protected:
	vectorEx<CMsgReceiver*> m_lpaMsgReceiver;
};

#endif
