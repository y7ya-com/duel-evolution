#include "stdafx.h"
#include  <mbctype.h> // _ismbblead
#include "yaneFile.h"
#include "yaneLZSS.h"
#include "yaneCriticalSection.h"	// [Konami] added: for the file cache lock
/*	yaneSDK3rdから出張中^^;
#include "../AppFrame/yaneAppInitializer.h"

//	CFileの初期化用オブジェクト
CFileInitializer::CFileInitializer(){
	smart_ptr<function_callback> p(
		function_callback_v::Create(CFile::SetCurrentDir));
	CAppInitializer::RegistInitCallback(p);
}
CFileInitializer CFileInitializer::m_dummy;
*/

//////////////////////////////////////////////////////////////////////////////

string	CFile::m_szCurrentDirectory;		// 現在対象としているディレクトリ
vector<string>	CFile::m_aszPathList;	// パスリスト	// [Konami] was smart_ptr<vector<string> >
// [Konami] added: language code used to replace '?' in file names (name is ours)
char	CFile::m_szLanguage[3] = "ee";

//////////////////////////////////////////////////////////////////////////////
//	<yanepack用構造体について>
//		ファイルヘッダー "yanepack" 8バイト + 格納ファイル数 DWORD
//		その後、以下のCFileInfoが格納ファイル数だけ来て、あとはデータ
struct CFileInfo {
	CHAR	filename[32];
	DWORD	startpos;	//	seek pos
	size_t	filesize;	//	file size
};
struct CFileInfoEx {
	CHAR	filename[32];
	DWORD	startpos;	//	seek pos
	size_t	filesize;	//	file size(圧縮サイズ)
	size_t	arcsize;	//	arc size (展開後のファイルサイズ)
};
struct CFileInfoDx {
	CHAR	filename[256];	//	階層化ファイルなので、サイズでかしとこ
	DWORD	startpos;	//	seek pos
	size_t	filesize;	//	file size(圧縮サイズ)
	size_t	arcsize;	//	arc size (展開後のファイルサイズ)
};
//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00525dc0 manual
CFile::CFile() {
	m_lpFile = NULL;
	m_lpFileAdr		= NULL;
	m_dwFileSize	= 0;
	m_lpFileMemPos	= NULL;
	m_bEncode		= false;
	m_bTempFile		= false;
	m_bCompress		= false;
	m_bMemoryImage	= false;
	m_dwReadSize	= 0;	// [Konami] added
	m_dwStartPos	= 0;	// [Konami] added
}

// @yo2 0x00525e80 manual
CFile::~CFile() {
	Close();
}

// @yo2 0x00525fb0 vt
LRESULT CFile::Close(){
	if (m_lpFile!=NULL) {
		LRESULT l;
		l = ::fclose(m_lpFile);
		m_lpFile = NULL;
		return l;
	}
	if (m_bMemoryImage) {
	//	メモリ上の仮想ファイル
		m_lpFileAdr = NULL;
		m_dwFileSize = 0;
		m_lpFileMemPos = NULL;
		m_bMemoryImage = false;
	}
	if (m_lpFileAdr!=NULL) {
		::GlobalFree(m_lpFileAdr);
//		delete [] m_lpFileAdr;
		m_lpFileAdr = NULL;
		m_dwFileSize = 0;
		m_lpFileMemPos = NULL;
	}
	if (m_bTempFile) {
		m_bTempFile = false;
		Delete(m_szFileName);	//	ファイルの削除
	}
	m_bCompress	= false;
	return 0;
}

//	ファイルの削除
// @yo2 0x00526030 vt
LRESULT	CFile::Delete(const string& filename){
	//	こんなん渡すなよ...
	if (filename.empty()) return -1;

	string fn(MakeFullName(filename));
	return !::DeleteFile(fn.c_str());
}

// @yo2 0x005260d0 vt
LRESULT	CFile::CreateTemporary(){
	if (m_lpFileAdr==NULL) return 1;
	if (m_bCompress || m_bMemoryImage) {
	//	圧縮ファイルか、メモリイメージ（ファイル実体が無い）
	//	のときのみduplicateする

		string szTmpFileName;
		LRESULT lr = GetTemporaryFileName(szTmpFileName);
		if (lr!=0) return 2;

		if (WriteBack(szTmpFileName) != 0) {
//			Err.Out("CFile::CreateTemporary::テンポラリファイルに書き込めない。");
			return 2;
		}
		Close();
		//	write backしたほうを自分のガメっているファイル名とする
		m_bTempFile = true;
		m_szFileName = szTmpFileName;
	} else {
		//	こちらも、Closeしてしもたほうが健全＾＾；
		string s;
		s = m_szFileName;
		Close();
		m_szFileName = s;
	}
	return 0;
}


// @yo2 0x005262e0 feat
LRESULT	CFile::GetTemporaryFileName(string& szFileName){
	//	テンポラリファイルを取得する

	CHAR	szTmpPath[MAX_PATH];
	CHAR	szTmpFileName[MAX_PATH];
	if (::GetTempPath(sizeof(szTmpPath), szTmpPath) == 0) {
//		Err.Out("CFile::CreateTemporary::テンポラリパスが取得できない。");
		return 2;
	}
	if (::GetTempFileName(szTmpPath, "YNE", 0, szTmpFileName) == 0) {
//		Err.Out("CFile::CreateTemporary::テンポラリファイルが作成できない。");
		return 2;
	}
	szFileName = szTmpFileName;
	return 0;
}

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x00526450 feat
string CFile::GetCurrentDir() {
	if (m_szCurrentDirectory.empty()) {
		//	無いようなので、設定する
		CHAR dir[_MAX_PATH];
		::GetCurrentDirectory(_MAX_PATH,dir);
		SetCurrentDir(dir);
	}
	return m_szCurrentDirectory;
}

// @yo2 0x005265d0 feat
void CFile::SetCurrentDir(){
	CHAR dir[_MAX_PATH];
	::GetCurrentDirectory(_MAX_PATH,dir);
	SetCurrentDir(dir);
}

