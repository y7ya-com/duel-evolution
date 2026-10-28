// CDeckScene::main (FUN_008df280, vf04): the deck editor's per-frame handler. See DeckEntry.h.
//
// While a dialog is up (`busy`), the open dialogs are polled in a fixed order; a dialog answers with 4000 (OK /
// yes), 0xfa1 (no / cancel), a file-list button id (0xfa2 load-or-overwrite, 0xfa3 cancel, 0xfa7 delete, 0xfc9
// new name), or the cancel key of app+0x148 (vf 0x48, handled like "no"). Each answer plays a sound, deactivates
// and destroys the dialog, then acts: save as / overwrite / delete / load a .ydc deck file, apply a recipe pack
// (data\cardpack), clear the deck, leave the editor. Otherwise the frame handles the end of a drag: a trunk card
// dropped on a deck grid, or a deck card moved between main and side or back to the trunk.
// Both paths end in the same tail: menu bar upkeep and the lobby's "a duel was booked" hand-off.
#include "DeckEntryMain.h"

#include <algorithm>
#include <cstring>

namespace dk {

namespace {

enum : int32_t {
    DLG_YES = 4000,         // CWindowModelDialogOk / YesNo answer ids
    DLG_NO = 0xfa1,
    FL_PICK = 0xfa2,        // CWindowModelFileList +0x4e4: load (list 0) / overwrite (list 1) / apply (list 2)
    FL_CANCEL = 0xfa3,
    FL_DELETE = 0xfa7,
    FL_NEW = 0xfc9,         // save under a new name
};
enum : uint32_t {
    SE_OK = 0x10000001,
    SE_CANCEL = 0x10000002,
    SE_DROP = 0x1000000f,   // a card lands on a grid
};
enum : int32_t {
    TXT_CONFIRM_DELETE = 0x11ae,
    TXT_CONFIRM_OVERWRITE = 0x11b0,
    TXT_BAD_DECK = 0x17a3,   // "your deck must have 40 to 80 cards" (save refused)
};

// the trunk's drop zone, right of the deck grids (x in (0x2e8, 0x3bc), y in (0x58, sideBottom))
bool inTrunkZone(const DropZones& z, int32_t x, int32_t y) {
    return x > 0x2e8 && x < 0x3bc && y > 0x58 && y < z.sideBottom;
}

// The deck sizes a save accepts (FUN_008df280's checks before the save dialogs; mazo.py "tamano"):
// main 40..80, side <= 15, extra <= 30.
bool deckSaveable(CDeckObject* d) {
    uint8_t m = deckObjCount(d, DP_MAIN);
    return m <= DECK_MAIN_MAX && m >= 40 && deckObjCount(d, DP_SIDE) <= DECK_SIDE_MAX &&
           deckObjCount(d, DP_EXTRA) <= DECK_EXTRA_MAX;
}

template <class T>
T* live(const TaskPtr<T>& p) {   // the exe's "dynamic_cast<T*>(task) != 0, then get()"
    return p.task ? p.get() : nullptr;
}

// deactivate and destroy a dialog; the exe's CTaskPtr goes null through TM_DESTROYED
template <class T>
void closeDialog(TaskPtr<T>& p) {
    if (T* t = live(p)) {
        modelSetActive(t, false);
        taskDestroy(t);
    }
    p.task = nullptr;
}

// the file list +0x4e4: the button pressed (-1 = none), reset after reading
int32_t& listResult(CWindowModelFileList* fl) { return fl->sel2; }
CWindowTaskListbox* listOf(CWindowModelFileList* fl) { return fl->list.get(); }
// the input dialog's answer, +0x404 (inside the key-hook block of the stand-in), -1 = none
int32_t& inputResult(CWindowModelInputValue* v) { return *reinterpret_cast<int32_t*>(v->keyHook + 4); }

// the selected file name, narrowed like the exe (wcstombs into 0x100 bytes)
VcString selectedName(CWindowModelFileList* fl) {
    VcWString w = listboxSelText(listOf(fl));
    return wideToMb(w.c_str());
}
VcString withExt(const VcString& name) {
    VcString s = name;
    s += ".ydc";
    return s;
}

// The dialogs the editor opens itself here (the rest come from the buttons, CDeckScene's mediator).
// Returns false when the dialog couldn't be made. `saveMode` >= 0 is stored once it exists (the overwrite question).
bool openYesNo(CDeckScene* s, TaskPtr<CWindowModelDialogYesNo>& p, int32_t style, const char* inst, int32_t text,
               int32_t saveMode = -1) {
    p.set(yesNoCreate(s->root.get(), 0, 0, DLG_YES, DLG_NO, style));
    CWindowModelDialogYesNo* d = live(p);
    if (!d) return false;
    if (saveMode >= 0) s->saveMode = saveMode;
    dialogOpen(d);
    taskSetInstName(d, inst);
    dialogSetText(d, uiText(text).c_str());
    modelSetAlpha(d, 1.0f);
    dialogLayout(d);
    modelSetActive(d, true);
    return true;
}

// "errdialog": the deck can't be saved at its size (text 0x17a3), at (500, 116)
bool openSizeError(CDeckScene* s) {
    s->ok158.set(okDialogCreate(s->root.get(), 100.0f, 200.0f, FL_PICK, 4));
    CWindowModelDialogOk* d = live(s->ok158);
    if (!d) return false;
    dialogOpen(d);
    taskSetInstName(d, "errdialog");
    dialogSetText(d, uiText(TXT_BAD_DECK).c_str());
    dialogSetPos(d, 500.0f, 116.0f);
    modelSetAlpha(d, 1.0f);
    dialogLayout(d);
    s->setBusy(1);
    sceneSetButtonsEnabled(false);
    modelSetActive(d, true);
    return true;
}

// Rebuild both windows from the edited deck after it was replaced (load / recipe): the grids get the new cards and
// the trunk gives them up; the "missing" list (cards not in the trunk) only for loads that report it.
void showDeck(CDeckObject* d, bool withMissing) {
    static const DeckPart parts[] = {DP_MAIN, DP_SIDE, DP_EXTRA};
    for (DeckPart p : parts) {
        for (int i = 0; i < deckObjCount(d, p); i++) {
            uint32_t card = deckObjCards(d, p)[i];
            if (p == DP_MAIN) g_deckWindow->addMain(card);
            else if (p == DP_SIDE) g_deckWindow->addSide(card);
            else g_deckWindow->addExtra(card);
            g_kabanList->subCount(card, 1);
        }
    }
    if (withMissing)
        for (int i = 0; i < deckObjCount(d, DP_MISSING); i++) g_deckWindow->addMissing(deckObjCards(d, DP_MISSING)[i]);
}

// Empty the edited deck: the cards it held go back to the trunk (the exe copies the three lists first:
// 80 / 15 / 30 entries, the lists' fixed sizes).
void emptyDeck(CDeckObject* d) {
    uint16_t mainCards[DECK_MAIN_MAX], sideCards[DECK_SIDE_MAX], extraCards[DECK_EXTRA_MAX];
    std::memcpy(mainCards, deckObjCards(d, DP_MAIN), sizeof mainCards);
    std::memcpy(sideCards, deckObjCards(d, DP_SIDE), sizeof sideCards);
    std::memcpy(extraCards, deckObjCards(d, DP_EXTRA), sizeof extraCards);
    // fix: the counts are u8 in the exe and could exceed the copied lists; bound them to what was copied
    int nm = std::min<int>(deckObjCount(d, DP_MAIN), DECK_MAIN_MAX);
    int ns = std::min<int>(deckObjCount(d, DP_SIDE), DECK_SIDE_MAX);
    int ne = std::min<int>(deckObjCount(d, DP_EXTRA), DECK_EXTRA_MAX);
    deckObjReset(d);
    g_deckWindow->clearAll();
    for (int i = 0; i < nm; i++) g_kabanList->addCount(mainCards[i], 1);
    for (int i = 0; i < ns; i++) g_kabanList->addCount(sideCards[i], 1);
    for (int i = 0; i < ne; i++) g_kabanList->addCount(extraCards[i], 1);
}

void endDialog(CDeckScene* s) {
    s->setBusy(0);
    sceneSetButtonsEnabled(true);
}

// ---------------------------------------------------------------- the dialogs, in the exe's order

// ok158: the "errdialog" (or another notice) over the save list
void pollNotice(CDeckScene* s) {
    CWindowModelDialogOk* d = live(s->ok158);
    if (!d) return;
    if (dialogResult(d) == DLG_YES) soundPlay(SE_OK, 0);
    else if (keyEnterPressed()) soundPlay(SE_CANCEL, 0);
    else return;
    closeDialog(s->ok158);
    if (CWindowModelFileList* fl = live(s->fileList[1])) fl->setEnabled(true);
    else endDialog(s);
    s->f1bc = 0;
}

// ok[0]: "savesuccessdialog" (opened by saveSuccess, 0x008e9d40)
void pollSaved(CDeckScene* s) {
    CWindowModelDialogOk* d = live(s->ok[0]);
    if (!d) return;
    if (dialogResult(d) == DLG_YES) {
        soundPlay(SE_OK, 0);
        closeDialog(s->ok[0]);
        // the saved deck no longer lacks anything: drop the missing-cards list and its grid
        deckObjClear(s->edit);
        g_deckWindow->clearMissing();
        g_deckWindow->switchView(g_deckWindow->extraView());
        if (live(s->fileList[1])) {
            s->fileList[1].get()->setEnabled(true);
            closeDialog(s->fileList[1]);
        }
        endDialog(s);
    } else if (keyEnterPressed()) {
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->ok[0]);
        if (live(s->fileList[1])) {   // the exe gets it unchecked (asserts when it is gone)
            s->fileList[1].get()->setEnabled(true);
            closeDialog(s->fileList[1]);
        }
        endDialog(s);
    }
}

// yesNo164: "leave the deck editor?" Yes copies the deck to the duel deck and returns to the map.
void pollLeave(CDeckScene* s) {
    CWindowModelDialogYesNo* d = live(s->yesNo164);
    if (!d) return;
    int32_t r = dialogResult(d);
    if (r == DLG_YES) {
        soundPlay(SE_OK, 0);
        closeDialog(s->yesNo164);
        endDialog(s);
        bgmStop(0);
        void* duel = &s->deckDuel;
        duelDeckClear(duel);
        static const DeckPart parts[] = {DP_MAIN, DP_SIDE, DP_EXTRA};
        for (DeckPart p : parts) {
            const uint16_t* cards = deckObjCards(s->edit, p);
            for (int i = 0; i < deckObjCount(s->edit, p); i++) duelDeckAdd(duel, p, cards[i]);
        }
        menuBarLeaveDeck();
        sceneFadeOut(10, 0xee4c);
        sceneReturnToMap(1);
        return;
    }
    if (r == DLG_NO) soundPlay(SE_CANCEL, 0);
    else if (keyEnterPressed()) soundPlay(SE_CANCEL, 0);
    else return;
    closeDialog(s->yesNo164);
    endDialog(s);
    s->f1bc = 0;
}

// the file list a delete dialog came from: load (0) if it is up, else save (1)
CWindowModelFileList* deletingList(CDeckScene* s) {
    if (CWindowModelFileList* fl = live(s->fileList[0])) return fl;
    return live(s->fileList[1]);
}

// yesNo[1]: "confirmdeletedialog". Yes deletes <deck folder>\<name>.ydc and its row.
void pollDelete(CDeckScene* s) {
    CWindowModelDialogYesNo* d = s->yesNo[1].get();
    int32_t r = dialogResult(d);
    if (r == DLG_NO) {
        soundPlay(SE_CANCEL, 0);
        if (CWindowModelFileList* fl = deletingList(s)) fl->setEnabled(true);
        closeDialog(s->yesNo[1]);
    } else if (r == DLG_YES) {
        soundPlay(SE_OK, 0);
        if (CWindowModelFileList* fl = deletingList(s)) {
            VcString path = deckFolder();
            path += "\\";
            path += selectedName(fl);
            path += ".ydc";
            deckFileDelete(path);
            fl->removeRow(listboxSelIndex(listOf(fl)));
            fl->setEnabled(true);
        }
        closeDialog(s->yesNo[1]);
    }
    if (live(s->yesNo[1]) && keyEnterPressed()) {
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->yesNo[1]);
        if (CWindowModelFileList* fl = live(s->fileList[1]) ? live(s->fileList[1]) : s->fileList[0].get())
            fl->setEnabled(true);
    }
}

