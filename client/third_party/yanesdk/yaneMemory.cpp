#include "stdafx.h"
#include "yaneCriticalSection.h"

//	new,deleteごとにログ記録を残すか？
#ifdef	USE_MEMORY_CHECK

/*
	newとdeleteで、ログを吐き出す。この吐き出されたログのうち、
	newしてdeleteしていない部分を突き止めるには、たとえばPerlで
	次のようなプログラムを書けば良い。

	# memcheck.pl
	while (<>) {
		if		(m/new[\s]*([a-f\d]+)[\s]*:[\s]*([\d]+)/){
			$dat{$1} = $2;
		} elsif (m/del[\s]*([a-f\d]+)/){
			delete $dat{$1};
		}
	}

	foreach (keys %dat) {
		print "$_ : $dat{$_}\n";
	}

	//	上記のプログラムは、標準入力からテキストを得て、
	//	標準入力に出力しているので、実行は、

	jperl memcheck.pl < debug_memory.txt > result.txt

	のようにして行なう。

	そして、newしてdeleteされていないメモリ／サイズが特定できれば、
	今度は、以下のoperator newの関数内で、そのメモリであるかを
	チェックするif文を書いて、その条件成立時のところにブレーク
	ポイントを仕掛けて走らせてみる。そうすれば、どこで確保された
	メモリが解放されていなかったかがわかる。

*/

void* operator new (size_t t){
	void *p = ::malloc(t);

	FILE*fp=fopen("debug_memory.txt","aw+");
	fprintf(fp,"new %.8x :%d\n",p,t);
	fclose(fp);

	return p;
}

void operator delete(void*p){
	if (p==NULL) return ;

	FILE*fp=fopen("debug_memory.txt","aw+");
	fprintf(fp,"del %.8x\n",p);
	fclose(fp);

	::free(p);
}

#endif

///////////////////////////////////////////////////////////////////////////////

#ifdef USE_YANE_NEWDELETE	//	new,deleteのカスタマイズバージョン(高速)

//	一斉に確保するメモリ
static	BYTE* g_lpaMemory = 0;		//	一斉確保するメモリ
static bool g_bInitialize = false;	//	上のメモリは初期化されているか？
const	int g_nBlockSize = 16;		//	1ブロックのサイズ(byte)
const	int g_nBlockNum = 4096;		//	この数だけ一気にブロック確保
//	16*4096 = 64K　これくらいならば許せるだろう

static int  g_anBlank[g_nBlockNum];				//	空きエリアを記憶する
static int  g_nMax;

// クリティカルセクション
static CCriticalSection* g_pCS = NULL;
// g_pCSをNULLにする(atexit関数で実行される)
void _cdecl InvalidateCriticalSectionObject(void)
{
	g_pCS = NULL;
}

void* operator new (size_t t)
{
	static BYTE aanHeap[g_nBlockNum][g_nBlockSize];	//	ヒープメモリ
	//	ローカルで確保するのは、終了時に自動的に解放されるように

	static CCriticalSection cs;
	if ( !g_bInitialize ) {	//	DoubleChecking
		cs.Enter();
		if ( !g_bInitialize ) {
			g_nMax = g_nBlockNum;				//	すべて空き
			for (int i=0;i<g_nBlockNum;++i) {
				g_anBlank[i] = i;
			}
			g_lpaMemory = (BYTE*)aanHeap;	// これをグローバル変数に伝播させておく
			g_bInitialize = true;	//	初期化終了
			g_pCS = &cs;	//	グローバル変数に伝搬
			atexit(&InvalidateCriticalSectionObject);	//	少なくとも終了時にはSingleThreadと仮定する
		}
		cs.Leave();
	}

	cs.Enter();
	if ( g_nMax==0 || g_nBlockSize<t ) {
		//	空きエリアあらへん or 規定サイズ以上のメモリ確保要求
		cs.Leave();
		return (void *)::malloc(t);
	}

	//	空きブロックを返す
	void* p = (void*)&aanHeap[g_anBlank[--g_nMax]];
	cs.Leave();
	return p;
}

void operator delete(void*p)
{
	//	newが一度も呼び出されていないのにdeleteが呼び出されることは無い
	//	（と仮定している）
	int n = (BYTE*)p - (BYTE*)g_lpaMemory;

	if (g_pCS!=NULL) g_pCS->Enter();
	//	自分のヒープ上のメモリか？
	if ((0 <= n) && (n < g_nBlockNum*g_nBlockSize)) {
		n /= g_nBlockSize;
		g_anBlank[g_nMax++] = n;	//	メモリの解放
		if (g_pCS!=NULL) g_pCS->Leave();
		return ;
	}

	if (g_pCS!=NULL) g_pCS->Leave();
	::free(p);
}

#endif