// @yo2 0x005266f0 tight
void CFile::SetCurrentDir(const string& dir){
	//	こんなん渡すなよ...
	if (dir.empty()) return ;

	bool bDir = false;
	m_szCurrentDirectory = dir;
	if (m_szCurrentDirectory[0]=='"') {
		bDir = true;
		m_szCurrentDirectory.erase(0,1);	// コマンドラインを渡したなぁ...
	}
	// c:\test\test.exe　のようにコマンドラインを入れてカレントディレクトリが
	// 設定できるように工夫。(bDir==trueのとき)
	// c:\test\　まで。最後の\を含めて保存。

	string::size_type pos;
	if (bDir) {
		pos = m_szCurrentDirectory.find('.');
	} else {
		pos = string::npos;
	}
	string::iterator it;
	if (pos==string::npos) {		// . が無いならば
		it = m_szCurrentDirectory.end() - 1;
		if (*it!='\\' && *it!='/') {	
			// \か/で終わっていないならば\を追加
			m_szCurrentDirectory += '\\';
		}
	} else { // c:\test\test or c:\test\test.exe
		GetParentDir(m_szCurrentDirectory);
	}
}

// @yo2 0x00526960 cg
LRESULT	CFile::GetParentDir(string& filename){						//	親フォルダを返す
// e.g. "c:\test1\test2\test3.exe" -> "c:\test1\test2\" -> "c:\test1\" -> "c:\" -> "c:\"
	//	漢字の１バイト目を避ける必要あり...
	//
	//	1. もし、ネットワークドライブで有れば、コンピュータ名をスキップする。
	//	　　そうすることで、ローカルのパスと同じ扱いになる。
	//　　　（\\HOST\PATH までが、ドライブレターであるとする ＞ 仕様
	//	2. \と/を探す。その際に最後に見つかった位置と最後から２番目に見つかった位置を記録しておく
	//	3. 末尾が\でも/でもない場合、ルートならば￥を付加する。ルートでなければ、最後　　　　　に見つかったところまでを親ディレクトリとして返す
	//	4. 末尾が\ か /である場合　、ルートならばそのまま返す。ルートでなければ、最後から２番目に見つかったところまでを親ディレクトリとして返す
	//
	//	2001/07/29 sohei
	//	  ルートに有るファイル名を渡されたら\や/は一つしかないが、ルートを返さないといけない
	//	2001/08/06 sohei
	//	  string が \ を付加することで拡張された場合、バグるのを修正
	//	　ねこ☆あるふぁ～　さん報告有り難うございます。

	if (filename.empty()) return 1;	//	こんなん渡すな^^;

	string::iterator it = filename.begin();
	if (filename.substr(0,2)=="\\\\") {
		//	ネットワークパス
		it += 2;	if (*it == '\0')	return 1;	//	\\ でおわりかいな^^;
		//	このときは、コンピュータ名をスキップする
		bool bKanji=false;
		for (;true; it++) {
			if (*it == '\0') break;
			if (bKanji) { bKanji=false; continue; }
//			if (((BYTE)*it>=0x80 && (BYTE)*it<=0xa0) || ((BYTE)*it>=0xe0 && (BYTE)*it<=0xff)) {
			if (_ismbblead(*it)){
				bKanji = true;	//	２バイトコードの１バイト目であった
			} else {
				bKanji = false;	//	２バイトコードの１バイト目ではなかった
				if (*it == '\\' || *it=='/') {	//	区切り文字
					it++;	//	\\HOST\ の次からとすればローカルと同じ扱いになる
					break;
				}
			}
		}
	} else {
	}
	string::iterator pos1,pos2;	
	// pos1 : 最後に見つかった\か/の位置
	// pos2 : 最後から２番目に見つかった\か/の位置
	pos1 = pos2 = string::iterator();	// not found  [portable] was NULL (VC6 iterators are pointers)

	bool bKanji=false;
	
	while (true) {
		if (*it == '\0') break;
		if (bKanji) { bKanji=false; goto skip; }
//		if (((BYTE)*it>=0x80 && (BYTE)*it<=0xa0) || ((BYTE)*it>=0xe0 && (BYTE)*it<=0xff)) {
		if (_ismbblead(*it)){
			bKanji = true;	//	２バイトコードの１バイト目であった
		} else {
			bKanji = false;	//	２バイトコードの１バイト目ではなかった
			if (*it == '\\' || *it=='/') {	//	区切り文字
				pos2 = pos1;
				pos1 = it;
			}
		}
skip:;
		it++;
	}
	//	2001/08/06	sohei
	//		string が伸張したときに、イテレータが無効になって、
	//		不正な処理を引き起こしていたのを修正。
	//		ねこ☆あるふぁ～　さん有り難うございます。

	//	末尾が\でも/でもないやん
	if ( !bKanji && (*(it-1)!='\\' && *(it-1)!='/')) {
		//	この場合は最後に見つかった所までが必要。
		if (pos1 == string::iterator()) {	// [portable] was NULL
			//	一つも\が無いならルートなので\を付加する
			filename+='\\';
		} else {
			filename.erase(pos1+1,filename.end());	//	ルートではないので、最後に見つかったところまでを返す
		}
	} else {
		//	この場合は２番目に見つかった所までが必要。
		if (pos2 == string::iterator()) return 1;	// [portable] was NULL
			//	ルートなんで取り除く必要はない
		filename.erase(pos2+1,filename.end());		//	最後から２番目までを返せばよい
	}
	return 0;
}

// @yo2 0x00526d10 vt
string	CFile::GetSuffix(){
	return GetSuffixOf(m_szFileName);
}

// @yo2 0x00526d50 vt
string	CFile::GetPureFileName(){
	return GetPureFileNameOf(m_szFileName);
}

// ------ static function ------
// @yo2 0x00526d90 cg
string	CFile::GetSuffixOf(const string& filename){
	string suffix;
	suffix = GetPureFileNameOf(filename);
	// 　　　　↑間にディレクトリ記号があるとまずいのでパス名除去
	string::size_type pos;
	pos = suffix.rfind('.');
	if (pos==string::npos) {
		suffix.erase();
	} else {
		suffix.erase(0,pos+1);
	}
	return suffix;
}	