// save the edited deck as `file`; the overwrite question already said yes
void saveAs(CDeckScene* s, const VcString& file) { s->saveDone(file); }

// yesNo[2]: "confirmoverwritedialog". saveMode 0 came from the save list (overwrite the picked file), 1 from the
// name input (that file exists already).
void pollOverwrite(CDeckScene* s) {
    CWindowModelDialogYesNo* d = s->yesNo[2].get();
    int32_t r = dialogResult(d);
    if (r == DLG_NO) {
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->yesNo[2]);
        if (s->saveMode == 0) s->fileList[1].get()->setEnabled(true);
        else if (s->saveMode == 1) s->input.get()->setEnabled(true);
    } else if (r == DLG_YES) {
        soundPlay(SE_OK, 0);
        if (s->saveMode == 0) {
            s->fileName = deckObjName(s->edit);   // kept to restore on failure
            VcString name = selectedName(s->fileList[1].get());
            deckObjSetFolder(s->edit, deckFolder());
            deckObjSetFile(s->edit, withExt(name));
            deckSaveBegin();
            if (deckObjSave(s->edit)) saveAs(s, withExt(name));
            else s->saveCancel();
        } else if (s->saveMode == 1) {
            deckSaveBegin();
            if (deckObjSave(s->edit)) saveAs(s, deckObjName(s->edit));
            else s->saveCancel();
        }
    }
    if (live(s->yesNo[2]) && keyEnterPressed()) {
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->yesNo[2]);
        if (CWindowModelInputValue* in = live(s->input)) in->setEnabled(true);
        else s->fileList[1].get()->setEnabled(true);
    }
}

