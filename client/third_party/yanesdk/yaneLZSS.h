//	LZSSによる圧縮ルーチン
//
//	☆　参考文献
//	  奥村晴彦著『C言語による最新アルゴリズム事典』／技術評論社
//

#ifndef __yaneLZSS_h__
#define __yaneLZSS_h__

const int LZSS_RING_BUFFER		= 4096; // 環状バッファの大きさ
const int LZSS_LONGEST_MATCH	= 18;	// 最長一致長

class CLZSS {
public:
	//	Decodeする。Dst先のバッファはbDstがtrueならば確保される
	LRESULT Decode(BYTE* lpSrc,BYTE*& lpDst,DWORD  dwSize,bool bDst=true);

	//	Encodeする。Dst先のバッファはbDstがtrueならば確保される
	LRESULT Encode(BYTE* lpSrc,BYTE*& lpDst,DWORD  dwSize,DWORD& dwDstSize,bool bDst=true);

private:
	//	出力バイト数カウンタ
	DWORD	m_dwOutCount;

	// テキスト用バッファ
	UCHAR	m_szText[LZSS_RING_BUFFER+LZSS_LONGEST_MATCH-1];

	//	木
	int		m_dad[LZSS_RING_BUFFER+1];
	int		m_lson[LZSS_RING_BUFFER+1];
	int		m_rson[LZSS_RING_BUFFER+257];

	void	init_tree(void);	//	木の初期化
	void	insert_node(int r);	//	節 r を木に挿入
	void	delete_node(int p);	//	節 p を木から消す

	int		m_matchpos, m_matchlen;	 /* 最長一致位置, 一致長 */

};

#endif