// @yo2 0x00527030 cg
string	CFile::GetPureFileNameOf(const string& filename){

	if (filename.empty()) return string("");

	string purefilename;
	string::iterator pos1;
	// pos1 : 最後に見つかった\か/の位置
	purefilename = filename;
	string::iterator it = purefilename.begin();
	pos1 = string::iterator();	// not found  [portable] was NULL
	bool bKanji=false;
	while (true) {
		if (*it == '\0') break;
		if (bKanji) { bKanji=false; goto skip; }
//		if (((BYTE)*it>=0x80 && (BYTE)*it<=0xa0) || ((BYTE)*it>=0xe0 && (BYTE)*it<=0xff)) {
		if (_ismbblead(*it)){
			bKanji = true;	//	２バイトコードの１バイト目であった
		} else {
			bKanji = false;	//	２バイトコードの１バイト目ではなかった
			if (*it == '\\' || *it=='/') {
				pos1 = it;
			}
		}
skip:;
		it++;
	}
	if (pos1!=string::iterator()){	// [portable] was NULL
		purefilename.erase(purefilename.begin(),pos1+1);
	}
	return purefilename;
}

//////////////////////////////////////////////////////////////////////////////
//	static function..
// @yo2 0x005272b0 cg
void  CFile::ToLower(string &str){
	//	小文字化する(do_tolower)
//	LPSTR it = str.begin();
	string::iterator it = str.begin();
	bool bSkip = false;
	while (it!=str.end()){
		if (bSkip) {
			bSkip = false;
			goto Repeat;
		}

//		if (((BYTE)*it>=0x80 && (BYTE)*it<=0xa0) || ((BYTE)*it>=0xe0 && (BYTE)*it<=0xff)) {
		if (_ismbblead(*it)){
			//	２バイトコードの１バイト目であった
			bSkip = true;
			goto Repeat;
		} else {
			//	２バイトコードの１バイト目ではなかった
			bSkip = false;
		}
		*it = tolower(*it);
Repeat:;
		++it;
	}
}
//////////////////////////////////////////////////////////////////////////////

// @yo2 0x005273e0 manual
LRESULT CFile::Open(const string& filename,const string& access)
{
	//	[Konami] rewritten.
	//	A '?' in the file name is replaced by the language code: szName1 uses
	//	m_szLanguage[0] (primary), szName2 uses m_szLanguage[1] (fallback).
	//	For "rb" opens the path list is searched first; then the current
	//	folder; then the path list again.
	string szFileName(filename);
	string szName1;
	string szName2;
	szName1 = szFileName;
	szName2 = szFileName;
	string::size_type pos = szFileName.find('?');
	if (pos!=string::npos) {
		szName1[pos] = m_szLanguage[0];
		szName2[pos] = m_szLanguage[1];
	}
	string szFound;		//	fallback-language file found in the path list
	bool bFound = false;
	LRESULT lr;

	m_aszLocalPathList = m_aszPathList;
	if (access=="rb" && !m_aszLocalPathList.empty()) {
		vector<string>::iterator it;
		for (it = m_aszLocalPathList.begin(); it!=m_aszLocalPathList.end(); it++) {
			lr = InnerOpen(*it + '/' + szName1, access);
			if (lr == 0) return 0;
			if (!bFound) {
				lr = InnerOpen(*it + '/' + szName2, access);
				if (lr == 0) {
					bFound = true;
					szFound = *it + "/" + szName2;
				}
			}
		}
	}

	//	カレントフォルダの読み込み
	lr = InnerOpen(MakeFullName(szName1), access);
	if (lr==0) return 0;
	if (!bFound) {
		lr = InnerOpen(MakeFullName(szName2), access);
	} else {
		lr = InnerOpen(MakeFullName(szFound), access);
	}
	if (lr==0) return 0;

	m_aszLocalPathList = m_aszPathList;
	if (m_aszLocalPathList.empty()) return lr;	//	パス指定されてないじゃん．．＾＾；

	//	設定されていたパスを順次たどって調べる
	vector<string>::iterator it = m_aszLocalPathList.begin();
	while (it!=m_aszLocalPathList.end()){
		lr = InnerOpen(*it + '/' + szName1, access);
		if (lr == 0) return 0; // いけたじょ＾＾；
		lr = InnerOpen(*it + '/' + szName2, access);
		if (lr == 0) return 0;
		it++;
	}
	return lr;	//	だめだったじょ、、（たぶん）
}

//	[Konami] removed: the fopen-only InnerOpen that was here; it was rewritten
//	(archive support) and moved below, after RemovePackCache.

// @yo2 0x00527c80 vt
LRESULT CFile::Write(const string& s) {
	if (m_lpFile==NULL) return -1;
	if (fprintf(m_lpFile, "%s", s.c_str())<0) return 1;
	return 0;
}

// @yo2 0x00527cd0 vt
LRESULT	CFile::WriteBack(const string& filename){
	return Write(filename,GetMemory(),GetSize());
}

//////////////////////////////////////////////////////////////////////////////

// @yo2 0x00527d10 vt
DWORD	CFile::GetSize() const {
	if (m_bEncode) return m_dwFileSize - 4;	//	４バイト減る
	return m_dwFileSize;
}

// @yo2 0x00527d30 vt
LPVOID	CFile::GetMemory() const {
	if (m_bEncode) return (BYTE*)m_lpFileAdr + 4;	//	識別ヘッダの４バイトずれる
	return m_lpFileAdr;
}

// @yo2 0x00527d50 vt
LRESULT	CFile::Encode(){
	if (*(DWORD*)m_lpFileMemPos == 0x314B5059) return 1;	// already encoding!!
	if (m_bEncode) return 1;	//	already encoding!!
	
	DWORD size = m_dwFileSize+4;
	BYTE* m_lpFileAdr2 // = new BYTE[size+1];
		= (BYTE*)GlobalAlloc(GMEM_FIXED | GMEM_NOCOMPACT,size+1);

	//	１バイト多めに確保して、最後は\0を保証する。そうすれば、
	//	文字列比較等がやりやすくなる。
	*((BYTE*)m_lpFileAdr2 + size) = 0;

	for (DWORD i=0;i<size-4;i++){
		//	ニブルで入れ替えるだけ:p
		*(m_lpFileAdr2+i+4) =	(((*((BYTE*)m_lpFileAdr+i) & 0xf) << 4) +
								 ((*((BYTE*)m_lpFileAdr+i) &0xf0) >> 4)) ^ 0xcc;
	}
	*(DWORD*)m_lpFileAdr2 =	 0x314B5059;	// YPK1:ヘッダ付与

	Close();

	m_lpFileAdr		= (LPVOID)m_lpFileAdr2;
	m_dwFileSize	= size;
	m_lpFileMemPos	= (LPSTR)m_lpFileAdr; // for ReadLine
	m_bEncode		= false;	//	あえてfalseにすることによってヘッダー付与
	return 0;
}