// the save list again, after the name input went away
void closeSaveList(CDeckScene* s) {
    if (CWindowModelFileList* fl = live(s->fileList[1])) {
        fl->setEnabled(true);
        modelSetActive(fl, true);
    }
}

// input: "inputdialog", the name of a new deck file
void pollSaveName(CDeckScene* s) {
    CWindowModelInputValue* in = s->input.get();
    int32_t r = inputResult(in);
    if (r == DLG_NO) {
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->input);
        closeSaveList(s);
    } else if (r == DLG_YES) {
        soundPlay(SE_OK, 0);
        VcWString text = inputValueText(in);
        if (!text.size()) {   // nothing typed: like cancel (after the OK sound)
            closeDialog(s->input);
            closeSaveList(s);
        } else {
            s->fileName = deckObjName(s->edit);
            VcString name = wideToMb(text.c_str());
            deckObjSetFolder(s->edit, deckFolder());
            deckObjSetFile(s->edit, withExt(name));
            VcString path = deckFolder();
            path += "\\";
            path += withExt(name);
            if (deckFileExists(path)) {
                // ask first; the answer comes back through yesNo[2] with saveMode 1
                if (openYesNo(s, s->yesNo[2], 0, "confirmoverwritedialog", TXT_CONFIRM_OVERWRITE, 1)) {
                    inputResult(in) = -1;
                    in->setEnabled(false);
                    return;
                }
            } else if (deckObjSave(s->edit)) {
                settingsSetLastDeck(withExt(name));
                settingsWrite();
                s->dirty = 0;
                if (CWindowModelFileList* fl = live(s->fileList[1])) fl->addRow(mbToWide(name.c_str()).c_str());
                closeDialog(s->input);
                s->saveSuccess();
            } else {
                deckObjSetFile(s->edit, s->fileName);   // back to the old name
                closeDialog(s->input);
                if (live(s->fileList[1])) {
                    s->fileList[1].get()->setEnabled(true);
                    closeDialog(s->fileList[1]);
                }
                endDialog(s);
            }
        }
    }
    if (live(s->input) && keyEnterPressed()) {
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->input);
        if (live(s->fileList[1])) {   // the exe gets it unchecked
            s->fileList[1].get()->setEnabled(true);
            modelSetActive(s->fileList[1].get(), true);
        }
    }
}

