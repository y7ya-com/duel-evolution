// What the System slice these tests link (task, element, scene) needs from System files they don't link: the draw
// queues. Nothing is drawn here.
#include "System/yo2ZSort.h"

CZSort::CZSort() = default;
CZSort::~CZSort() = default;
bool CZSort::add(CElement*, float, int32_t) { return true; }
void CZSort::clear() {}
CZSortSet::CZSortSet() = default;
CZSortSet* g_zsortSet;