// @yo2 0x00527e10 feat
string	CFile::GetWindowsDir(){
	//	Windowsディレクトリの取得（終端は\\）
	CHAR	buf[MAX_PATH];
	::GetWindowsDirectory(buf,MAX_PATH);
	if (buf[::lstrlen(buf)-1]!='\\'){	//	終端は'\'か？
		::lstrcat(buf,"\\");
	}
	return buf;	//	コピーコンストラクタが起動するので安全
}

//////////////////////////////////////////////////////////////////////////////
// @yo2 0x00527f70 cg
string	CFile::MakeFullName(const string& filename){	// 起動ディレクトリを補って完全パスを作る
	string file;
	if (filename.substr(0,2)=="\\\\") {
			//	ネットワークパスなので何もしない
			file = filename;
	} else {
		string::size_type pos = filename.find(':');
		if (pos==string::npos) {
			//	フルパスでなければカレントディレクトリを補う

			// ..\\での駆け上がり相対パスをサポート
			string dir;
//			dir = m_szCurrentDirectory;
			dir = GetCurrentDir();
				//	↑設定されていなければ、この瞬間に設定する
			file = filename;
			while (true) {
				if (file.substr(0,3)=="..\\" || file.substr(0,3)=="../"){
					GetParentDir(dir);
					file.erase(0,3);
				} else if ((file.substr(0,2)==".\\" || file.substr(0,2)=="./")) {
					//	./によりカレントフォルダを示す
					file.erase(0,2);
				} else if (!_ismbblead(file.at(0))&&(file.substr(0,1)=="\\" || file.substr(0,1)=="/")){
					//	\単独なら無視する  マルチバイト文字の1byte目を考慮する
					file.erase(0,1);
				} else {
					break;
				}
			}
			file = dir + file;
		} else {
			file = filename;
		}
	}
	/*
		'01/10/07	やねうらお
			/	だとうまく読み込めないことがあるようなので、\に置換する＾＾；
		'02/02/11	炎羅
			マルチバイトを考慮していなかったので修正した
			ファイルの存在チェックをして、無かったらGetPathで探すようにした
	*/


//	コメントアウト by やねうらお '02/03/14 01:36
#if 0

	// GetPath()!=NULL時は、指定されたファイルが存在するかチェック
	if(!GetPath().isNull()){
		bool bFound = false;
		if(!PathFileExists(file)){
			// 圧縮されているかも
			string fullname(file);
			string inner_filename(fullname);
			GetParentDir(fullname);
			inner_filename.erase(0, fullname.size());
			fullname[fullname.size() - 1] = '.';
			fullname += "dat";
			if(PathFileExists(fullname)) { bFound=true; }	// 圧縮ファイルが見つかった
		}else{
			bFound=true;
		}

		// 見つからないって事は他の場所にある
		if(!bFound){
			const string file2 = file;
			vector<string>::iterator it = GetPath()->begin();
			while(it!=GetPath()->end()){
				file = *it + '/' + filename;
				if(!PathFileExists(file)){
					// 圧縮されているかも
					string fullname(file);
					string inner_filename(fullname);
					GetParentDir(fullname);
					inner_filename.erase(0, fullname.size());
					fullname[fullname.size() - 1] = '.';
					fullname += "dat";
					if(PathFileExists(fullname)) { bFound=true;	 break; }	// 圧縮ファイルが見つかった
				}else{
					bFound=true;  break;
				}
				it++;
			}
			// 見つからなかったら、カレントのに戻しておこう
			if(!bFound) { file = file2; }
		}
	}
#endif

	{
		bool bKanji=false;
		string::iterator it = file.begin();
		while (it!=file.end()){
			if ( bKanji ) {
				bKanji=false;
				it++;
				continue ;
			}
			//	２バイトコードの１バイト目ではなかった
			if ( *it == '/' ) { *it='\\'; }
			if ( _ismbblead(*it) ) {
				//	２バイトコードの１バイト目であった
				bKanji=true;
			}
			it++;
		}
	}

	return file;
}

// @yo2 0x00528640 feat
bool CFile::PathFileExists(const string& fullname)
{
	HANDLE hFile = ::CreateFile(fullname.c_str(),
		GENERIC_READ,		// Read
		FILE_SHARE_READ,	// ReadOpenなら共有を許すのはマナー 
		NULL,				// security
		OPEN_EXISTING,		// 存在してなければエラー
		FILE_ATTRIBUTE_NORMAL,	//	ファイル属性
		NULL				// テンプレートファイル
	);

	if (hFile == INVALID_HANDLE_VALUE) { // あかんやん！
		// closeする必要はない(INVALIDハンドルなんだし)
		return false;
	}
	::CloseHandle(hFile);
	return true;
}

//////////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////
//	[Konami] added: language code / file cache / archive index cache
//	(the struct name CPackFileCache is from the exe's RTTI; every other
//	 name in this block is ours)

// @yo2 0x00528690 manual
void CFile::ReplaceLanguage(string& filename){
	string::size_type pos = filename.find('?');
	if (pos!=string::npos) {
		filename[pos] = m_szLanguage[0];
	}
}

//	index of an opened archive (*.dat with the "KCEJYUGI" header)
struct CPackFileCache {
	string					m_szFileName;	//	archive full path (lower case)
	int						m_nFileNum;		//	number of entries
	auto_array<CFileInfoDx>	m_aInfo;		//	entries (file names nibble-decoded)
};

