// net_cli verbs for the lobby's one-request tasks (NetLobbyRequests.cpp). They run under their own root task;
// "lr.frame" steps it and prints each task's state / busy / result.
#include "NetLobbyRequests.h"
#include "net_cli.h"

#include "System/yo2Task.h"

static CTask* g_lrRoot;
static CTask* lrRoot() { return g_lrRoot ? g_lrRoot : (g_lrRoot = CTask::createRoot()); }
static CNetLobby_CreateRoom* g_create;
static CNetLobby_DeleteRoom* g_delete;
static CNetLobby_OfferCancel* g_offerCancel;
static CNetLobby_OfferRoom* g_offer;
static CNetLobby_RecvMail* g_mail;
static CNetLobby_ReplyDuel* g_reply;
static CNetLobby_TradeCancel* g_tradeCancel;

NET_CLI("call", "lr.spawn") {
    CTask* r = lrRoot();
    g_create = CNetLobby_CreateRoom::spawn(r);
    g_delete = CNetLobby_DeleteRoom::spawn(r);
    g_offerCancel = CNetLobby_OfferCancel::spawn(r);
    g_offer = CNetLobby_OfferRoom::spawn(r);
    g_mail = CNetLobby_RecvMail::spawn(r);
    g_reply = CNetLobby_ReplyDuel::spawn(r);
    g_tradeCancel = CNetLobby_TradeCancel::spawn(r);
    printf("lr spawned %s %s %s\n", g_create->instName().c_str(), g_mail->instName().c_str(),
           g_tradeCancel->instName().c_str());
});
NET_CLI("call", "lr.frame") {
    lrRoot()->call(&g_tmMain);
    CTask::flushDeleted();
    printf("lr create=%d,%d,%d delete=%d,%d,%d ocancel=%d,%d,%d offer=%d,%d,%d,%d mail=%d,%d,%d reply=%d,%d,%d "
           "tcancel=%d,%d,%d\n",
           g_create->state, g_create->busy, g_create->result, g_delete->state, g_delete->busy, g_delete->result,
           g_offerCancel->state, g_offerCancel->busy, g_offerCancel->result, g_offer->state, g_offer->busy,
           g_offer->result, g_offer->matchResult, g_mail->state, g_mail->busy, g_mail->result, g_reply->state,
           g_reply->busy, g_reply->result, g_tradeCancel->state, g_tradeCancel->busy, g_tradeCancel->result);
});
NET_CLI("call", "lr.create") {   // "dstyle,wmode,mstat,password" (empty password = unlocked)
    unsigned a = 0, b = 0, c = 0;
    char pw[17] = {};
    sscanf(arg.c_str(), "%u,%u,%u,%16s", &a, &b, &c, pw);
    printf("accepted %d\n", g_create->createRoom((uint8_t)a, (uint8_t)b, (uint8_t)c, pw[0] != 0, pw, 1, 2, 3, 0));
});
NET_CLI("call", "lr.delete") { printf("accepted %d\n", g_delete->deleteRoom()); });
NET_CLI("call", "lr.offercancel") { printf("accepted %d\n", g_offerCancel->cancel()); });
NET_CLI("call", "lr.offer") {   // "pid,room[,password]"
    int p = 0, r = 0;
    char pw[17] = {};
    sscanf(arg.c_str(), "%d,%d,%16s", &p, &r, pw);
    printf("accepted %d\n", g_offer->offer(p, r, pw));
});
NET_CLI("call", "lr.searchfriends") { printf("accepted %d\n", g_mail->searchFriends()); });
NET_CLI("call", "lr.pidbyname") { printf("accepted %d\n", g_mail->getPidByName(arg)); });
NET_CLI("call", "lr.mailcount") { printf("accepted %d\n", g_mail->getMailCount()); });
NET_CLI("call", "lr.rcvmail") { printf("accepted %d\n", g_mail->rcvMail()); });
NET_CLI("call", "lr.reply") { printf("accepted %d\n", g_reply->reply(atoi(arg.c_str()) != 0)); });
NET_CLI("call", "lr.tradecancel") { printf("accepted %d\n", g_tradeCancel->cancel()); });
NET_CLI("call", "lr.answered") {   // "<task>,<k>": delete / offer / tcancel / mail (takeAnswer)
    int k = (int)strtol(arg.c_str() + arg.find(',') + 1, nullptr, 0);
    bool r = arg.rfind("delete", 0) == 0 ? g_delete->answered(k)
             : arg.rfind("offer", 0) == 0 ? g_offer->answered(k)
             : arg.rfind("tcancel", 0) == 0 ? g_tradeCancel->answered(k)
                                             : g_mail->takeAnswer(k);
    printf("answered %d\n", r);
});