// the common "delete the selected file?" of the load and save lists
bool askDelete(CDeckScene* s, CWindowModelFileList* fl) {
    if (!listboxHasSelection(listOf(fl))) {
        listResult(fl) = -1;
        return false;
    }
    soundPlay(SE_OK, 0);
    (void)selectedName(fl);   // the exe narrows the name here and drops it
    if (!openYesNo(s, s->yesNo[1], 4, "confirmdeletedialog", TXT_CONFIRM_DELETE)) return true;
    listResult(fl) = -1;
    fl->setEnabled(false);
    return false;
}

// fileList[0]: the load list. Returns false when main() returns right away.
bool pollLoadList(CDeckScene* s) {
    CWindowModelFileList* fl = live(s->fileList[0]);
    if (!fl) return true;
    switch (listResult(fl)) {
    case FL_DELETE:
        if (!askDelete(s, fl)) return false;
        break;
    case FL_CANCEL:
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->fileList[0]);
        endDialog(s);
        break;
    case FL_PICK: {
        if (!listboxHasSelection(listOf(fl))) {
            listResult(fl) = -1;
            return false;
        }
        soundPlay(SE_OK, 0);
        VcString name = selectedName(fl);
        emptyDeck(s->edit);
        deckObjSetFolder(s->edit, deckFolder());
        deckObjSetFile(s->edit, withExt(name));
        deckObjLoad(s->edit);
        settingsSetLastDeck(withExt(name));
        settingsWrite();
        s->dirty = 0;
        showDeck(s->edit, true);
        g_deckWindow->switchView(0);
        g_deckWindow->rebuild();
        closeDialog(s->fileList[0]);
        endDialog(s);
        break;
    }
    }
    if (live(s->fileList[0]) && keyEnterPressed()) {
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->fileList[0]);
        endDialog(s);
    }
    return true;
}