static vector<smart_ptr<CPackFileCache> >	g_avPackCache;	//	opened archives
static vector<smart_ptr<CFile> >			g_avFileCache;	//	files kept in memory
static CCriticalSection						g_csFileCache;	//	lock for g_avFileCache

//	debug trace; empty in this build (a variadic inline, so it is still
//	emitted and called)
// @yo2? 0x00528910 order
inline void FileCacheTrace(LPCSTR lpszFormat,...){}

// @yo2 0x00528ab0 manual
void CFile::AddCache(string filename){
	ToLower(filename);
	if (filename.rfind(".png")==string::npos) return;	//	.png only
	if (FindCache(filename)!=NULL) return;				//	already cached

	CFile* lpFile = new CFile;
	if (lpFile==NULL) return;
	lpFile->Read(filename);

	g_csFileCache.Enter();
	{
		smart_ptr<CFile> p;
		p.Add(lpFile);
		g_avFileCache.push_back(p);
	}
	g_csFileCache.Leave();
	FileCacheTrace("AddCache %s\n",filename.c_str());
}

// @yo2 0x00528d20 manual
CFile* CFile::FindCache(string filename){
	CFile* lpFile = NULL;
	string szKey = "merge/" + ConvertSlash(filename);

	g_csFileCache.Enter();
	vector<smart_ptr<CFile> >::iterator it;
	for (it = g_avFileCache.begin(); it!=g_avFileCache.end(); it++) {
		if ((*it)->GetName() == szKey) {
			FileCacheTrace("☆FindCache %s\n",filename.c_str());
			lpFile = it->get();
			break;
		}
	}
	g_csFileCache.Leave();
	return lpFile;
}

// @yo2 0x00528f50 manual
void CFile::RemoveCache(string filename){
	g_csFileCache.Enter();
	vector<smart_ptr<CFile> >::iterator it;
	for (it = g_avFileCache.begin(); it!=g_avFileCache.end(); it++) {
		if ((*it)->GetName() == filename) {
			g_avFileCache.erase(it);
			//	sic: the exe deletes it->get() AFTER the erase, i.e. the element
			//	that was moved into this slot (erase already deleted the matched
			//	CFile through smart_ptr::operator=)
			delete it->get();
			break;
		}
	}
	g_csFileCache.Leave();
}

// @yo2 0x00529170 manual
void CFile::AddCacheByPrefix(string filename){
	ToLower(filename);
	ConvertSlash(filename);

	g_csFileCache.Enter();
	vector<smart_ptr<CPackFileCache> >::iterator it;
	for (it = g_avPackCache.begin(); it!=g_avPackCache.end(); it++) {
		CPackFileCache* lpPack = it->get();
		for (int i=0;i<lpPack->m_nFileNum;i++){
			if (::strncmp(ConvertSlash(filename).c_str(),
					lpPack->m_aInfo[i].filename,filename.size())==0) {
				AddCache(((CFileInfoDx*)lpPack->m_aInfo)[i].filename);
			}
		}
	}
	g_csFileCache.Leave();
}

// @yo2 0x005293f0 manual
string CFile::ConvertSlash(string& filename){
	while (true) {
		string::size_type pos = filename.find("/");
		if (pos==string::npos) return filename;
		filename[pos] = '\\';
	}
}

// @yo2 0x00529640 manual
void CFile::RemovePackCache(string filename){
	string fullname;
	fullname = MakeFullName(filename).c_str();
	string s(fullname);
	ToLower(s);

	vector<smart_ptr<CPackFileCache> >::iterator it;
	for (it = g_avPackCache.begin(); it!=g_avPackCache.end(); it++) {
		if ((*it)->m_szFileName == s) {
			if (!it->isNull()) {
				g_avPackCache.erase(it);
			}
			break;
		}
	}
}

//////////////////////////////////////////////////////////////////////////////

// [Konami] added (vtable slot 4)
// @yo2 0x005298f0 manual
LONG CFile::Seek(LONG lOffset){
	if (m_lpFile!=NULL) {
		return ::fseek(m_lpFile,lOffset,SEEK_CUR);
	}
	return 0;
}

// [Konami] added (vtable slot 5): position relative to the start of the file
// @yo2 0x00529920 manual
LONG CFile::Tell(){
	if (m_lpFile!=NULL) {
		return ::ftell(m_lpFile) - m_dwStartPos;
	}
	return 0;
}

// [Konami] added: close the stream only (Close() would also free the memory)
// @yo2 0x00529950 manual
LRESULT CFile::InnerClose(){
	if (m_lpFile!=NULL) {
		LRESULT l;
		l = ::fclose(m_lpFile);
		m_lpFile = NULL;
		return l;
	}
	return 0;
}

static LPSTR DecodeFileName(LPSTR lpsz);

