#ifndef __yaneStringMap_h__
#define __yaneStringMap_h__

#include "yaneSerialize.h"

//	string to stringの連想記憶型集合
class CStringMap : public CArchive {
public:

	//	キーに対するデータの書き込み
	void	Write(string szKey,string szData);
	void	Write(string szKey,LONGLONG nData);

	//	キーに対するデータの追加書き込み
	void	Append(string szKey,string szData);
	void	Append(string szKey,LONGLONG nData);

	//	キーに対するデータの読み出し
	LRESULT	Read(string szKey,string& szData);
	LRESULT	Read(string szKey,LONGLONG& nData);

	//	キーに対するデータの直接取得
	//	(そのキーが存在しないときは、szDefault or lDefaultが返る)
	string	GetStr(string szKey,string szDefault="");
	int		GetNum(string szKey,int nDefault=0);
	//	↑これのLONGLONGのやつ作ったのだが、それは、ときどき
	//		VC++のreleaseバージョンだと内部コンパイルエラーに
	//		なるときがある。おそらく、LONGLONGの最適化のバグ。
	LONGLONG	GetLongNum(string szKey,LONGLONG nDefault=0);

	//	キーに対するデータの削除
	bool	Delete(string szKey);	//	削除したときにはtrue

	//	まるごと削除
	void	Clear();	//	clear all data..

	//	定義ファイルからデータを読み出して、格納する機能
	//	(シリアライズとは違い、次のようなフォーマットのファイルから読み出す)
	/*
		// ダブルスラッシュ行はコメント
		#string1 string2 // このように#で開始して、文字列１，２をならべる
		//	このとき、スペースがセパレータ。
		そうすると、string1が、szKey,string2がszDataとして、保存(Write)される。
		よって、定義ファイルから読み込み後、GetStr("string1");のようにすれば
		string2が取得できると言うわけ！○(≧∇≦)o
	*/
	LRESULT ReadFromConfigFile(string szFileName);

	//	データまるごと表示(デバッグ用)
	void	Out(){
		map<string,string>::iterator it;
		printf ("StringMap::Out() \n");
		for(it = GetMap()->begin();it!=GetMap()->end();it++){
			printf("%s => %s\n",(static_cast<string>(it->first).c_str())
							   ,(static_cast<string>(it->second).c_str()));
		}
	}

	//	文字列をこの連想記憶で置換する
	void	Replace(string& s,bool bCaseSensitive=false);

	map<string,string>* GetMap() { return& m_vStringMap; }

/*	//	やっぱし、こんなの用意したら、配列アクセスがややこしくなるんでやめ、、
	//	連想キーの直接指定オペレータ
	const string operator [] (string szKey);
	string operator [] (string szKey);
*/

protected:
	map<string,string> m_vStringMap;

	//	override from CArchive
	virtual void Serialize(CSerialize&s);
};

#endif