// fileList[1]: the save list. Returns false when main() returns right away.
bool pollSaveList(CDeckScene* s) {
    CWindowModelFileList* fl = live(s->fileList[1]);
    if (!fl) return true;
    switch (listResult(fl)) {
    case FL_NEW:   // a new name: the input dialog, if the deck has a legal size
        soundPlay(SE_OK, 0);
        if (deckSaveable(s->edit)) {
            s->input.set(inputValueCreate(s->root.get(), 0, 0, 0, 3));
            CWindowModelInputValue* in = live(s->input);
            if (!in) break;
            dialogOpen(in);
            taskSetInstName(in, "inputdialog");
            dialogLayout(in);
            modelSetActive(in, true);
        } else if (!openSizeError(s)) {
            break;
        }
        listResult(fl) = -1;
        fl->setEnabled(false);
        return false;
    case FL_DELETE:
        if (!askDelete(s, fl)) return false;
        break;
    case FL_PICK:   // overwrite the picked file
        if (!listboxHasSelection(listOf(fl))) {
            listResult(fl) = -1;
            return false;
        }
        soundPlay(SE_OK, 0);
        if (deckSaveable(s->edit)) {
            if (!openYesNo(s, s->yesNo[2], 0, "confirmoverwritedialog", TXT_CONFIRM_OVERWRITE, 0)) break;
        } else if (!openSizeError(s)) {
            break;
        }
        listResult(fl) = -1;
        fl->setEnabled(false);
        return false;
    case FL_CANCEL:
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->fileList[1]);
        endDialog(s);
        break;
    }
    if (live(s->fileList[1]) && keyEnterPressed()) {
        soundPlay(SE_OK, 0);   // (sic: the OK sound)
        s->fileList[1].get()->setEnabled(true);
        closeDialog(s->fileList[1]);
        endDialog(s);
    }
    return true;
}

