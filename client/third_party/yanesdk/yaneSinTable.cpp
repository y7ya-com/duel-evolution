#include "stdafx.h"
#include "yaneSinTable.h"
#include <math.h>

const double PI = 3.1415926535897932384626433832795;

LONG	CSinTable::m_lTable[512];
bool	CSinTable::m_bInitialize = false;

// @yo2? 0x0056bf00 order
CSinTable::CSinTable(void){
	if (!m_bInitialize){
		for(int i=0;i<512;i++){
			m_lTable[i] = (LONG) (cos(i*PI/256) * 65536);
		}
		m_bInitialize = true;
	}
}