//	[Konami] rewritten (was a plain fopen). Opens filename as a stream; if it
//	does not exist, climbs the folders looking for "<folder>.dat" archives
//	("KCEJYUGI" header, CFileInfoDx entries with nibble-swapped names, sorted
//	for a binary search) exactly like the old InnerRead did, and leaves the
//	stream positioned at the start of the file inside the archive.
//	Also handles the "!%x,%x" memory image that InnerRead used to handle.
// @yo2 0x00529980 manual
LRESULT CFile::InnerOpen(const string& filename,const string& access)
{
	if (filename.empty()) return -1; // 空やん？

	int nFileType = 0;
	//	0:普通のファイル 3:KCEJYUGI(yanePackDx)

	m_szFileName = filename;
	Close(); // 前に読み込んでたら、それを解放するなり！

	if (filename[0] == '!') {
		//	メモリイメージ
		if(::sscanf(filename.c_str(),"!%x,%x",&m_lpFileAdr,&m_dwFileSize)!=2) {
			return 6; // メモリ上のファイルでないやん？
		}
		m_dwReadSize	= m_dwFileSize;
		m_lpFileMemPos	= (LPSTR)m_lpFileAdr;
		m_bMemoryImage	= true;
	} else {
		m_bMemoryImage = false;

		string fullname;
		fullname = MakeFullName(filename).c_str();
		//	note: the plain file is opened by the name as given, not by fullname
		m_lpFile = ::fopen(filename.c_str(),access.c_str());

		if (m_lpFile == NULL) {
			//	ひょっとして圧縮ファイルか？
			//	test/script/game.c
			//	⇒ test/script.datにgame.cを探す
			//	⇒ test.datにscript/game.cを探す
			string inner_filename(fullname);
			string dirname(fullname);
			CPackFileCache* lpPack;
			int filenum;

		//	---- 圧縮ファイルは駆け上がって調べるので、そのリトライループ
CompressFileRetry:;
			GetParentDir(dirname);
			{
				string temp(dirname);
				GetParentDir(temp);
				if (temp==dirname){
					return 1;	//	これ以上、駆け上がれましぇん
				}
			}

			inner_filename = fullname.substr(dirname.size()
				,fullname.length()-dirname.length());
			dirname[dirname.size() - 1] = '.';
			dirname += "dat";

			m_lpFile = ::fopen(dirname.c_str(),access.c_str());
			if (m_lpFile == NULL) {
				goto CompressFileRetry;
			}

			//	already-read archive index?
			ToLower(dirname);
			{
				vector<smart_ptr<CPackFileCache> >::iterator it;
				for (it = g_avPackCache.begin(); it!=g_avPackCache.end(); it++) {
					if ((*it)->m_szFileName == dirname) {
						lpPack		= it->get();
						nFileType	= 3;
						filenum		= lpPack->m_nFileNum;
						goto FoundPack;
					}
				}
			}

			//	圧縮ファイルが見つかった！
			{
				CHAR ident[9];
				ident[8] = '\0';
				if (::fread(ident,8,1,m_lpFile)==0){
					InnerClose();
					goto CompressFileRetry;
				}
				if (!strcmp(ident,"KCEJYUGI")) nFileType = 3;
				if (nFileType==0) {
					InnerClose();
					goto CompressFileRetry;
				}

				if (::fread(&filenum,sizeof(filenum),1,m_lpFile)==0){
					InnerClose();
					goto CompressFileRetry;
				}

				lpPack = new CPackFileCache;
				lpPack->m_szFileName = dirname;
				lpPack->m_nFileNum = filenum;
				lpPack->m_aInfo.resize(filenum);
				if (::fread(lpPack->m_aInfo.get(),filenum*sizeof(CFileInfoDx),1,m_lpFile)==0){
					delete lpPack;
					InnerClose();
					goto CompressFileRetry;
				}
				for(int i=0;i<filenum;i++){
					DecodeFileName(lpPack->m_aInfo[i].filename);
				}
				smart_ptr<CPackFileCache> p;
				p.Add(lpPack);
				g_avPackCache.push_back(p);
			}

FoundPack:;
			ToLower(inner_filename);
			{
				//	entries are sorted by name: binary search
				int nLow = 0;
				int nHigh = filenum - 1;
				while (nLow < nHigh) {
					int nMid = (nLow + nHigh) / 2;
					int nCmp = strcmp(lpPack->m_aInfo[nMid].filename,inner_filename.c_str());
					if (nCmp < 0) {
						nLow = nMid + 1;
					} else if (nCmp == 0) {
						nLow = nMid;
						goto FoundFile;
					} else {
						nHigh = nMid;
					}
				}
				if (strcmp(lpPack->m_aInfo[nLow].filename,inner_filename.c_str())!=0) {
					//	さらに駆け上がって調べる
					InnerClose();
					goto CompressFileRetry;
				}
FoundFile:;
				m_dwFileSize = lpPack->m_aInfo[nLow].filesize;
				m_dwReadSize = lpPack->m_aInfo[nLow].arcsize;
				m_dwStartPos = lpPack->m_aInfo[nLow].startpos;
			}

			m_bCompress	= true;	//	ここで設定しとこか＾＾；
			if (::fseek(m_lpFile,m_dwStartPos,SEEK_SET)!=0) {
				InnerClose();
				goto CompressFileRetry;
			}
		} else {
			// 4GB以上のファイルをメモリに読み込むことなんて考えられない
			::fseek(m_lpFile,0,SEEK_END);
			m_dwFileSize = ::ftell(m_lpFile);
			::fseek(m_lpFile,0,SEEK_SET);
			if (m_dwFileSize == 0xFFFFFFFF) {
				m_dwFileSize = 0;
				InnerClose();
				return 2; // filesizeの取得に失敗。（滅多にないと思うけど）
			}
			m_dwReadSize = m_dwFileSize;
			m_dwStartPos = 0;
		}
	}
	return 0;
}

//	[Konami] added: archive entry names are stored nibble-swapped
// @yo2? 0x0052a450 order
static LPSTR DecodeFileName(LPSTR lpsz){
	BYTE* p = (BYTE*)lpsz;
	while (*p!='\0') {
		*p = (BYTE)((*p >> 4) | (*p << 4));
		p++;
	}
	return lpsz;
}

// @yo2 0x0052a490 manual
LRESULT CFile::Read(const string& szFileName){
	//	[Konami] rewritten: first look in the file cache, then search like
	//	Open() does (language code for '?', path list, current folder).
	{
		string szLower(szFileName);
		ToLower(szLower);
		CFile* lpCache = FindCache(szLower);
		if (lpCache!=NULL) {
			//	note: m_lpFileMemPos is not set and the memory is not marked
			//	as shared (as in the exe)
			m_szFileName	= szLower;
			m_bEncode		= false;
			m_dwFileSize	= lpCache->GetSize();
			m_lpFileAdr		= lpCache->GetMemory();
			return 0;
		}
	}

	string szFile(szFileName);
	string szName1;
	string szName2;
	szName1 = szFile;
	szName2 = szFile;
	string::size_type pos = szFile.find('?');
	if (pos!=string::npos) {
		szName1[pos] = m_szLanguage[0];
		szName2[pos] = m_szLanguage[1];
	}
	string szFound;		//	fallback-language file found in the path list
	bool bFound = false;
	LRESULT lr;

	m_aszLocalPathList = m_aszPathList;
	if (!m_aszLocalPathList.empty()) {
		vector<string>::iterator it;
		for (it = m_aszLocalPathList.begin(); it!=m_aszLocalPathList.end(); it++) {
			lr = InnerRead(*it + "/" + szName1);
			if (lr == 0) return 0;
			if (!bFound) {
				//	(only probes with InnerOpen; the file is read further below)
				lr = InnerOpen(*it + "/" + szName2,string("rb"));
				if (lr == 0) {
					bFound = true;
					szFound = *it + "/" + szName2;
				}
			}
		}
	}

	//	カレントフォルダの読み込み
	lr = InnerRead(szName1);
	if (lr==0) return 0;
	if (!bFound) {
		lr = InnerRead(szName2);
	} else {
		lr = InnerRead(szFound);
	}
	if (lr==0) return 0;

	if (m_aszLocalPathList.empty()) return lr;	//	パス指定されてないじゃん．．＾＾；

	//	設定されていたパスを順次たどって調べる
	vector<string>::iterator it = m_aszLocalPathList.begin();
	while (it!=m_aszLocalPathList.end()){
		lr = InnerRead(*it + '/' + szName1);
		if (lr == 0) return 0; // いけたじょ＾＾；
		lr = InnerRead(*it + '/' + szName2);
		if (lr == 0) return 0;
		it++;
	}
	return lr;	//	だめだったじょ、、（たぶん）
}