// a pack's text (PackEntry +0x28, a VC6 string the util stand-in leaves opaque): FUN_008e8ae0
const VcString& packText(const PackEntry& p) {
    return *reinterpret_cast<const VcString*>(reinterpret_cast<const uint8_t*>(&p) + 0x28);
}

// fileList[2]: the recipe packs (data\cardpack). Picking one replaces the deck with the pack's list.
bool pollRecipeList(CDeckScene* s) {
    CWindowModelFileList* fl = live(s->fileList[2]);
    if (!fl) return true;
    PackCatalogue* cat = appPacks();   // = CDeckScene+0x1a0
    int32_t sel = listboxSelIndex(listOf(fl));
    if (sel != -1 && sel != (int32_t)s->f1a4) {   // show the highlighted pack's text
        s->f1a4 = (uint32_t)sel;
        // fix: the exe indexes the pack vector unchecked
        if (cat && (size_t)sel < cat->packs.size()) fl->setFieldText(packText(cat->packs[sel]).c_str());
    }
    int32_t r = listResult(fl);
    if (r == FL_CANCEL) {
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->fileList[2]);
        endDialog(s);
    } else if (r == FL_PICK) {
        if (!listboxHasSelection(listOf(fl))) {
            listResult(fl) = -1;
            return false;
        }
        soundPlay(SE_OK, 0);
        emptyDeck(s->edit);
        sel = listboxSelIndex(listOf(fl));
        if (cat && sel >= 0 && (size_t)sel < cat->packs.size()) {
            const PackEntry& pack = cat->packs[sel];
            deckObjSetFolder(s->edit, VcString("data\\cardpack"));
            deckObjSetFile(s->edit, pack.image);
            deckObjLoad(s->edit);
            bool listed = pack.type == 1 || pack.type == 4;   // a booster / a structure deck
            if (listed && packIsNew(cat, pack.id)) packMarkSeen(cat, pack.id, 2);
            s->dirty = 1;
            showDeck(s->edit, listed);
        }
        g_deckWindow->switchView(0);
        g_deckWindow->rebuild();
        closeDialog(s->fileList[2]);
        endDialog(s);
    }
    if (live(s->fileList[2]) && keyEnterPressed()) {
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->fileList[2]);
        endDialog(s);
    }
    return true;
}

// yesNo[0]: "clear the deck?"
void pollClear(CDeckScene* s) {
    CWindowModelDialogYesNo* d = live(s->yesNo[0]);
    if (!d) return;
    int32_t r = dialogResult(d);
    if (r == DLG_YES) {
        soundPlay(SE_OK, 0);
        // the copy of the lists is taken before the reset, as in emptyDeck; the view is set between
        emptyDeck(s->edit);   // (the exe switches the view between the reset and the trunk counts)
        g_deckWindow->switchView(g_deckWindow->extraView());
        s->dirty = 1;
        closeDialog(s->yesNo[0]);
        endDialog(s);
    } else if (r == DLG_NO) {
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->yesNo[0]);
        endDialog(s);
    }
    if (live(s->yesNo[0]) && keyEnterPressed()) {
        soundPlay(SE_CANCEL, 0);
        closeDialog(s->yesNo[0]);
        endDialog(s);
    }
}

// ---------------------------------------------------------------- drag and drop

void clearDrag(DeckDragState* d) {   // FUN_008e84f0
    d->dragging = d->fromDeck = d->grid = 0;
    d->card = d->index = 0;
}

