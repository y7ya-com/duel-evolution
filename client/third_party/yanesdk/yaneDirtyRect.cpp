#include "stdafx.h"
#include "yaneDirtyRect.h"
#include <limits.h>

//	加算：範囲指定タイプ
// @yo2 0x0044de20 feat
void	CDirtyRect::AddRect(int left,int top,int right,int bottom, int nSize){
	// 配列の要素数がたりなきゃリサイズ
	if(m_nRectSize < nSize) {
		Resize(nSize);
	}

	int nRectLast = m_nRectLast;
	::SetRect(&m_arcRect[nRectLast],left,top,right,bottom);
	m_anRectArea[nRectLast] = (right-left)*(bottom-top);

	if (nRectLast!=nSize/*nRectSize*/){
		//	まだ入りましゅので、そのまま加算したので終わりでしゅ
			//	面積を代入しておく
		m_nRectLast++;
		return ;
	}

	//	もうこれ以上、入りましぇん。
	//	ガーベジしましゅ

	//	《方針》
	//		互いに結合することによって、増加する面積が最小となるものを選択し、削除する
	int min_area = INT_MAX;			//	結合によって増加する面積の最小値
	int	min_a;						//	結合したときの面積
	int min_i,min_j;				// そのときのi,jの値
	int	nLeft,nTop,nRight,nBottom;	// そのときの矩形
	
	for(int i=0;i<nRectLast;i++){
		for(int j=i+1;j<nRectLast+1;j++){
			//	矩形iと矩形jを結合してみる

			//	結合前の面積
			int nAI = m_anRectArea[i];
			int nAJ = m_anRectArea[j];
			//	矩形の外側を取得
			int left	= m_arcRect[i].left    < m_arcRect[j].left   ? m_arcRect[i].left   : m_arcRect[j].left;
			int top		= m_arcRect[i].top     < m_arcRect[j].top    ? m_arcRect[i].top    : m_arcRect[j].top;
			int right	= m_arcRect[i].right   > m_arcRect[j].right  ? m_arcRect[i].right  : m_arcRect[j].right;
			int bottom	= m_arcRect[i].bottom  > m_arcRect[j].bottom ? m_arcRect[i].bottom : m_arcRect[j].bottom;
			//	結合された面積を取得
			int nAC = (right - left) * (bottom-top);
			//	結合することによって変化する差分を取得
			int nADiff = nAC - (nAI + nAJ);
			if (nADiff < min_area) {
				min_a    = nAC;
				min_area = nADiff;
				min_i = i; min_j=j;
				nLeft = left; nTop = top; nRight = right; nBottom = bottom;
			}
		}
	}

	//	min_iとmin_jを結合する
		//	min_iに代入
	m_anRectArea[min_i] = min_a;
	::SetRect(&m_arcRect[min_i],nLeft,nTop,nRight,nBottom);
		//	min_jを消去
	if (min_j!=nRectLast) {
		//	コピる必要があるときだけコピる
		m_anRectArea[min_j] = m_anRectArea[nRectLast];
		m_arcRect[min_j] = m_arcRect[nRectLast];
	}
}

//	減算：範囲指定タイプ
// @yo2 0x0044e180 feat
void	CDirtyRect::SubRect(int left,int top,int right,int bottom){
	smart_ptr<RECT> r(new RECT,true);
	::SetRect(r, left, top, right, bottom);
	m_vSubRect.insert( r );
}