//	[Konami] rewritten: InnerOpen(filename,"rb") does the file/archive lookup;
//	this reads the whole file into memory (LZSS-decoding when the packed size
//	differs) and closes the stream.
// @yo2 0x0052ae30 manual
LRESULT CFile::InnerRead(const string& filename){
	LRESULT lr = InnerOpen(filename,string("rb"));
	if (lr!=0) return lr;

	if (!m_bMemoryImage) {
		//	まず読み込むためのメモリ確保！
		m_lpFileAdr = (LPVOID)::GlobalAlloc(GMEM_FIXED | GMEM_NOCOMPACT,m_dwFileSize+1);
		if (m_lpFileAdr==NULL) {
			Close();
			return 3; // メモリ確保できんかったわ。
		}
		//	１バイト多めに確保して、最後は\0を保証する。
		*((BYTE*)m_lpFileAdr + m_dwFileSize) = 0;

		if (m_dwFileSize != m_dwReadSize) {
			//	圧縮ファイルなので自前で読み込む
			smart_array<BYTE> lpBuf;
			lpBuf.Add(m_dwReadSize);
			ReadData(lpBuf.get(),m_dwReadSize);
			//	圧縮ファイル
			CLZSS lzss;
			lzss.Decode(lpBuf.get(),*(BYTE**)&m_lpFileAdr,m_dwFileSize,false);
		} else {
			ReadData((BYTE*)m_lpFileAdr,m_dwReadSize);
		}
	}

	if (InnerClose()!=0) {
		Close();
		return 5; // Closeの失敗。そんなんあるんかいな...
	}

	if (*(DWORD*)m_lpFileAdr == 0x314B5059) {	//	HEADER:YPK1(yanepack1) == Data is Encoding...
		m_bEncode = true;
		for (DWORD i=4;i<m_dwFileSize;i++){
			//	ニブルで入れ替えるだけ:p
			*((BYTE*)m_lpFileAdr+i) =	(((*((BYTE*)m_lpFileAdr+i) & 0xf) << 4) +
										 ((*((BYTE*)m_lpFileAdr+i) &0xf0) >> 4)) ^ 0xcc;
		}
		m_lpFileMemPos = (LPSTR)m_lpFileAdr + 4; // for ReadLine
	} else {
		m_bEncode = false;
		m_lpFileMemPos = (LPSTR)m_lpFileAdr; // for ReadLine
	}

	return 0; // やっとこ正常終了:)
}

// @yo2 0x0052b140 vt
LRESULT CFile::Write(const string& fileName,LPVOID lpMem,DWORD dwSize){

	HANDLE hFile = ::CreateFile(MakeFullName(fileName).c_str(),
		GENERIC_WRITE,		// Write
		0,					// 
		NULL,				// security
		TRUNCATE_EXISTING,
		FILE_ATTRIBUTE_NORMAL,	//	ファイル属性
		NULL				// テンプレートファイル
	);
	//	OPEN_ALWAYSでは、前のファイルサイズが残ってしまう...

	if (hFile == INVALID_HANDLE_VALUE) { // あかんやん！
		hFile = ::CreateFile(MakeFullName(fileName).c_str(),
			GENERIC_WRITE,		// Write
			0,					// 
			NULL,				// security
			CREATE_NEW,
			FILE_ATTRIBUTE_NORMAL,	//	ファイル属性
			NULL				// テンプレートファイル
		);
		if (hFile == INVALID_HANDLE_VALUE) return 1; // Open失敗		
	}


	DWORD NumberOfBytesRead = 0;
	if (!::WriteFile(hFile,lpMem,dwSize,&NumberOfBytesRead,NULL)){
		::CloseHandle(hFile); // あれま...
		// Err.Out("CFile::Writeでファイル書き込みに失敗");
		return 2;
	}

	if (!::CloseHandle(hFile)) {
		return 3; // Closeの失敗。そんなんあるんかいな...
	}

	return 0; // やっとこ正常終了:)
}

// @yo2 0x0052b2c0 vt
string	CFile::GetName() const {
	// 読み込んでいるファイル名を返す
	return m_szFileName;
}

// @yo2 0x0052b440 vt
void CFile::Reset(){
	// [Konami] added: rewind the stream to the start of the file
	if (m_lpFile!=NULL) {
		::fseek(m_lpFile,m_dwStartPos,SEEK_SET);
	}
	m_lpFileMemPos = (LPSTR)GetMemory();
}

//	UNICODE非対応。しかもWindowsのテキストファイル専用:p
// @yo2 0x0052b480 vt
LRESULT		CFile::ReadLine(LPSTR buf,DWORD dwSize){	 // バッファはdwSizeバイト用意しといてねん
	if (m_lpFileMemPos == NULL) return 3; // どうなっとんのー！！
	if (m_lpFileMemPos >= (LPSTR)m_lpFileAdr + m_dwFileSize) return 1;

	LPSTR lp = m_lpFileMemPos;
	for(int i=0;i<dwSize-1;i++){
		if (*m_lpFileMemPos == 0x0D && *(m_lpFileMemPos+1) == 0x0A ||
			(m_lpFileMemPos >= (LPSTR)m_lpFileAdr + m_dwFileSize)) { // CR+LF
			*buf = '\0'; // 一行終了！
			m_lpFileMemPos+=2;
			return 0;
		}
		*(buf++) = *(m_lpFileMemPos++);
	}
	*buf = '\0';
	return 2;	// buffer over
}