// a trunk card let go over the deck window (drag state 2, armed by the trunk window)
void dropFromTrunk(CDeckScene* s, const DropZones& z, int32_t x, int32_t y) {
    DeckDragState* drag = deckDragState();
    uint32_t card = drag->card;
    bool extra = g_deckWindow->extraView();
    DeckPart t = deckDropTarget(z, extra, x, y);
    if (t != DP_MISSING) {
        int32_t frame = cardFrame(cardKonamiId(card));
        if (deckDropAllowed(t, deckObjCount(s->edit, t), frame) && deckObjAdd(s->edit, t, card, s->trunk)) {
            soundPlay(SE_DROP, 0);
            if (t == DP_MAIN) g_deckWindow->addMain(card);
            else if (t == DP_SIDE) g_deckWindow->addSide(card);
            else g_deckWindow->addExtra(card);
            g_kabanList->subCount(card, 1);
            s->dirty = 1;
            g_deckWindow->rebuild();
            g_deckWindow->fill(t == DP_EXTRA ? 1 : 0, 0);
        }
    }
    clearDrag(drag);
    g_kaban->dragging = 0;
    kabanDragEnd();
}

void deckChanged(int32_t view) {
    g_deckWindow->rebuild();
    g_deckWindow->fill(view, 0);
}

// a deck card let go (drag state 1): main <-> side, or back to the trunk; anything else puts it back
void dropFromDeck(CDeckScene* s, const DropZones& z, int32_t x, int32_t y) {
    DeckDragState* drag = deckDragState();
    uint32_t card = drag->card, index = drag->index;
    DeckPart t = deckDropTarget(z, false, x, y);
    switch (drag->grid) {
    case 1:     // from main
    case 2: {   // from side
        DeckPart from = drag->grid == 1 ? DP_MAIN : DP_SIDE, to = drag->grid == 1 ? DP_SIDE : DP_MAIN;
        if (t == to) {
            if (deckObjCount(s->edit, to) >= (to == DP_SIDE ? DECK_SIDE_MAX : DECK_MAIN_MAX)) {
                g_deckWindow->cancelDrag(drag->grid, index);
                break;
            }
            if (!deckObjRemove(s->edit, from, card)) break;
            if (from == DP_MAIN) g_deckWindow->removeMain(index);
            else g_deckWindow->removeSide(index);
            if (deckObjAdd(s->edit, to, card, s->trunk)) {
                soundPlay(SE_DROP, 0);
                if (to == DP_SIDE) g_deckWindow->addSide(card);
                else g_deckWindow->addMain(card);
                g_deckWindow->rebuild();
            }
            s->dirty = 1;
            deckChanged(0);
        } else if (inTrunkZone(z, x, y)) {
            if (!deckObjRemove(s->edit, from, card)) {
                if (from == DP_MAIN) g_deckWindow->cancelDrag(1, index);   // (the side grid doesn't)
                break;
            }
            soundPlay(SE_DROP, 0);
            if (from == DP_MAIN) g_deckWindow->removeMain(index);
            else g_deckWindow->removeSide(index);
            g_kabanList->addCount(card, 1);
            s->dirty = 1;
            deckChanged(0);
        } else {
            g_deckWindow->cancelDrag(drag->grid, index);
        }
        break;
    }
    case 3:   // from extra: only back to the trunk
        if (inTrunkZone(z, x, y)) {
            if (!deckObjRemove(s->edit, DP_EXTRA, card)) break;
            soundPlay(SE_DROP, 0);
            g_deckWindow->removeExtra(index);
            g_kabanList->addCount(card, 1);
            s->dirty = 1;
            deckChanged(1);
        } else {
            g_deckWindow->cancelDrag(3, index);
        }
        break;
    }
    clearDrag(drag);
}