// @yo2 0x0044e2e0 feat
void	CDirtyRect::Refresh(){
	//	《方針》
	//		１．互いに結合することによって、増加する面積が０以下ならば、結合して削除する
	//		２．一方がもう一方に入り込んでいるのならば、そこを切断する

	int nRectLast = m_nRectLast;

	for(int i=0;i<nRectLast-1;i++){
		for(int j=i+1;j<nRectLast;){
			//	矩形iと矩形jを結合してみる

			//	結合前の面積
			int nAI = m_anRectArea[i];
			int nAJ = m_anRectArea[j];
			//	矩形の外側を取得
			int left	= m_arcRect[i].left    < m_arcRect[j].left   ? m_arcRect[i].left   : m_arcRect[j].left;
			int top		= m_arcRect[i].top     < m_arcRect[j].top    ? m_arcRect[i].top    : m_arcRect[j].top;
			int right	= m_arcRect[i].right   > m_arcRect[j].right  ? m_arcRect[i].right  : m_arcRect[j].right;
			int bottom	= m_arcRect[i].bottom  > m_arcRect[j].bottom ? m_arcRect[i].bottom : m_arcRect[j].bottom;
			//	結合された面積を取得
			int nAC = (right - left) * (bottom-top);
			//	結合することによって変化する差分を取得
			int nADiff = nAC - (nAI + nAJ);
			if (nADiff <= 0) {	//	結合することによって小さくなる
				//	iとjは結合する
				m_anRectArea[i] = nAC;
				::SetRect(&m_arcRect[i],left,top,right,bottom);
				//	jを消去
				if (j!=nRectLast-1) {
				//	コピる必要があるときだけコピる
					m_anRectArea[j] = m_anRectArea[nRectLast-1];
					m_arcRect[j] = m_arcRect[nRectLast-1];
				}
				nRectLast--;
			} else {
				//	削除が発生しなかったときのみjを加算
				j++;
			}
		}
	}
	m_nRectLast = nRectLast;

	////////////////////////////////////////////////////////////////////////
	// 減算処理
	////////////////////////////////////////////////////////////////////////

	int nSize = m_vSubRect.size();
	if(nSize > 0) { // 減算する必要があるか？
		// 減算してばらばらになった矩形を格納するvector
		smart_vector_ptr<RECT> rects;

		// それじゃあ減算してみるか～
		for(int i=0;i<nSize;i++) {
			// 減算する矩形を求めて
			int div_l = m_vSubRect[i]->left;
			int div_t = m_vSubRect[i]->top;
			int div_r = m_vSubRect[i]->right;
			int div_b = m_vSubRect[i]->bottom;

			// 減算後の矩形は複数の矩形に分解できるので全て調べてから再度AddRectする
			for(int j=0;j<nRectLast;j++){
				int base_l = m_arcRect[j].left;
				int base_t = m_arcRect[j].top;
				int base_r = m_arcRect[j].right;
				int base_b = m_arcRect[j].bottom;

				////////////////////////////////////////////////////////////////////////
				// 内外判定のラフチェック
				////////////////////////////////////////////////////////////////////////

				// 重なる範囲無し
				if( div_b <= base_t || base_b <  div_t || div_r <= base_l || base_r <  div_l ){
					// この矩形を全領域登録
					smart_ptr<RECT> r(new RECT,true);
					::SetRect(r, base_l, base_t, base_r, base_b);
					rects.insert( r );
					continue;
				}
				// 覆い被さっている
				if( div_l <= base_l && div_t <= base_t && base_r <= div_r && base_b <= div_b ){
					continue; // この矩形は無視
				}

				////////////////////////////////////////////////////////////////////////
				// ここまでくると、重なる範囲が部分的にある
				// 以下の番号は図を参考に・・・
				////////////////////////////////////////////////////////////////////////

				if( div_t <= base_t ){ // 1.2.3.4.5.6.10.
					if( base_b <= div_b ){ // 4.5.6.
						if( base_l < div_l ){ // 5.6.
							smart_ptr<RECT> r(new RECT,true);
							::SetRect(r, base_l,base_t,div_l,base_b);
							rects.insert( r );
						}
						if( div_r < base_r ){ // 4.5.
							smart_ptr<RECT> r(new RECT,true);
							::SetRect(r, div_r,base_t,base_r,base_b);
							rects.insert( r );
						}
					}
					ef( div_b < base_b ){ // 1.2.3.10.
						if( base_l < div_l ){ // 2.3.
							smart_ptr<RECT> r(new RECT,true);
							::SetRect(r, base_l,base_t,div_l,div_b);
							rects.insert( r );
						}
						if( div_r < base_r ){ // 1.2.
							smart_ptr<RECT> r(new RECT,true);
							::SetRect(r, div_r,base_t,base_r,div_b);
							rects.insert( r );
						}
						// 1.2.3.10.
						{
							smart_ptr<RECT> r(new RECT,true);
							::SetRect(r, base_l,div_b,base_r,base_b);
							rects.insert( r );
						}
					}
				}
				ef( base_t < div_t ){ // 7.8.9.11.12.13.14.15.
					// 7.8.9.11.12.13.14.15.
					{
						smart_ptr<RECT> r(new RECT,true);
						::SetRect(r, base_l,base_t,base_r,div_t);
						rects.insert( r );
					}

					if( base_b <= div_b ){ // 7.8.9.11.
						if( div_r < base_r ){ // 7.8.
							smart_ptr<RECT> r(new RECT,true);
							::SetRect(r, div_r,div_t,base_r,base_b);
							rects.insert( r );
						}
						ef( base_l < div_l ){ // 8.9.
							smart_ptr<RECT> r(new RECT,true);
							::SetRect(r, base_l,div_t,div_l,base_b);
							rects.insert( r );
						}
					}
					ef( div_b < base_b ){ // 12.13.14.15.
						if( base_l < div_l ){ // 14.15.
							smart_ptr<RECT> r(new RECT,true);
							::SetRect(r, base_l,div_t,div_l,div_b);
							rects.insert( r );
						}
						if( div_r < base_r ){ // 13.15.
							smart_ptr<RECT> r(new RECT,true);
							::SetRect(r, div_r,div_t,base_r,div_b);
							rects.insert( r );
						}
						// 12.13.14.15.
						{
							smart_ptr<RECT> r(new RECT,true);
							::SetRect(r, base_l,div_b,base_r,base_b);
							rects.insert( r );
						}
					}
				}

			} // for
		}

		// ↓ 減算する矩形を削除した結果の新しい矩形集合を使ってDirtyRectを再構築
		int nNewSize = rects.size();

		Clear(); // 一旦消して

		// 配列の要素数がたりなきゃリサイズ
		if(m_nRectSize < nNewSize) {
			Resize(nNewSize);
		}

		// 準備が整ったので再構築して完了
		for(int j = 0; j < nNewSize; j++) {
			AddRect( *rects[j], nNewSize );
		}
	}
}