// @yo2 0x0052b540 vt
LRESULT		CFile::ReadLine(string&s){
	// こちらは、バッファは自前で用意しなくて良い。
	//	返し値 0: 正常終了 1:EOF   3:ファイル読み込んでない＾＾；
	if (m_lpFileMemPos == NULL) return 3; // どうなっとんのー！！
	if (m_lpFileMemPos >= (LPSTR)m_lpFileAdr + m_dwFileSize) return 1;
//	if (m_lpFileMemPos+1 >= (LPSTR)m_lpFileAdr + m_dwFileSize) return 1;
				//	↑ケツに'\0'を追加しているので、+1が必要?

	LPSTR lp = m_lpFileMemPos;
	DWORD dwSize = 0;
	while (true) {
		if (*m_lpFileMemPos == 0x0D && *(m_lpFileMemPos+1) == 0x0A ||
			(m_lpFileMemPos >= (LPSTR)m_lpFileAdr + m_dwFileSize)) { // CR+LF
//			*buf = '\0'; // 一行終了！
			LPSTR psz = new CHAR[dwSize+1];
			::CopyMemory(psz,m_lpFileMemPos-dwSize,dwSize);
			*(psz+dwSize) = '\0';
			s = psz;
			delete [] psz;
			m_lpFileMemPos+=2;
			return 0;
		}
//		*(buf++) = *(m_lpFileMemPos++);
		m_lpFileMemPos++;
		dwSize++;
	}
	//	ここには来ない..
	return 0;
}

// [Konami] added: same as ReadLine(string&), but a line ends at LF (0x0A)
//	only and the pointer skips 1 byte (name is ours)
// @yo2 0x0052b6d0 manual
LRESULT		CFile::ReadLineLF(string&s){
	if (m_lpFileMemPos == NULL) return 3;
	if (m_lpFileMemPos >= (LPSTR)m_lpFileAdr + m_dwFileSize) return 1;

	LPSTR lp = m_lpFileMemPos;
	DWORD dwSize = 0;
	while (true) {
		if (*m_lpFileMemPos == 0x0A ||
			(m_lpFileMemPos >= (LPSTR)m_lpFileAdr + m_dwFileSize)) { // LF
			LPSTR psz = new CHAR[dwSize+1];
			::CopyMemory(psz,m_lpFileMemPos-dwSize,dwSize);
			*(psz+dwSize) = '\0';
			s = psz;
			delete [] psz;
			m_lpFileMemPos+=1;
			return 0;
		}
		m_lpFileMemPos++;
		dwSize++;
	}
	return 0;
}

// @yo2 0x0052b850 vt
LRESULT		CFile::ReadLine2(LPSTR Senario,DWORD dwSize){
	//smart_ptr<CHAR> lpBuf;
	//lpBuf.AddArray(dwSize);	//	同サイズ確保
	smart_array<CHAR> lpBuf;
	lpBuf.Add(dwSize);

	::lstrcpy(Senario,"");	//	一応、終了したときにゴミを出さないように...
	if (ReadLine(lpBuf.get())!=0) return 1;
	if (!::lstrcmp(lpBuf.get(),"\"END\"")) return 1; // 終わりんこ
	::lstrcpy(Senario,lpBuf.get()+1);	//	先頭の"を削除

	while (true) {
		if (Senario[strlen(Senario)-1] == '\"') break;	//	デリミタ:="
		if (ReadLine(lpBuf.get())!=0) return 1;
		::lstrcat(Senario,"\n");
		::lstrcat(Senario,lpBuf.get());
	}
	Senario[::lstrlen(Senario)-1] = '\0';
	return 0;
}

// @yo2 0x0052baa0 vt
LRESULT	CFile::ReadData(BYTE*p,DWORD size){
	// [Konami] added: read from the open stream, clipped to the file size
	//	(returns the fread() count in this case)
	if (m_lpFile!=NULL) {
		if (Tell() + size > m_dwReadSize) {
			return ::fread(p,1,m_dwReadSize - Tell(),m_lpFile);
		}
		return ::fread(p,1,size,m_lpFile);
	}
	if (m_lpFileMemPos == NULL) return 2; // どうなっとんのー！！
	if (m_lpFileMemPos >= (LPSTR)m_lpFileAdr + m_dwFileSize) return 1;

	::CopyMemory(p,m_lpFileMemPos,size);
	m_lpFileMemPos+=size;
	return 0;
}

//	データの保存／読み込み(CSerializeと併用すると良い)
// @yo2 0x0052bb80 vt
LRESULT		CFile::Load(const string& filename,vector<BYTE>*vData){
	LRESULT lr = Read(filename);
	if (lr!=0) return lr; // 読み込み失敗しとるやん．．．
	//	読み込んだファイルの長さを調べて、それ全部vDataにコピったる！
	int nSize = GetSize();
	vData->resize(nSize);
	::CopyMemory((LPVOID)&(*vData)[0],GetMemory(),nSize);
	return 0;
}

// @yo2 0x0052bc70 vt
LRESULT		CFile::Save(const string& filename,vector<BYTE>*vData){
	return Write(filename,(LPVOID)&(*vData)[0],vData->size());
}

// @yo2 0x0052bcc0 vt
LRESULT		CFile::Save(const string& filename,vector<string>*vData){
	//	これ、fopenして書き込んだほうが、てっとり早いんかな？
	int nSize = vData->size();
	FILE *fp = fopen(filename.c_str(),"w");
	if (fp==NULL) return 1;

	for(int i=0;i<nSize;i++){
		if (fprintf(fp,(*vData)[i].c_str())<0) return 2;
		//	書き込みしてる最中にHDD溢れたんちゃうんけ？
	}
	fclose(fp);
	return 0;
}
