// yaneMacro.h :
//	簡単なマクロ集

#ifndef __yaneMacro__h__
#define __yaneMacro__h__

// ゼロで埋めるマクロ
#define ZERO(var) ZeroMemory(&var,sizeof(var));

// ポインタが非NULLならばReleaseを掛けるマクロ。
#define RELEASE_SAFE(var)	\
	if (var != NULL) {		\
		var->Release();		\
		var = NULL;			\
	}

// ポインタが非NULLならばdeleteを掛けるマクロ。
#define DELETE_SAFE(var)	\
	if (var != NULL) {		\
		delete var;			\
		var = NULL;			\
	}
//	↑これ使わずにauto_ptrを使いましょうね＾＾；

// 配列のポインタをdeleteするマクロ
#define DELETEPTR_SAFE(var) \
	if (var != NULL) {		\
		delete [] var;		\
		var = NULL;			\
	}
//	↑これ使わずにauto_arrayを使いましょうね＾＾；

//	else ifマクロ（邪道ぎみ=p）
#define ef else if

//	WARNINGマクロ
#ifdef _DEBUG
	#define WARNING(b,s)				\
		if(false&&b) {						\
			CHAR buf[256];				\
			wsprintf(buf,"%sファイルの%d行\n%s",__FILE__,__LINE__,s);	\
			MessageBox(NULL,buf,"WARNING!!",MB_OK);	\
			* LPLONG(0xcdcdcdcd) = 0;	\
		}
	//	最後の* LPLONG(0xcdcdcdcd) = 0;の部分は、メモリエラーをわざと起こすコード
#else
	#define WARNING(var,s) {}
	//	{}にしているのは、if文のあとWARNINGを入れているときなどのため。
#endif

//	トレース用のマクロ:ファイル名とラインナンバーをError.logに出力する
#define TRACE Err.Out("%s(%d)",__FILE__,__LINE__);

//	配列の要素数を返すマクロ( Number of Elements)
#define NELEMS(array) (sizeof(array) / sizeof(array[0]))

#endif