void dragAndDrop(CDeckScene* s) {
    if (mouseReleased()) {
        DropZones z = deckDropZones(g_deckWindow->expanded != 0, g_deckWindow->missingCount > 0);
        DeckDragState* drag = deckDragState();
        if (drag->dragging == 2) {
            if (drag->fromDeck == 1 && g_kaban->dragging == 1) {
                int32_t x = 0, y = 0;
                mousePos(&x, &y);
                dropFromTrunk(s, z, x, y);
                sceneSetButtonsEnabled(true);
            }
        } else if (drag->dragging == 1 && drag->fromDeck == 1) {
            int32_t x = 0, y = 0;
            mousePos(&x, &y);
            dropFromDeck(s, z, x, y);
            sceneSetButtonsEnabled(true);
        }
    }
    if (keyEnterPressed()) g_kaban->resetSearch();
}

// ---------------------------------------------------------------- the tail of every frame

void frameTail(CDeckScene* s) {
    menuTopTick();
    int32_t mode = menuBarMode();
    if (mode != (int32_t)s->f198) {
        s->f198 = (uint32_t)mode;
        deckSceneMenuModeChanged(s);
    }
    menuBarTick();
    if (!s->f1bc) menuBarSetFlag(0);
    // a duel booked from the lobby while in the editor: ask (0x1f), then go to the duel scene when it's ready
    if (!lobbyConnected() || lobbyState() != 8) return;
    if (s->f1f0 == 0) {
        if (lobbySend(0x1f) && lobbyTaskStart(s->lobby.get())) s->f1f0 = 1;
    } else if (s->f1f0 == 1 && lobbyTaskState(s->lobby.get()) == 2) {
        (void)duelSideId(0);   // the exe reads both ids and drops them
        (void)duelSideId(1);
        int32_t world = appWorld();
        avatarSetParts(0, duelSideParts(0, world));
        avatarSetParts(1, duelSideParts(1, world));
        duelSetMode(lobbyRoomKind() == 0x11 ? 4 : 3);
        sceneFadeOut(10, 0xee4c);
        sceneChange(0x1e, 1, 1);
    }
}

}   // namespace

// ---------------------------------------------------------------- pieces of 0x008df280 the tests use

// The drop zones of the frame above (0x008e5bc4..0x008e5c3c). The missing-cards row takes 0x78 pixels off the
// main grid; the extra grid (Extra tab) ends where the main grid would without it: mainBottom + 0x78.
DropZones deckDropZones(bool expanded, bool missingRow) {
    DropZones z;
    z.sideTop = expanded ? 0x268 : 0x200;
    z.sideBottom = expanded ? 0x2c0 : 0x258;
    z.mainBottom = (expanded ? 0x248 : 0x1e0) - (missingRow ? 0x78 : 0);
    return z;
}

// Which grid a drop at (x, y) lands on; DP_MISSING = none. The grids span x in (0x100, 0x2d8).
DeckPart deckDropTarget(const DropZones& z, bool extraView, int32_t x, int32_t y) {
    if (x <= 0x100 || x >= 0x2d8) return DP_MISSING;
    if (extraView) return y > 0x58 && y < z.mainBottom + 0x78 ? DP_EXTRA : DP_MISSING;
    if (y > 0x58 && y < z.mainBottom) return DP_MAIN;
    if (y > z.sideTop && y < z.sideBottom) return DP_SIDE;
    return DP_MISSING;
}

// @yo2 0x008df280 vf04: dialogs while busy, else the end of a drag; then the per-frame tail
uint32_t CDeckScene::main() {
    if (busy) {
        pollNotice(this);
        pollSaved(this);
        pollLeave(this);
        // one question at a time: these return the frame without the tail
        if (live(yesNo[1])) {
            pollDelete(this);
            return 1;
        }
        if (live(yesNo[2])) {
            pollOverwrite(this);
            return 1;
        }
        if (live(input)) {
            pollSaveName(this);
            return 1;
        }
        if (!pollLoadList(this) || !pollSaveList(this) || !pollRecipeList(this)) return 1;
        pollClear(this);
    } else {
        dragAndDrop(this);
    }
    frameTail(this);
    return 1;
}

}   // namespace dk
