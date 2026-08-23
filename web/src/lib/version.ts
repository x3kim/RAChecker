// Single source of truth for the app version + changelog. The footer version
// chip opens a modal rendering CHANGELOG; package.json is kept in sync manually.
export const APP_VERSION = '0.18.0';

// GitHub repository — linked from the header (GitHub icon in the "More" menu).
export const REPO_URL = 'https://github.com/x3kim/RAChecker';
// The companion Android app ships as an APK on the GitHub releases page
// (tags android-vX.Y.Z). Linked from the "More" menu + docs.
export const ANDROID_URL = 'https://github.com/x3kim/RAChecker/releases';

export type ChangeType = 'feature' | 'improve' | 'fix';

// `ja` is optional — older entries stay DE/EN and fall back to English.
export interface Change { type: ChangeType; de: string; en: string; ja?: string }
export interface Release { version: string; date: string; title?: { de: string; en: string; ja?: string }; changes: Change[] }

// Newest first. Dates are ISO (YYYY-MM-DD).
export const CHANGELOG: Release[] = [
  {
    version: '0.18.0',
    date: '2026-08-23',
    title: { de: 'Genres, Sub-Genres und japanische Oberfläche', en: 'Genres, sub-genres and a Japanese UI', ja: 'ジャンル、サブジャンル、日本語UI' },
    changes: [
      { type: 'feature', de: 'Jedes Spiel kennt jetzt sein Genre. RetroAchievements gibt das Genre nur einzeln pro Spiel heraus — die Massen-Abfrage kennt es nicht —, deshalb holt RAChecker es in einem eigenen, jederzeit abbrechbaren Durchlauf (Einstellungen › Allgemein › Genres) und speichert es lokal. Einmal geholt, überlebt es auch einen Neuaufbau der Hash-Datenbank.', en: 'Every game now knows its genre. RetroAchievements only hands the genre out one game at a time — the bulk game list does not carry it — so RAChecker fetches it in its own resumable pass (Settings › General › Genres) and stores it locally. Once fetched it survives a rebuild of the hash database.', ja: '各ゲームのジャンルを扱えるようになりました。RetroAchievements はジャンルを一括取得のゲームリストに含めず、1ゲームずつしか返しません。そのため RAChecker は専用の取得処理（設定 › 一般 › ジャンル）で取得し、ローカルに保存します。いつでも中断・再開でき、一度取得すればハッシュDBを再構築しても保持されます。' },
      { type: 'feature', de: 'Die Sammlung lässt sich nach Genre filtern. „Nach Genre“ zeigt ausschließlich die 19 Hauptgenres, die RetroAchievements selbst definiert; alles, was RA als Untergenre führt (2D Platforming, Turn-Based RPG, Sports - Golf …), wird darin zusammengefasst. Wer feiner filtern will, klappt „Nach Sub-Genre“ auf — die Liste zeigt dann nur noch die Untergenres des gewählten Hauptgenres.', en: 'The collection can be filtered by genre. "By genre" lists only the 19 major genres RetroAchievements itself defines; everything RA files as a subgenre (2D Platforming, Turn-Based RPG, Sports - Golf …) is folded into them. For finer filtering, unfold "By sub genre" — it then only shows the subgenres of the selected major genre.', ja: 'コレクションにジャンル・サブジャンルフィルタ追加。「ジャンル別」フィルタは RetroAchievements が定義する19の主要ジャンル、RA がサブジャンルとして扱うもの（2D Platforming、Turn-Based RPG、Sports - Golf など）はそこにまとめられます。さらに細かく絞りたい場合は「サブジャンル別」ボックスを展開しフィルタリングできます — ここには選択中の主要ジャンル配下のサブジャンルのみが表示されます。' },
      { type: 'feature', de: 'In der Spieleliste steht das Genre jetzt bei jedem Eintrag und lässt sich danach sortieren.', en: 'The games list shows the genre on every entry and can be sorted by it.', ja: 'ゲーム一覧の各エントリにジャンルを表示し、ジャンル順での並び替え機能追加。' },
      { type: 'feature', de: 'Die Oberfläche gibt es auf Japanisch. Sprache umschalten wie gehabt über das „Mehr“-Menü oder Strg + K.', en: 'The interface is available in Japanese. Switch languages as usual via the "More" menu or Ctrl + K.', ja: 'インターフェースの日本語対応。言語の切替は従来どおり「その他」メニューまたは Ctrl + K から可能。' },
    ],
  },
  {
    version: '0.17.0',
    date: '2026-08-19',
    title: { de: 'WBFS, CISO und NKit-Erkennung', en: 'WBFS, CISO and NKit detection', ja: 'WBFS・CISO・NKit の認識' },
    changes: [
      { type: 'fix', de: 'NKit-Images werden endlich erkannt. NKit verkleinert einen Dump, indem es das Padding entfernt, mit dem die Disc gemastert wurde — die Datei behält aber die Endung .iso und einen echten Disc-Header. RAHasher hasht sie deshalb klaglos, nur passt das Ergebnis zu nichts: RAChecker meldete „kein Treffer“ für Spiele, die RetroAchievements voll unterstützt, ohne jeden Hinweis auf die Ursache. Jetzt steht da, was die Datei ist und was zu tun ist.', en: 'NKit images are recognised at last. NKit shrinks a dump by stripping the padding the disc was mastered with, but the file keeps the .iso extension and a genuine disc header. RAHasher therefore hashes it without complaint, and the result matches nothing: RAChecker reported „no match“ for games RetroAchievements fully supports, with no hint as to why. It now says what the file is and what to do about it.', ja: 'NKit イメージに対応。NKit はディスクのマスタリング時のパディングを取り除いてダンプを縮小しますが、拡張子は .iso のままで本物のディスクヘッダーも持ちます。そのため RAHasher は問題なくハッシュを計算しますが、結果は何にも一致しません。RetroAchievements が完全対応しているゲームでも「マッチなし」となり、原因の手がかりもありませんでした。現在はそのファイルが何で、どうすればよいかを表示します。' },
      { type: 'feature', de: 'WBFS-Dateien werden gehasht — das Format, in dem USB-Loader Wii-Spiele ablegen. RAHasher las bei einer .wbfs den Container-Kopf, als wäre er die Disc, und wies die Datei ab. Sie wird jetzt zum Hashen kurz in eine echte .iso zurückverwandelt.', en: 'WBFS files are hashed — the format USB loaders keep Wii games in. RAHasher read a .wbfs container header as if it were the disc and rejected the file. It is now turned back into a real .iso for the moment it takes to hash.', ja: 'WBFS ファイルをハッシュ計算できます — USB ローダーが Wii ゲームを保存する形式です。RAHasher は .wbfs のコンテナヘッダーをディスクと誤読し、ファイルを拒否していました。現在はハッシュ計算の間だけ本物の .iso に戻して処理します。' },
      { type: 'feature', de: 'Die GameCube- und Wii-Variante von .ciso wird ebenfalls gehasht. Die Endung steht für zwei völlig verschiedene Formate — PSP-Dumps benutzen sie anders als GameCube-Werkzeuge — und nur das PSP-Format wurde bisher gelesen.', en: 'The GameCube and Wii flavour of .ciso is hashed as well. The extension names two completely different formats — PSP dumps use it one way, GameCube tools another — and only the PSP one was read before.', ja: 'GameCube・Wii版.ciso 形式対応。この拡張子は PSP由来と GameCube由来で全く別の形式を指しており、これまでは PSP 形式しか読み込みできませんでした。' },
    ],
  },
  {
    version: '0.16.0',
    date: '2026-08-18',
    title: { de: 'Alle GameCube- und Wii-Container', en: 'Every GameCube and Wii container', ja: 'すべての GameCube・Wii コンテナ' },
    changes: [
      { type: 'feature', de: 'RVZ- und WIA-Images werden jetzt in jedem Kompressionsverfahren gelesen, das Dolphin anbietet. Bisher lief nur Zstandard; bei bzip2, LZMA oder LZMA2 kam der Hinweis zurück, die Datei neu zu komprimieren. Das ist nicht mehr nötig.', en: 'RVZ and WIA images are read in every compression method Dolphin offers. Only Zstandard worked before; bzip2, LZMA and LZMA2 came back asking you to re-compress the file. That is no longer necessary.', ja: 'RVZ・WIA 処理を Dolphin が提供するすべての圧縮方式に対応。以前は Zstandard 以外は非対応で、bzip2・LZMA・LZMA2 では再圧縮を促すメッセージが返っていましたが、その必要はなくなりました。' },
      { type: 'feature', de: 'Das ältere GCZ-Format von Dolphin wird jetzt ebenfalls gehasht. RAHasher las bei einer .gcz den Container-Kopf, als wäre er die Disc, und meldete „Not a Gamecube disc“ — solche Dateien ließen sich gar nicht zuordnen. Sie werden nun wie RVZ und CSO kurz ausgepackt und danach wieder aufgeräumt.', en: 'The older GCZ format Dolphin writes is hashed as well now. RAHasher read a .gcz container header as if it were the disc and reported „Not a Gamecube disc“, so those files could not be matched at all. They are now expanded for the moment it takes to hash, like RVZ and CSO.', ja: 'Dolphin の古い GCZ 形式もハッシュ計算できます。RAHasher は .gcz のコンテナヘッダーをディスクと誤読して「Not a Gamecube disc」と報告するため、この種のファイルは一切照合できませんでした。RVZ や CSO と同じく、ハッシュ計算の間だけ展開して後で削除します。' },
    ],
  },
  {
    version: '0.15.0',
    date: '2026-08-18',
    title: { de: 'GameCube- und Wii-Images (RVZ)', en: 'GameCube and Wii images (RVZ)', ja: 'GameCube・Wii イメージ (RVZ)' },
    changes: [
      { type: 'feature', de: 'Die komprimierten GameCube- und Wii-Images von Dolphin (.rvz, .wia) werden jetzt gehasht. RAHasher kann sie nicht öffnen, deshalb blieben solche Dateien bisher ohne Hash liegen — RAChecker packt sie dafür kurz in eine echte ISO aus und räumt sie danach wieder weg. Bei Wii-Discs werden die Partitionen dabei neu gehasht und verschlüsselt, damit das Ergebnis dem Original-Dump Byte für Byte entspricht. Mit bzip2, LZMA oder LZMA2 komprimierte Images meldet RAChecker als nicht unterstützt — in Dolphin mit Zstandard neu komprimieren, der Voreinstellung.', en: 'The compressed GameCube and Wii images Dolphin writes (.rvz, .wia) are hashed now. RAHasher cannot open them, so those files were left without a hash — RAChecker expands them into a real ISO for the moment it takes to hash, then removes it again. For Wii discs the partitions are re-hashed and re-encrypted along the way, so the result matches the original dump byte for byte. Images compressed with bzip2, LZMA or LZMA2 are reported as unsupported — re-compress them in Dolphin with Zstandard, its default.', ja: 'Dolphin が出力する圧縮済み GameCube・Wii イメージ（.rvz、.wia）をハッシュ計算できます。RAHasher はこれらを開けないためハッシュが得られませんでしたが、RAChecker がハッシュ計算の間だけ本物の ISO に展開し、終われば削除します。Wii ディスクではパーティションを再ハッシュ・再暗号化し、オリジナルダンプとバイト単位で一致させます。bzip2・LZMA・LZMA2 で圧縮されたイメージは非対応として報告されます — Dolphin の既定である Zstandard で再圧縮してください。' },
      { type: 'fix', de: 'Die Endung .wia war keinem System zugeordnet und wurde beim Scannen übergangen. Sie zählt jetzt wie .rvz zu GameCube und Wii.', en: 'The .wia extension was not assigned to any system and was passed over while scanning. It now counts towards GameCube and Wii just like .rvz.', ja: '.wia 拡張子がどの機種にも割り当てられておらず、スキャン時に無視されていました。現在は .rvz と同じく GameCube・Wii として扱われます。' },
    ],
  },
  {
    version: '0.14.1',
    date: '2026-08-18',
    title: { de: 'Scan-Fortschritt, DS-ROMs, Sicherheits-Updates', en: 'Scan progress, DS ROMs, security updates', ja: 'スキャン進捗、DS ROM、セキュリティ更新' },
    changes: [
      { type: 'fix', de: 'Nintendo-DS-ROMs (.nds) landen jetzt in der Sammlung. Lag die Datei nicht in einem nach dem System benannten Ordner, galt sie als unbekannte Endung und wurde stillschweigend übergangen — verschlüsselt wie entschlüsselt. Betroffen waren auch .dsi (DSi), .wad (Wii), .woz/.po/.do/.2mg (Apple II), .sna/.cpr/.cdt (Amstrad CPC) und .d88/.d98/.cmt (PC-8801). Wie bei Disc-Images wird das System jetzt am Inhalt erkannt.', en: 'Nintendo DS ROMs (.nds) end up in your collection now. When the file did not sit in a folder named after the system, it counted as an unknown extension and was passed over silently — encrypted and decrypted alike. The same affected .dsi (DSi), .wad (Wii), .woz/.po/.do/.2mg (Apple II), .sna/.cpr/.cdt (Amstrad CPC) and .d88/.d98/.cmt (PC-8801). As with disc images, the system is now identified by the file\'s content.', ja: 'Nintendo DS の ROM（.nds）がコレクションに入るようになりました。機種名のフォルダに置いていない場合、未知の拡張子として黙って無視されていました（暗号化・復号を問わず）。.dsi (DSi)、.wad (Wii)、.woz/.po/.do/.2mg (Apple II)、.sna/.cpr/.cdt (Amstrad CPC)、.d88/.d98/.cmt (PC-8801) も同様でした。ディスクイメージと同じく、現在はファイルの内容から機種を判定します。' },
      { type: 'fix', de: 'Der Fortschrittsbalken erreicht 100 %. Gezählt wurden bisher nur Dateien mit einem Ergebnis, gemessen aber an allen gefundenen Dateien — jede BIOS-Datei, jeder Spielstand und jede Textdatei ließ also eine Lücke stehen. Bei einer Sammlung mit vielen Nicht-ROM-Dateien blieb der Balken deutlich vor dem Ende stehen und der Scan wirkte hängengeblieben, obwohl er längst fertig war.', en: 'The progress bar reaches 100%. It counted only files that produced a result but measured against every file found, so each BIOS blob, save file and readme left a permanent gap. In a collection with many non-ROM files the bar stopped well short of the end and the scan looked stuck although it had long finished.', ja: '進捗バーが 100% に到達します。結果の出たファイルだけを数えながら、見つかった全ファイルを分母にしていたため、BIOS やセーブデータ、テキストファイルの分だけ常に隙間が残っていました。ROM 以外のファイルが多いコレクションではバーが手前で止まり、終了済みなのにフリーズしたように見えていました。' },
      { type: 'fix', de: 'Ein Scan bleibt nach einem Verbindungsabbruch erreichbar. Der Scan läuft im Programm, nicht im Fenster — brach die Verbindung ab (Ruhezustand, neu geladene Seite), lief er unsichtbar weiter und jeder neue Versuch wurde mit „Es läuft bereits ein Scan" abgewiesen, bei großen Sammlungen sehr lange. Das Fenster verbindet sich jetzt von selbst wieder und holt Fortschritt und bisherige Treffer nach; nach einem Neuladen führt eine Schaltfläche zurück zum laufenden Scan.', en: 'A scan stays reachable after the connection drops. The scan runs in the program, not in the window — if the connection broke (sleep, a reloaded page) it kept going invisibly and every new attempt was refused with "a scan is already running", on large collections for a very long time. The window now reconnects by itself and catches up on progress and the matches so far; after a reload a button leads back to the running scan.', ja: '接続が切れてもスキャンに戻れます。スキャンはウィンドウではなくプログラム側で実行されるため、接続が切れると（スリープ、ページ再読み込み）見えないまま継続し、新しい実行は「既にスキャンが実行中」と拒否されていました（大規模なコレクションでは長時間）。現在はウィンドウが自動で再接続し、進捗とこれまでの結果を取得します。再読み込み後はボタンから実行中のスキャンに戻れます。' },
      { type: 'improve', de: 'Sicherheits-Updates: alle bekannten Schwachstellen in den mitgelieferten Abhängigkeiten sind behoben, darunter ein Pfad-Durchgriff im Auslieferer der Oberfläche. RAChecker prüft Abhängigkeiten ab jetzt automatisch.', en: 'Security updates: every known vulnerability in the bundled dependencies is fixed, among them a path traversal in the component serving the user interface. RAChecker now checks its dependencies automatically.', ja: 'セキュリティ更新: 同梱依存関係の既知の脆弱性をすべて修正しました（UI 配信コンポーネントのパストラバーサルを含む）。今後は依存関係を自動チェックします。' },
    ],
  },
  {
    version: '0.14.0',
    date: '2026-08-06',
    title: { de: 'CSO-Images, richtige Punkte, Erfolgs-Filter', en: 'CSO images, correct points, achievement filters', ja: 'CSO イメージ、正しいポイント、実績フィルタ' },
    changes: [
      { type: 'feature', de: 'Komprimierte Disc-Images (.cso/.zso, verbreitet bei PSP und PS2) werden jetzt gehasht. RAHasher kann sie nicht öffnen und meldete „Could not open track" — RAChecker packt sie dafür kurz in eine echte ISO aus und räumt sie danach wieder weg. Der Hash ist derselbe wie beim unkomprimierten Image (gegen die RetroAchievements-Hashliste geprüft).', en: 'Compressed disc images (.cso/.zso, common for PSP and PS2) are hashed now. RAHasher cannot open them and reported "Could not open track" — RAChecker expands them into a real ISO for the moment it takes to hash, then removes it again. The hash is the same one the uncompressed image produces (verified against the RetroAchievements hash list).', ja: '圧縮ディスクイメージ（.cso/.zso、PSP や PS2 で一般的）をハッシュ計算できます。RAHasher はこれらを開けず「Could not open track」と報告していましたが、RAChecker がハッシュ計算の間だけ本物の ISO に展開し、終われば削除します。ハッシュは非圧縮イメージと同一です（RetroAchievements のハッシュ一覧で検証済み）。' },
      { type: 'fix', de: 'Die Punkte eines Spiels stimmen. RetroAchievements liefert für ein Spiel gar keine Punktsumme, weshalb im Spiel-Fenster „0" stehen konnte, obwohl einzelne Erfolge Punkte zeigten. Der Wert wird jetzt aus dem Erfolgs-Satz gerechnet und zusammen mit deinem eigenen Stand angezeigt („3 von 514 Punkten").', en: 'A game\'s points are right. RetroAchievements returns no point total for a game at all, which is why the game window could read "0" while individual achievements showed points. The value is now summed from the achievement set and shown together with your own standing ("3 of 514 points").', ja: 'ゲームのポイントが正しくなりました。RetroAchievements はゲーム単位の合計ポイントを返さないため、個々の実績にポイントがあってもゲーム画面には「0」と表示されることがありました。現在は実績セットから合計を算出し、自分の進捗と並べて表示します（「514 中 3 ポイント」）。' },
      { type: 'feature', de: 'Die Erfolgsliste lässt sich filtern — wie auf der RetroAchievements-Seite: verpassbar, Fortschritt, Abschluss, erhalten, offen. Verpassbare Erfolge sind außerdem in der Liste markiert.', en: 'The achievement list can be filtered, the same way the RetroAchievements page does it: missable, progression, win condition, unlocked, remaining. Missable achievements are also marked in the list.', ja: '実績一覧を RetroAchievements のサイトと同じく絞り込めます: 取り逃し注意、進行、クリア条件、解除済み、未解除。取り逃し注意の実績は一覧上でもマークされます。' },
      { type: 'feature', de: 'Der Windows-Installer fragt jetzt, ob eine Desktop-Verknüpfung und ein Startmenü-Eintrag angelegt werden sollen.', en: 'The Windows installer now asks whether to create a desktop shortcut and a Start menu entry.', ja: 'Windows インストーラがデスクトップショートカットとスタートメニュー項目を作成するか確認するようになりました。' },
      { type: 'improve', de: '„lokal · N Hashes gecacht" ist aus der Fußzeile verschwunden — die Zahl steht ohnehin auf der Übersicht.', en: 'The footer no longer repeats "local · N hashes cached" — the number is on the dashboard anyway.', ja: 'フッターから「ローカル · N ハッシュキャッシュ済み」の表示を削除しました — この数値はダッシュボードにあります。' },
    ],
  },
  {
    version: '0.13.0',
    date: '2026-07-31',
    title: { de: 'Wunsch-Region & Sprache', en: 'Preferred region & language', ja: '希望リージョンと言語' },
    changes: [
      { type: 'feature', de: 'Region und Sprache stehen jetzt bei jeder Datei — Regionen groß (DE, EU, JP), Sprachen klein (de, en, ja). Bei einer Datei, die trifft, kommen sie direkt von RetroAchievements: der Hash identifiziert genau diesen Dump, egal wie die Datei heißt. Nur für Dateien, die RetroAchievements nicht kennt, wird der Dateiname gelesen (No-Intro, GoodTools, TOSEC, Übersetzungs-Tags) — solche Angaben sind gestrichelt umrandet, bestätigte durchgezogen.', en: 'Every file now states its region and languages — regions uppercase (DE, EU, JP), languages lowercase (de, en, ja). For a file that matches, they come straight from RetroAchievements: the hash identifies that exact dump, whatever the file is called. Only for files RetroAchievements does not know is the filename read (No-Intro, GoodTools, TOSEC, translation tags) — those values carry a dashed outline, confirmed ones a solid one.', ja: '各ファイルにリージョンと言語を表示します — リージョンは大文字（DE、EU、JP）、言語は小文字（de、en、ja）。マッチしたファイルでは RetroAchievements から直接取得します—ハッシュがそのダンプを一意に特定するため、ファイル名は無関係です。RetroAchievements に登録されていないファイルのみファイル名を解析し（No-Intro、GoodTools、TOSEC、翻訳タグ）、その場合は破線枠、確定情報は実線枠で表示されます。' },
      { type: 'feature', de: 'Die offiziellen ROM-Namen holt RAChecker nach jedem Scan automatisch für die Spiele deiner Sammlung (Sekunden). Unter Einstellungen → Allgemein lässt sich die ganze Datenbank nachladen, mit Fortschritt, abbrechbar und beim nächsten Mal genau dort fortsetzend. Einmal geholte Namen bleiben gespeichert und überleben auch einen Neu-Sync der Hash-Liste.', en: 'RAChecker fetches the official ROM names automatically after every scan, for the games in your collection (seconds). Settings → General can fetch the whole database, with progress, stoppable, and resuming exactly where it stopped. Fetched names are stored and survive a re-sync of the hash list.', ja: 'スキャン後、コレクション内のゲームについて公式 ROM 名を自動取得します（数秒）。設定 → 一般 からデータベース全体を取得でき、進捗表示付きで中断可能、次回は中断地点から再開します。取得済みの名前は保存され、ハッシュ一覧を再同期しても残ります。' },
      { type: 'feature', de: 'Neue Wunsch-Reihenfolge unter Einstellungen → Allgemein: Regionen und Sprachen frei sortierbar, z. B. „Japanisch → Japan → Europa". Sie sortiert die Sammlung („Wunsch-Region zuerst"), markiert bei Duplikaten die Kopie zum Behalten und stellt in den Spiel-Details die passende ROM-Version nach oben.', en: 'New preferred order under Settings → General: sort regions and languages freely, e.g. "Japanese → Japan → Europe". It sorts the collection ("Preferred region first"), marks the copy to keep among duplicates, and puts the matching ROM version first in the game details.', ja: '設定 → 一般 に希望順位を新設しました。リージョンと言語を自由に並べられます（例: 「日本語 → 日本 → 欧州」）。この順序はコレクションの並び替え（「希望リージョン優先」）、重複時に残すコピーの選定、ゲーム詳細での ROM バージョンの並び順に反映されます。' },
      { type: 'feature', de: 'Die Sammlung lässt sich nach Region oder Sprache filtern. Die Auswahl zeigt nur, was du wirklich besitzt, plus „Ohne Angabe" für Dateien ohne solche Kürzel im Namen.', en: 'The collection can be filtered by region or language. The chips only offer what you actually own, plus "Not stated" for files whose name carries no such tags.', ja: 'コレクションをリージョンや言語で絞り込めます。チップには実際に所持しているものだけが並び、タグの無いファイル用に「記載なし」も用意されます。' },
      { type: 'feature', de: 'Die Spiel-Details zeigen jetzt, welche Regionen RetroAchievements für dieses Spiel unterstützt, und markieren die Fassungen, die du bereits hast — die Antwort auf „gibt es hier auch eine JP-Version?".', en: 'The game details now show which regions RetroAchievements supports for that game and mark the versions you already own — the answer to "is there a JP version of this too?".', ja: 'ゲーム詳細で RetroAchievements がそのゲームで対応するリージョンを表示し、既に所持している版をマークします — 「これの日本版もある？」の答えです。' },
      { type: 'improve', de: 'Bestehende Sammlungen brauchen keinen neuen Scan: die Angaben werden beim ersten Start aus den bereits gespeicherten Namen ergänzt.', en: 'Existing collections need no re-scan: the tags are filled in from the already stored names on first start.', ja: '既存のコレクションは再スキャン不要です: 初回起動時に保存済みの名前からタグを補完します。' },
    ],
  },
  {
    version: '0.12.0',
    date: '2026-07-29',
    title: { de: 'Disc-Images ohne System-Ordner erkennen', en: 'Disc images identified without system folders', ja: '機種フォルダ不要のディスクイメージ識別' },
    changes: [
      { type: 'feature', de: 'Disc-Images (.iso/.chd/.cue) brauchen keinen nach dem System benannten Ordner mehr. Ließ sich das System nicht an der Endung ablesen, galt die Datei bisher als „unklar" mit der Bitte, den Ordner umzubenennen. Jetzt werden alle in Frage kommenden Systeme durchprobiert und das Spiel wird am Inhalt erkannt — egal wie du deine Sammlung sortierst.', en: 'Disc images (.iso/.chd/.cue) no longer need a folder named after the system. When the extension alone could not say which system a file was, it used to be marked "unclear" with a request to rename the folder. Every possible system is now tried and the game is identified by its content — however you sort your collection.', ja: 'ディスクイメージ（.iso/.chd/.cue）に機種名のフォルダは不要になりました。拡張子だけでは機種を特定できない場合、以前は「不明確」としてフォルダ名の変更を促していました。現在は候補となる全機種を試し、内容からゲームを特定します — コレクションをどう整理していても問題ありません。' },
      { type: 'fix', de: 'Atari-Lynx-Hashes korrigiert: die Header-Kennung wurde zu kurz geprüft, wodurch bei manchen Dateien ein 64-Byte-Header entfernt wurde, den RetroAchievements behält. Betroffene Lynx-ROMs treffen jetzt korrekt.', en: 'Fixed Atari Lynx hashes: the header signature was checked too loosely, so a 64-byte header was stripped from files that RetroAchievements keeps intact. Affected Lynx ROMs now match correctly.', ja: 'Atari Lynx のハッシュを修正しました。ヘッダーの識別子のチェックが緩すぎたため、RetroAchievements が保持する 64 バイトヘッダーを一部のファイルで除去していました。対象の Lynx ROM は正しくマッチします。' },
      { type: 'improve', de: 'Die System-Filter greifen bei mehrdeutigen Disc-Images jetzt, sobald eines der möglichen Systeme ausgewählt ist.', en: 'For ambiguous disc images, the system filters now apply as soon as any of the possible systems is selected.', ja: '曖昧なディスクイメージでも、候補機種のいずれかを選択した時点で機種フィルタが適用されます。' },
    ],
  },
  {
    version: '0.11.2',
    date: '2026-07-27',
    title: { de: 'Hotfix: Desktop-App startet wieder', en: 'Hotfix: desktop app starts again', ja: 'ホットフィックス: デスクトップアプリが起動' },
    changes: [
      { type: 'fix', de: 'Die installierte/portable Desktop-App aus 0.11.1 stürzte beim Start ab (interne Hashing-Komponente war nicht mitgepackt). Sie wird jetzt korrekt gebündelt — die App startet wieder normal.', en: 'The installed/portable desktop app from 0.11.1 crashed on launch (an internal hashing component was not bundled). It is now packaged correctly — the app starts normally again.', ja: '0.11.1 のインストール版・ポータブル版が起動時にクラッシュしていました（内部のハッシュコンポーネントが同梱されていなかった）。正しくパッケージされ、通常どおり起動します。' },
    ],
  },
  {
    version: '0.11.1',
    date: '2026-07-27',
    title: { de: 'Android-App & neues Logo', en: 'Android app & new logo', ja: 'Android アプリと新ロゴ' },
    changes: [
      { type: 'feature', de: 'RAChecker gibt es jetzt auch als eigenständige Android-App (APK) — sie hasht Cartridge-ROMs direkt auf dem Handy und gleicht offline gegen RetroAchievements ab. Verlinkt im ⋯-Menü und in der Fußzeile; Download auf der Releases-Seite.', en: 'RAChecker now also has a standalone Android app (APK) — it hashes cartridge ROMs right on your phone and matches them offline against RetroAchievements. Linked from the ⋯ menu and the footer; download on the releases page.', ja: 'RAChecker に単体の Android アプリ（APK）が加わりました — スマホ上でカートリッジ ROM をハッシュ計算し、オフラインで RetroAchievements と照合します。⋯ メニューとフッターからリンクしており、リリースページから入手できます。' },
      { type: 'improve', de: 'Neues Marken-Logo als App-Icon (Desktop) und Favicon.', en: 'New brand logo as the app icon (desktop) and the favicon.', ja: '新しいブランドロゴをアプリアイコン（デスクトップ）と favicon に採用。' },
    ],
  },
  {
    version: '0.11.0',
    date: '2026-07-26',
    title: { de: 'DAT-Abgleich v2, Portable-Update & „Neues überspringen"', en: 'DAT check v2, portable update & skip-collected', ja: 'DAT 照合 v2、ポータブル更新、収集済みスキップ' },
    changes: [
      { type: 'feature', de: 'DAT-Abgleich unterstützt jetzt 7z- und RAR-Archive: die Prüfsumme (CRC32) wird direkt aus dem Archiv gelesen (kein Entpacken) — vorher galten Inhalte solcher Archive fälschlich als „fehlt".', en: 'DAT check now supports 7z and RAR archives: the checksum (CRC32) is read straight from the archive (no extraction) — previously such archive contents were wrongly counted as "missing".', ja: 'DAT 照合が 7z・RAR 等の圧縮形式に対応しました: チェックサム（CRC32）をアーカイブから直接読み取ります（展開不要）。以前はこの種のアーカイブ内容が誤って「未所持」扱いされていました。' },
      { type: 'feature', de: 'DAT-Abgleich auch über md5/sha1: DATs, die nur sha1 tragen (Redump-CHD, MAME-Disk), werden jetzt korrekt gematcht (lose Dateien werden dafür einmalig für crc+md5+sha1 gelesen). Zusätzlich Name+Größe als letzter Fallback.', en: 'DAT check also via md5/sha1: DATs that only carry sha1 (Redump CHD, MAME disk) now match correctly (loose files are read once for crc+md5+sha1). Plus name+size as a last-resort fallback.', ja: 'md5/sha1 での DAT 照合にも対応: sha1 しか持たない DAT（Redump CHD、MAME disk）も正しくマッチします（通常ファイルは crc+md5+sha1 のために1回だけ読み取り）。最終手段として名前＋サイズでの照合も行います。' },
      { type: 'feature', de: 'Neue Ansicht „Extra / unbekannte Dumps": Sammlungs-Dateien, deren Hash in KEINER importierten DAT steckt (Bad Dumps, Hacks/Homebrew oder Systeme ohne DAT).', en: 'New "Extra / unknown dumps" view: collection files whose hash is in NO imported DAT (bad dumps, hacks/homebrew or systems without a DAT).', ja: '新規ビュー「対象外 / 不明なダンプ」: 取り込んだどの DAT にもハッシュが存在しないファイル（バッドダンプ、ハック/同人、DAT 未取得の機種）を一覧します。' },
      { type: 'improve', de: 'DAT-Parser gehärtet: ROM-Namen mit Klammern (z. B. „(USA)", „(World)") werden in ClrMamePro-DATs jetzt korrekt gelesen (vorher fielen solche Einträge raus); System-Erkennung aus No-Intro/Redump-Kopfzeilen deutlich treffsicherer; MAME-„machine"/„disk"-DATs unterstützt.', en: 'DAT parser hardened: ROM names with parentheses (e.g. "(USA)", "(World)") are now read correctly in ClrMamePro DATs (such entries used to be dropped); system detection from No-Intro/Redump headers is far more accurate; MAME "machine"/"disk" DATs supported.', ja: 'DAT パーサを強化: ClrMamePro 形式で括弧を含む ROM 名（例:「(USA)」「(World)」）を正しく読めるようになり（以前は除外されていました）、No-Intro/Redump ヘッダーからの機種判定精度も向上。MAME の machine/disk 形式 DAT にも対応しました。' },
      { type: 'feature', de: 'Portable-Version: automatische Update-Prüfung. Da sich eine laufende portable .exe unter Windows nicht selbst ersetzen kann (technische Grenze, kein Installer), lädt sie die neue Version herunter und ersetzt sich per „Neustart & ersetzen" beim nächsten Start — oder du zeigst sie dir einfach im Ordner an. (Die Installer-Version aktualisiert weiterhin voll automatisch.)', en: 'Portable build: automatic update check. Since a running portable .exe can\'t replace itself on Windows (a technical limit, no installer), it downloads the new version and swaps it in on "restart & replace" at next launch — or you just reveal it in the folder. (The installer build still updates fully automatically.)', ja: 'ポータブル版に自動更新チェックを追加。Windows では実行中のポータブル .exe が自分自身を置き換えられないため（インストーラがないことによる技術的制約）、新バージョンをダウンロードして「再起動して置き換え」で次回起動時に適用します。フォルダを開いて手動で入れ替えることもできます（インストーラ版は従来どおり完全自動）。' },
      { type: 'feature', de: 'Neue Scan-Option „Bereits gesammelte Dateien überspringen" (Einstellungen → Scannen): unveränderte Dateien werden beim erneuten Scan gar nicht mehr durchlaufen oder angezeigt — der Scan zeigt nur noch wirklich neue/geänderte Dateien, unveränderte Archive werden nicht einmal geöffnet.', en: 'New scan option "Skip files already in the collection" (Settings → Scanning): unchanged files are no longer walked or shown on a re-scan — the scan surfaces only genuinely new/changed files, and unchanged archives aren\'t even opened.', ja: '新しいスキャンオプション「コレクション済みファイルをスキップ」（設定 → スキャン）: 未変更ファイルは再スキャン時に走査や表示されず、新規・変更されたファイルだけが出ます。未変更のアーカイブは解凍されません。' },
    ],
  },
  {
    version: '0.10.0',
    date: '2026-07-25',
    title: { de: 'DAT-Abgleich, Auto-Update & Sprachwahl', en: 'DAT check, auto-update & language picker', ja: 'DAT 照合、自動更新、言語選択' },
    changes: [
      { type: 'feature', de: 'Neuer Bereich „DAT": Importiere No-Intro/Redump/logiqx-Kataloge und sieh pro Katalog, welche Einträge du bereits hast und welche fehlen — abgeglichen über die echte Datei-Prüfsumme (CRC32) deiner Sammlung, unabhängig vom RetroAchievements-Hash. Die Liste der fehlenden Spiele lässt sich exportieren.', en: 'New "DAT" area: import No-Intro/Redump/logiqx catalogs and see, per catalog, which entries you already have and which are missing — matched by your collection\'s real file checksum (CRC32), independent of the RetroAchievements hash. The list of missing games can be exported.', ja: '新しい「DAT」エリア: No-Intro/Redump/logiqx のカタログを取り込み、カタログごとに所持済み・未所持を確認できます — 照合はコレクションの実ファイルのチェックサム（CRC32）で行い、RetroAchievements のハッシュとは独立しています。未所持リストは書き出せます。' },
      { type: 'feature', de: 'Automatische Updates (Desktop-App): RAChecker prüft beim Start auf eine neue Version, lädt sie im Hintergrund und bietet unten links „Neustart & installieren". Die Web-/Startskript-Version zeigt stattdessen einen Link zur neuen Version.', en: 'Automatic updates (desktop app): RAChecker checks for a new version on launch, downloads it in the background and offers "Restart & install" bottom-left. The web/launcher build instead shows a link to the new release.', ja: '自動更新（デスクトップアプリ）: 起動時に新バージョンを確認し、バックグラウンドでダウンロードして左下に「再起動してインストール」を表示します。Web・起動スクリプト版では新リリースへのリンクを表示します。' },
      { type: 'feature', de: 'Sprachauswahl beim allerersten Start (mit Flaggen). Englisch ist jetzt die Standardsprache.', en: 'Language picker on the very first launch (with flags). English is now the default language.', ja: '初回起動時に言語選択画面（国旗付き）を表示。既定言語は英語になりました。' },
      { type: 'feature', de: 'Einstellungen → Daten & Speicher: Bilder-Cache, Sammlung & Scan-Verlauf oder die Hash-Datenbank gezielt löschen (vorher nur „Temp leeren").', en: 'Settings → Data & storage: delete the image cache, the collection & scan history, or the hash database individually (previously only "clear temp").', ja: '設定 → データとストレージ: 画像キャッシュ、コレクションとスキャン履歴、ハッシュDB を個別に削除できます（以前は一時ファイルの削除のみ）。' },
      { type: 'improve', de: 'Parallele Scan-Dateien standardmäßig auf 1 (ruhiger, klarerer Fortschritt). Hinweis: ein Archiv mit mehreren ROMs zeigt nacheinander mehrere Dateinamen — das ist kein paralleles Scannen, sondern die einzelnen Einträge im Archiv.', en: 'Parallel scan files now default to 1 (calmer, clearer progress). Note: an archive containing several ROMs shows multiple filenames in sequence — that is not parallel scanning but the individual entries inside the archive.', ja: 'スキャンの並列ファイル数の既定を 1 に変更（進捗が落ち着いて見やすく）。なお、複数 ROM を含むアーカイブではファイル名が順に複数表示されますが、これは並列スキャンではなくアーカイブ内の個々のエントリです。' },
      { type: 'fix', de: 'Offline-Check „Spieldetails gecacht" ist jetzt klar formuliert („33 (nötig ≥ 24)" statt des verwirrenden „33/24"). Der Wert zählt alle gecachten Details, die Zahl dahinter ist das Minimum für deine eigenen spielbaren Spiele.', en: 'Offline check "game details cached" is now worded clearly ("33 (need ≥ 24)" instead of the confusing "33/24"). The value counts all cached details; the number after it is the minimum for your own playable games.', ja: 'オフラインチェックの「ゲーム詳細キャッシュ済み」の表現を明確化（紛らわしい「33/24」ではなく「33（必要 ≥ 24）」）。数値はキャッシュ済み詳細の総数、後ろの数値は自分がプレイできるゲームに必要な最小数です。' },
    ],
  },
  {
    version: '0.9.5',
    date: '2026-07-25',
    title: { de: 'Emulator-Setup, Vollbild-Option & zweisprachige Doku', en: 'Emulator setup, fullscreen option & bilingual docs', ja: 'エミュレータ設定、全画面オプション、二言語ドキュメント' },
    changes: [
      { type: 'feature', de: 'Emulator einrichten leicht gemacht: Button zum Auswählen der retroarch.exe (statt Pfad tippen), „Automatisch suchen" für RetroArch + Core-Ordner, und ein Erst-Start-Popup, das das optional gleich anbietet. Die beiden RAHasher-Einstellungen sind jetzt an einer Stelle zusammengefasst (inkl. Datei-Auswahl + Auto-Suche).', en: 'Setting up an emulator made easy: a button to pick retroarch.exe (instead of typing the path), "Auto-detect" for RetroArch + core folder, and a first-run popup that offers it optionally. The two RAHasher settings are now in one place (incl. file picker + auto-detect).', ja: 'エミュレータ設定が簡単に: retroarch.exe をファイル選択で指定でき（パスを手入力する必要なし）、RetroArch とコアフォルダの「自動検出」も追加。初回起動時に任意で実行できるポップアップも用意しました。RAHasher の2つの設定も一か所にまとめました（ファイル選択＋自動検出付き）。' },
      { type: 'feature', de: 'Neue Option „Spiel-Fenster immer im Vollbild" (Einstellungen → Allgemein).', en: 'New option "Always open game window fullscreen" (Settings → General).', ja: '新オプション「ゲーム画面を常に全画面で開く」（設定 → 一般）。' },
      { type: 'improve', de: '„/" öffnet jetzt die Befehlspalette (Live-Suche über Spiele, Systeme, Aktionen) statt nur ein Suchfeld zu fokussieren.', en: '"/" now opens the command palette (live search over games, systems, actions) instead of just focusing a search field.', ja: '「/」で検索欄にフォーカスする代わりにコマンドパレット（ゲーム・機種・操作のライブ検索）を開くようになりました。' },
      { type: 'improve', de: 'GitHub-Link zusätzlich unten links neben der Version; „Geführte Tour" heißt jetzt kurz „Tour".', en: 'GitHub link also bottom-left next to the version; "Guided tour" is now simply "Tour".', ja: 'バージョン表示の隣（左下）にも GitHub リンクを追加。「ガイドツアー」は「ツアー」に短縮。' },
      { type: 'fix', de: 'Doku-Seite: Inhalt wurde nicht angezeigt (Layout-Bug) — behoben; die Seite ist jetzt zweisprachig (Deutsch/Englisch) mit Umschalter.', en: 'Docs site: content was not showing (layout bug) — fixed; the site is now bilingual (German/English) with a switcher.', ja: 'ドキュメントサイト: レイアウト不具合で内容が表示されなかった問題を修正。ドイツ語/英語の切替に対応しました。' },
      { type: 'improve', de: 'Rechtliches klargestellt: „nicht mit RetroAchievements affiliiert" jetzt prominent in App, README und Doku; Verhaltenskodex (Code of Conduct) und ein kurzer Datenschutz-Hinweis ergänzt.', en: 'Legal clarified: "not affiliated with RetroAchievements" now prominent in the app, README and docs; added a Code of Conduct and a short privacy note.', ja: '法的な位置づけを明確化: 「RetroAchievements とは非提携」をアプリ・README・ドキュメントで明示し、行動規範（Code of Conduct）と簡潔なプライバシー注記を追加しました。' },
    ],
  },
  {
    version: '0.9.4',
    date: '2026-07-25',
    title: { de: 'Schlanke Kopfleiste, mobil & Doku-Seite', en: 'Slim header, mobile & docs site', ja: 'スリムなヘッダー、モバイル対応、ドキュメントサイト' },
    changes: [
      { type: 'improve', de: 'Aufgeräumte Kopfleiste: Sprache, geführte Tour, Tastatur-Shortcuts und GitHub liegen jetzt gebündelt im „Mehr“-Menü (⋯) oben rechts.', en: 'Tidier top bar: language, guided tour, keyboard shortcuts and GitHub now live together in the "More" menu (⋯) in the top-right.', ja: 'ヘッダーを整理: 言語、ガイドツアー、キーボードショートカット、GitHub を右上の「その他」メニュー（⋯）にまとめました。' },
      { type: 'improve', de: 'Übersicht: die vier Schnellzugriffe (Scannen · Sammlung · Spiele · Hash-DB) haben kürzere Beschriftungen und ordnen sich auf dem Handy sauber an.', en: 'Dashboard: the four quick actions (Scan · Collection · Games · Hash DB) have shorter labels and lay out cleanly on phones.', ja: 'ダッシュボード: 4つのクイック操作（スキャン・コレクション・ゲーム・ハッシュDB）のラベルを短くし、スマホでもきれいに並ぶようにしました。' },
      { type: 'fix', de: 'Mobile Darstellung: kein horizontales Verrutschen mehr (Aurora-Hintergrund und Kopfzeile korrigiert). Kopfleiste, Übersicht, Spiele, Einstellungen und Fenster passen jetzt auf schmale Bildschirme.', en: 'Mobile layout: no more horizontal drift (aurora background and header fixed). Top bar, dashboard, games, settings and dialogs now fit narrow screens.', ja: 'モバイル表示: 横方向のずれを解消（オーロラ背景とヘッダーを修正）。ヘッダー、ダッシュボード、ゲーム、設定、各ダイアログが狭い画面に収まります。' },
      { type: 'feature', de: 'Neue Dokumentations-Seite im modernen Docs-Look (docs-site/): Installation, erster Start, Funktionen, FAQ und Fehlerbehebung — z. B. über GitHub Pages hostbar.', en: 'New documentation site with a modern docs look (docs-site/): install, first run, features, FAQ and troubleshooting — hostable e.g. via GitHub Pages.', ja: 'モダンなドキュメントサイトを新設（docs-site/）: インストール、初回起動、機能、FAQ、トラブルシューティング — GitHub Pages などで公開できます。' },
      { type: 'improve', de: 'Texte durchgesehen und korrigiert (u. a. „ROMs/Ordner hier ablegen“ statt „fallen lassen“, veralteter Tour-Hinweis).', en: 'Copy reviewed and corrected (e.g. clearer drop-zone wording and a stale tour hint).', ja: '文言を見直して修正（ドロップゾーンの表現、古いツアーの記述など）。' },
    ],
  },
  {
    version: '0.9.3',
    date: '2026-07-25',
    title: { de: 'Download-Zielordner für Gratis-Spiele', en: 'Download folder for free games', ja: 'フリーゲーム用ダウンロードフォルダ' },
    changes: [
      { type: 'feature', de: 'Neuer „Download-Zielordner" (Einstellungen → Allgemein): lege fest, wo heruntergeladene Gratis-Spiel-ROMs liegen, und öffne ihn mit einem Klick. Im Bereich Entdecken → Gratis-Spiele zeigt RAChecker den Ordner an (oder fordert dich auf, einen festzulegen).', en: 'New "Download folder" (Settings → General): set where downloaded free-game ROMs live and open it with one click. In Discover → Free games, RAChecker shows the folder (or prompts you to pick one).', ja: '新しい「ダウンロードフォルダ」（設定 → 一般）: ダウンロードしたフリーゲーム ROM の保存先を指定し、1クリックで開けます。発見 → フリーゲームではそのフォルダを表示します（未設定の場合は設定を促します）。' },
      { type: 'improve', de: 'Klarstellung: Die „Download"-Buttons der Gratis-Spiele führen zu den externen Seiten der Entwickler (atariage, itch.io, GitHub …). Die Datei lädst du dort selbst herunter — RAChecker kann diese Seiten nicht automatisch abgreifen. Am besten legst du den Zielordner in deinen ROM-Oberordner, dann findet der Scan die Spiele sofort.', en: 'Clarified: the free-game "Download" buttons open the developers\' external pages (atariage, itch.io, GitHub …). You download the file there yourself — RAChecker cannot scrape those pages automatically. Put the target folder inside your ROM top folder so scans pick the games up right away.', ja: '補足: フリーゲームの「ダウンロード」ボタンは開発者の外部ページ（atariage、itch.io、GitHub など）を開きます。ファイルはそこでご自身で取得してください — RAChecker はこれらのページを自動取得できません。保存先を ROM 最上位フォルダ内にすれば、スキャンですぐに認識されます。' },
    ],
  },
  {
    version: '0.9.2',
    date: '2026-07-25',
    title: { de: 'Spielzeit sichern & lebendiger Bildschirmschoner', en: 'Back up playtime & a livelier screensaver', ja: 'プレイ時間のバックアップとスクリーンセーバー強化' },
    changes: [
      { type: 'feature', de: 'Spielzeit-Verlauf als JSON exportieren und wieder importieren (Profil → Insights → Spielzeit) — für einen zweiten Rechner oder als getrenntes Backup. Der Import überspringt bereits vorhandene Sessions, ist also beliebig oft wiederholbar. Import geht auch, ohne das Tracking einzuschalten.', en: 'Export the playtime history as JSON and import it again (Profile → Insights → Playtime) — for a second machine or a separate backup. The import skips sessions that already exist, so it is safe to repeat. Import works even without enabling tracking.', ja: 'プレイ時間履歴を JSON で書き出し・読み込みできます（プロフィール → 分析 → プレイ時間） — 別 PC への移行や別途バックアップに。既存セッションはスキップされるので何度でも安全に実行でき、記録機能がオフのままでも読み込めます。' },
      { type: 'improve', de: 'Der Bildschirmschoner (nach 90 s Inaktivität) zeigt jetzt wechselnde Live-Zahlen — Hashes, Systeme, Sammlungsgröße, Treffer mit Erfolgen und das zuletzt gefundene Spiel — statt einer festen Zeile.', en: 'The screensaver (after 90 s idle) now cycles through live numbers — hashes, systems, collection size, matches with achievements and the last game found — instead of one fixed line.', ja: 'スクリーンセーバー（90秒の無操作後）が固定文の代わりにライブな数値 — ハッシュ数、機種数、コレクション規模、実績ありのマッチ数、直近に見つかったゲーム — を切り替え表示します。' },
    ],
  },
  {
    version: '0.9.1',
    date: '2026-07-25',
    title: { de: 'Feinschliff: Einstellungen, Sortierung & Klarheit', en: 'Polish: settings, sorting & clarity', ja: '仕上げ: 設定・並び替え・分かりやすさ' },
    changes: [
      { type: 'improve', de: 'Einstellungen aufgeräumt: „Darstellung“ ist jetzt Teil von „Allgemein“, RA-Konto und ROM-Ordner nutzen die volle Breite, und „Erweitert“ ist nicht mehr eingeklappt.', en: 'Settings tidied: "Appearance" is now part of "General", RA account and ROM folder use the full width, and "Advanced" is no longer collapsed.', ja: '設定を整理: 「外観」を「一般」に統合し、RA アカウントと ROM フォルダは全幅表示に、「詳細」は折りたたまないようにしました。' },
      { type: 'feature', de: 'Spiele sortierbar: Systeme nach Name oder Spielanzahl, die Spielliste nach Punkten, Erfolgen oder Name.', en: 'Games are sortable: systems by name or game count, the game list by points, achievements or name.', ja: 'ゲームを並べ替え可能に: 機種は名前またはゲーム数、ゲーム一覧はポイント・実績数・名前で並べられます。' },
      { type: 'improve', de: 'Entdecken → Gratis-Spiele: ein Klick auf die Karte öffnet die Details (wie überall sonst), der Extra-Button ist weg. Der Download-Button bleibt.', en: 'Discover → free games: a click on the card opens the details (like everywhere else), the extra button is gone. The download button stays.', ja: '発見 → フリーゲーム: 他と同じくカードをクリックすると詳細が開き、余分なボタンを削除しました。ダウンロードボタンはそのままです。' },
      { type: 'improve', de: 'Das Ergebnis-Fenster beim manuellen Datei-Test (Drag & Drop) ist jetzt deutlich breiter.', en: 'The result window for the manual file test (drag & drop) is now much wider.', ja: '手動ファイルチェック（ドラッグ＆ドロップ）の結果ウィンドウを大幅に広くしました。' },
      { type: 'improve', de: '„Offline“-Texte klarer: die Hash-Datenbank wird einmalig geladen, danach läuft jeder Scan offline. Das Feld „Als beendet gilt nach“ hat jetzt eine Erklärung.', en: '"Offline" wording clarified: the hash database is loaded once, after that every scan runs offline. The "Consider ended after" field now has an explanation.', ja: '「オフライン」の説明を明確化: ハッシュDB は一度取得すれば、以降のスキャンはすべてオフラインで動作します。「終了とみなす時間」の項目にも説明を追加しました。' },
      { type: 'feature', de: 'GitHub-Link im Kopfbereich.', en: 'GitHub link in the header.', ja: 'ヘッダーに GitHub リンクを追加。' },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-07-24',
    title: { de: 'Entdecken, Hardcore, Spielzeit & Emulator-Start', en: 'Discover, hardcore, playtime & emulator launch', ja: '発見、ハードコア、プレイ時間、エミュ起動' },
    changes: [
      { type: 'feature', de: 'Neuer Bereich „Entdecken“: Gratis-Spiele (legale Homebrew-Downloads mit Achievements), Set-Radar (welche Sets gerade gebaut werden — und ob es deine ROMs betrifft) und Community (Achievement der Woche, frisch gemeisterte Spiele).', en: 'New "Discover" area: free games (legal homebrew downloads with achievements), set radar (which sets are being built right now — and whether it affects your ROMs) and community (Achievement of the Week, freshly mastered games).', ja: '新エリア「発見」: フリーゲーム（実績付きの合法な同人ソフト）、セットレーダー（今どのセットが制作中か、自分の ROM に関係するか）、コミュニティ（今週の実績、直近マスターされた作品）。' },
      { type: 'feature', de: 'Hardcore-Aufholliste: zeigt für jedes Spiel, wie weit dein Hardcore-Fortschritt dem Softcore-Fortschritt hinterherhängt — eigene ROMs zuerst. Jeder Softcore-Erfolg lässt sich in Hardcore erneut holen.', en: 'Hardcore catch-up list: shows for every game how far your hardcore progress trails softcore — your own ROMs first. Every softcore unlock can be earned again in hardcore.', ja: 'ハードコアキャッチアップ: ゲームごとにハードコア進捗がソフトコアにどれだけ遅れているかを表示 — 所持 ROM を優先。ソフトコアで解除した実績はハードコアで取り直せます。' },
      { type: 'feature', de: 'Spielzeit-Tracking (opt-in): fragt per Rich Presence ab, was du spielst, und baut daraus eine lokale Spielzeit-Historie mit Sessions — etwas, das RetroAchievements selbst nicht speichert.', en: 'Playtime tracking (opt-in): polls Rich Presence for what you are playing and builds a local session history from it — something RetroAchievements itself does not store.', ja: 'プレイ時間記録（オプトイン）: リッチプレゼンスからプレイ中のゲームを取得し、ローカルにセッション履歴を作成します — RetroAchievements 自体は保存しない情報です。' },
      { type: 'feature', de: 'Direkt starten: ROMs aus der Sammlung mit einem Klick in RetroArch öffnen, inklusive passender Core-Empfehlung pro System (Achievements/Hardcore-Tauglichkeit vermerkt).', en: 'Launch directly: open ROMs from your collection in RetroArch with one click, including the matching core recommendation per system (achievement/hardcore capability noted).', ja: '直接起動: コレクションの ROM を 1 クリックで RetroArch で開けます。機種ごとの推奨コア（実績・ハードコア対応の可否付き）も表示します。' },
      { type: 'feature', de: 'Ranglisten: pro Spiel alle RA-Ranglisten mit deinem eigenen Eintrag und Platz (Ranglisten zählen nur im Hardcore-Modus).', en: 'Leaderboards: all RA leaderboards per game with your own entry and rank (leaderboards only count in hardcore mode).', ja: 'リーダーボード: ゲームごとの RA リーダーボードを自分の記録と順位付きで表示（リーダーボードはハードコアのみ対象）。' },
      { type: 'feature', de: 'RA-Weltabdeckung: wie viel Prozent aller RA-Spiele, -Achievements und -Punkte deine Sammlung abdeckt, pro System aufgeschlüsselt.', en: 'RA world coverage: what percentage of all RA games, achievements and points your collection covers, broken down per system.', ja: 'RA 全体カバレッジ: RA の全ゲーム・実績・ポイントのうち、コレクションがカバーする割合を機種別に表示します。' },
      { type: 'feature', de: 'Offline-Paket: Hash-DB, Spieldetails und Bildcache als ein Archiv exportieren/importieren — für einen zweiten Rechner oder als Vollbackup, plus Offline-Bereitschaftscheck.', en: 'Offline package: export/import hash DB, game details and image cache as one archive — for a second machine or as a full backup, plus an offline-readiness check.', ja: 'オフラインパッケージ: ハッシュDB、ゲーム詳細、画像キャッシュを1つのアーカイブで書き出し・読み込み — 別 PC 用や完全バックアップに。オフライン準備状況のチェック付き。' },
      { type: 'feature', de: 'Mehr Export-Formate: neben RetroArch-Playlists jetzt auch ES-DE/EmulationStation, Playnite und LaunchBox. Der ES-DE-Export liefert ein ZIP mit einer gamelist.xml pro System und relativen Pfaden — genau so, wie ES-DE es erwartet.', en: 'More export formats: besides RetroArch playlists now also ES-DE/EmulationStation, Playnite and LaunchBox. The ES-DE export ships a ZIP with one gamelist.xml per system and relative paths — exactly what ES-DE expects.', ja: '書き出し形式を拡充: RetroArch プレイリストに加えて ES-DE/EmulationStation、Playnite、LaunchBox に対応。ES-DE 向けは機種ごとの gamelist.xml と相対パスを含む ZIP を出力します — ES-DE が期待する形式そのままです。' },
      { type: 'fix', de: 'Geführte Tour: die Hinweisbox bleibt jetzt immer vollständig im Bild — bei Schritten am unteren Rand („Lokal & offline") ragten Weiter/Zurück vorher aus dem Fenster.', en: 'Guided tour: the hint card now always stays fully on screen — on steps anchored near the bottom edge ("Local & offline") the next/back buttons used to be cut off.', ja: 'ガイドツアー: ヒントカードが常に画面内に収まるようになりました — 下端付近のステップ（「ローカル＆オフライン」）で「次へ/戻る」が切れていました。' },
      { type: 'improve', de: 'Neu unterstützte Systeme werden nach einem Sync gemeldet — RetroAchievements fügt regelmäßig welche hinzu (Gamecube 2024, Wii 2026).', en: 'Newly supported systems are reported after a sync — RetroAchievements keeps adding them (GameCube 2024, Wii 2026).', ja: '同期後に新たに対応した機種をお知らせします — RetroAchievements は定期的に機種を追加しています（GameCube 2024、Wii 2026）。' },
      { type: 'improve', de: 'Versions-Finder zeigt jetzt direkt alle von RA unterstützten Datei-Versionen samt Region-Hinweis, damit „Unsupported Game Version“ erklärbar wird.', en: 'The version finder now lists every file version RA supports plus a region hint, making "Unsupported Game Version" explainable.', ja: 'バージョンファインダーが RA の対応ファイルバージョンをすべてリージョン情報付きで表示し、「Unsupported Game Version」の理由が分かるようになりました。' },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-07-11',
    title: { de: 'Desktop-App, Sicherheit & Community-Release', en: 'Desktop app, security & community release', ja: 'デスクトップアプリ、セキュリティ、コミュニティ公開' },
    changes: [
      { type: 'feature', de: 'Desktop-App: RAChecker lässt sich jetzt als eigenständige Windows-App bauen (Installer + Portable) — ein Fenster, kein Browser, keine Konsole. Anleitung: docs/BUILDING.md.', en: 'Desktop app: RAChecker can now be built as a standalone Windows app (installer + portable) — one window, no browser, no console. Guide: docs/BUILDING.md.', ja: 'デスクトップアプリ: RAChecker を単体の Windows アプリ（インストーラ＋ポータブル）としてビルドできます — ウィンドウ1つ、ブラウザもコンソールも不要。手順: docs/BUILDING.md。' },
      { type: 'feature', de: 'Community-Release: MIT-Lizenz, Mitmach-Anleitung (CONTRIBUTING), automatische Tests per CI und ein Start-Skript für Linux/Mac.', en: 'Community release: MIT license, CONTRIBUTING guide, automated CI tests and a Linux/Mac launch script.', ja: 'コミュニティ公開: MIT ライセンス、コントリビュートガイド、CI による自動テスト、Linux/Mac 用起動スクリプト。' },
      { type: 'improve', de: 'Komplett offline: Schriften werden jetzt mitgeliefert statt von Google geladen — die App braucht nach dem Sync wirklich kein Internet mehr.', en: 'Fully offline: fonts now ship with the app instead of loading from Google — after syncing, the app truly needs no internet.', ja: '完全オフライン: フォントを Google から読み込まず同梱するようになりました — 同期後は本当にインターネット不要です。' },
      { type: 'fix', de: 'Sicherheit: Die lokale API ist nicht mehr von fremden Webseiten aus ansprechbar (CORS nur noch localhost) und der Bild-Cache lädt nur noch von RetroAchievements-Servern.', en: 'Security: the local API can no longer be called from foreign websites (CORS restricted to localhost) and the image cache only fetches from RetroAchievements servers.', ja: 'セキュリティ: ローカル API を外部サイトから呼び出せなくし（CORS を localhost に限定）、画像キャッシュは RetroAchievements のサーバーからのみ取得します。' },
      { type: 'fix', de: 'Nur noch ein Scan zur Zeit: manueller Scan, Ordner-Überwachung und geplanter Scan koordinieren sich jetzt — kein doppeltes NAS-Hämmern mehr.', en: 'Only one scan at a time: manual scan, folder watch and scheduled scan now coordinate — no more double NAS hammering.', ja: 'スキャンは同時に1つだけ: 手動スキャン、フォルダ監視、スケジュールスキャンが連携するようになり、NAS への二重負荷がなくなりました。' },
      { type: 'fix', de: 'Scan- und Sync-Fehler erscheinen jetzt sichtbar in der Oberfläche statt still zu verpuffen; läuft woanders schon ein Scan, sagt dir der Scan-Tab das.', en: 'Scan and sync errors now show up visibly in the UI instead of vanishing silently; if a scan is already running elsewhere, the scan tab tells you.', ja: 'スキャン・同期のエラーが黙って消えず、UI に表示されるようになりました。他でスキャンが実行中の場合はスキャンタブが知らせます。' },
      { type: 'fix', de: 'Duplikat-Löschen: Dateien, die nicht gelöscht werden konnten (z. B. gesperrt), bleiben in der Sammlung sichtbar statt zu verschwinden.', en: 'Duplicate cleanup: files that could not be deleted (e.g. locked) stay visible in the collection instead of disappearing.', ja: '重複整理: 削除できなかったファイル（ロック中など）がコレクションから消えず、引き続き表示されます。' },
      { type: 'fix', de: 'Spiel-Details öffnen nicht mehr unsichtbar hinter dem Upload-Fenster; Esc schließt jetzt das oberste Fenster.', en: 'Game details no longer open invisibly behind the upload window; Esc now closes the topmost window.', ja: 'ゲーム詳細がアップロードウィンドウの背後に隠れて開く不具合を修正。Esc で最前面のウィンドウを閉じます。' },
      { type: 'improve', de: 'Licht-Design deutlich lesbarer: Kontraste, Tabellenköpfe und Hover-Effekte angepasst; rote Warn-Buttons leuchten rot; Tastatur-Fokus ist jetzt sichtbar.', en: 'Light theme far more readable: contrast, table headers and hover effects fixed; destructive buttons glow red; keyboard focus is now visible.', ja: 'ライトテーマの可読性を大幅改善: コントラスト、表ヘッダー、ホバー効果を調整。破壊的な操作のボタンは赤く光り、キーボードフォーカスも見えるようになりました。' },
      { type: 'improve', de: 'Letzte deutsche Rest-Texte übersetzt — die englische Oberfläche ist jetzt wirklich vollständig.', en: 'Last remaining German strings translated — the English UI is now truly complete.', ja: '残っていたドイツ語の文言をすべて翻訳 — 英語 UI が完全になりました。' },
      { type: 'fix', de: 'Stabilität: Timer-Leck beim Scannen behoben, RAR-Archive brauchen nur noch halb so viel Speicher (klare Meldung bei zu großen RARs), Sammlungs-Check blockiert den Server nicht mehr bei nicht erreichbarem NAS, geplante Scans holen eine verpasste Minute nach.', en: 'Stability: fixed a timer leak while scanning, RAR archives need half the memory (clear message for oversized RARs), the collection health check no longer freezes the server when the NAS is unreachable, scheduled scans catch up a missed minute.', ja: '安定性: スキャン時のタイマーリークを修正、RAR アーカイブのメモリ使用量を半減（大きすぎる RAR には明確なメッセージ）、NAS に到達できないときにコレクション検査がサーバーを止めないように修正、スケジュールスキャンは逃した1分を補います。' },
    ],
  },
  {
    version: '0.7.4',
    date: '2026-07-03',
    title: { de: 'Geplante Scans, Duplikat-Aufräumen & Bulk-Aktionen', en: 'Scheduled scans, duplicate cleanup & bulk actions', ja: 'スケジュールスキャン、重複整理、一括操作' },
    changes: [
      { type: 'feature', de: 'Geplanter Scan: einmal täglich zur eingestellten Uhrzeit automatisch scannen (an/aus, Einstellungen → Scannen).', en: 'Scheduled scan: automatically scan once a day at a set time (on/off, Settings → Scanning).', ja: 'スケジュールスキャン: 指定時刻に1日1回自動でスキャン（オン/オフ、設定 → スキャン）。' },
      { type: 'feature', de: 'Duplikate: Extra-Kopien direkt löschen (behält die erste Datei) — echtes 1G1R-Aufräumen.', en: 'Duplicates: delete extra copies directly (keeps the first file) — real 1G1R cleanup.', ja: '重複: 余分なコピーを直接削除（最初のファイルを保持） — 本格的な 1G1R 整理。' },
      { type: 'feature', de: 'Sammlung: Mehrfachauswahl (Karten-Ansicht) → ausgewählte Dateien löschen oder Pfade kopieren.', en: 'Collection: multi-select (card view) → delete selected files or copy their paths.', ja: 'コレクション: カード表示での複数選択 → 選択ファイルの削除やパスのコピーができます。' },
      { type: 'improve', de: 'Speicher-Übersicht lädt schneller (kurzzeitig zwischengespeichert).', en: 'Storage overview loads faster (briefly cached).', ja: 'ストレージ概要の表示が高速化（短時間キャッシュ）。' },
      { type: 'improve', de: 'Automatische Tests für die Hash-Korrektheit (Schutz vor stillen Regressionen).', en: 'Automated tests for hash correctness (guards against silent regressions).', ja: 'ハッシュ正確性の自動テストを追加（黙ったデグレを防止）。' },
    ],
  },
  {
    version: '0.7.3',
    date: '2026-07-03',
    title: { de: 'Scan schneller, klarer & wirklich abbrechbar', en: 'Scan faster, clearer & truly cancelable', ja: 'スキャンを高速・明確に、確実に中断可能に' },
    changes: [
      { type: 'feature', de: 'Scan zeigt jetzt live, was er tut: entpacken · kopieren · prüfen — inkl. Fortschritt (%) bei großen Dateien.', en: 'Scan now shows live what it is doing: extracting · copying · hashing — with progress (%) for large files.', ja: 'スキャン中の動作をライブ表示: 展開 · コピー · ハッシュ計算 — 大きなファイルでは進捗（%）付き。' },
      { type: 'fix', de: 'Abbrechen stoppt jetzt WIRKLICH laufende Prüfungen/Kopien (RAHasher-Prozess & Kopie werden beendet) — kein Weiterlaufen im Hintergrund mehr.', en: 'Cancel now REALLY stops in-flight checks/copies (RAHasher process & copy are killed) — nothing keeps running in the background.', ja: 'キャンセルが実行中のチェックやコピーを確実に停止します（RAHasher プロセスとコピーを終了） — バックグラウンドで続行しません。' },
      { type: 'fix', de: 'Große Dateien werden nur noch für RAHasher-Discs lokal kopiert (nicht mehr bei normalem Hashing) — halbiert die I/O, deutlich schneller.', en: 'Large files are only copied locally for RAHasher discs (no longer for plain hashing) — halves the I/O, much faster.', ja: '大きなファイルのローカルコピーは RAHasher 対象のディスクのみに限定（通常のハッシュ計算では行わない） — I/O が半分になり大幅に高速化。' },
      { type: 'fix', de: 'Kopie/Prüfung bricht nur noch bei echtem Stillstand ab (Leerlauf-Timeout) — langsame, aber stetige Übertragungen laufen durch (kein Fehl-Timeout bei 1–6 GB auf langsamem NAS).', en: 'Copy/check only times out on a real stall (idle timeout) — slow-but-steady transfers finish (no false timeout on 1–6 GB over a slow NAS).', ja: 'コピー・チェックは本当に停滞したときだけタイムアウトします（アイドルタイムアウト） — 低速でも安定した転送は完了します（低速 NAS 上の 1〜6 GB での誤タイムアウトなし）。' },
      { type: 'feature', de: 'Parallele Scan-Dateien einstellbar (Einstellungen → Scannen) — bei langsamem NAS auf 1–2 senken.', en: 'Parallel scan files configurable (Settings → Scanning) — lower to 1–2 for a slow NAS.', ja: 'スキャンの並列ファイル数を設定可能に（設定 → スキャン） — 低速 NAS では 1〜2 に下げてください。' },
      { type: 'improve', de: 'Klarere Meldung bei mehrdeutigen Disc-Images (welchen System-Ordner du brauchst).', en: 'Clearer message for ambiguous disc images (which system folder to use).', ja: '曖昧なディスクイメージのメッセージを明確化（どの機種フォルダが必要か）。' },
    ],
  },
  {
    version: '0.7.2',
    date: '2026-07-03',
    title: { de: 'Aufgeräumt: Einstellungen, Scan-Ansicht & Tour', en: 'Tidied: settings, scan view & tour', ja: '整理: 設定・スキャン表示・ツアー' },
    changes: [
      { type: 'improve', de: 'Einstellungen als Sektionen (Allgemein · Scannen · Daten · Darstellung · Erweitert) — je eine sichtbar, viel übersichtlicher (nichts entfernt).', en: 'Settings split into sections (General · Scanning · Data · Appearance · Advanced) — one at a time, far tidier (nothing removed).', ja: '設定をセクション化（一般 · スキャン · データ · 外観 · 詳細） — 1つずつ表示され、すっきりしました（項目の削除なし）。' },
      { type: 'improve', de: 'Scan-Ergebnisse jetzt als Karten oder Tabelle (statt des unklaren Kompakt/Vollständig).', en: 'Scan results now as cards or table (instead of the unclear compact/full).', ja: 'スキャン結果をカードまたはテーブルで表示（分かりにくいコンパクト/詳細の代わり）。' },
      { type: 'improve', de: 'Menüpunkt „Einzeltest" entfernt — einzelne Dateien einfach per Drag & Drop in die Seite ziehen.', en: 'Removed the "Single check" menu item — just drag single files onto the page.', ja: 'メニューの「単体チェック」を削除 — 単一ファイルはページにドラッグするだけでチェックできます。' },
      { type: 'fix', de: 'Geführte Tour: doppelt gezeigte Stationen entfernt (jede Station nur einmal).', en: 'Guided tour: removed duplicated stops (each stop shown once).', ja: 'ガイドツアー: 重複していたステップを削除（各ステップは1回のみ）。' },
      { type: 'fix', de: 'Temporärer Speicher wird beim Start automatisch aufgeräumt (Reste abgebrochener Scans).', en: 'Temp storage is auto-cleaned on startup (leftovers from interrupted scans).', ja: '起動時に一時領域を自動整理（中断したスキャンの残骸）。' },
    ],
  },
  {
    version: '0.7.1',
    date: '2026-06-30',
    title: { de: 'Feinschliff: Ansichten, Einstellungen & Vollbild', en: 'Polish: views, settings & fullscreen', ja: '仕上げ: 表示・設定・全画面' },
    changes: [
      { type: 'feature', de: 'Karten- oder Tabellen-Ansicht (umschaltbar) unter Spiele, Hash-DB, Mastery, Sammlung und Insights.', en: 'Card or table view (switchable) under Games, Hash-DB, Mastery, Collection and Insights.', ja: 'カード表示とテーブル表示の切替をゲーム、ハッシュDB、マスタリー、コレクション、分析で利用できます。' },
      { type: 'feature', de: 'Große-Datei-Kopie hat jetzt eine Obergrenze + Freispeicher-Check — kopiert keine riesigen Dateien auf eine fast volle Platte.', en: 'Large-file copy now has an upper cap + free-space check — never copies huge files onto an almost-full disk.', ja: '大容量ファイルのコピーに上限と空き容量チェックを追加 — 残量の少ないディスクに巨大なファイルをコピーしません。' },
      { type: 'improve', de: 'Einstellungen nutzen die volle Breite (zentriert) und sind übersichtlicher gruppiert.', en: 'Settings now use the full width (centered) and are grouped more clearly.', ja: '設定が全幅（中央揃え）になり、グループ分けも分かりやすくなりました。' },
      { type: 'improve', de: 'System-Auswahl zeigt die vollen Systemnamen statt nur Kürzel.', en: 'System selection shows full system names instead of just abbreviations.', ja: '機種選択で略称ではなく正式な機種名を表示します。' },
      { type: 'improve', de: 'Speicher-Übersicht detaillierter: erklärt „Temporär", listet die Posten auf und bietet „Temp leeren".', en: 'Storage overview more detailed: explains "Temp", lists items and offers "Clear temp".', ja: 'ストレージ概要を詳細化: 「一時ファイル」の説明、内訳の一覧、「一時ファイルを削除」を追加。' },
      { type: 'improve', de: 'Spiel-Vollbild nutzt den Platz: mehr Spalten & Höhe für Erfolge und ROM-Versionen.', en: 'Game fullscreen uses the space: more columns & height for achievements and ROM versions.', ja: 'ゲームの全画面表示でスペースを活用: 実績と ROM バージョンの列数と高さを拡大。' },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-06-30',
    title: { de: 'Schonende Überwachung, bessere Suche & Aufräumen', en: 'Gentle watching, better search & cleanup', ja: '低負荷な監視、検索改善、整理機能' },
    changes: [
      { type: 'feature', de: 'Ordner-Überwachung komplett umgebaut: an/aus + Intervall-Modus (alle N Minuten kurz prüfen statt Dauerlast) — standardmäßig AUS, schont NAS/Festplatte.', en: 'Folder watch rebuilt: on/off + interval mode (a short check every N minutes instead of constant load) — off by default, easy on NAS/disk.', ja: 'フォルダ監視を全面再構築: オン/オフ＋定期モード（常時負荷ではなく N 分ごとに短く確認） — 既定はオフで NAS・ディスクに優しい設定です。' },
      { type: 'feature', de: 'Große Dateien werden vor dem Hashen lokal zwischenkopiert (gegen Timeouts bei großen Images auf Netzlaufwerken) — Schwelle einstellbar.', en: 'Large files are copied to local temp before hashing (avoids timeouts for big images on network drives) — threshold configurable.', ja: '大きなファイルはハッシュ計算前にローカル一時領域へコピー（ネットワークドライブ上の大容量イメージのタイムアウトを回避） — しきい値は設定可能。' },
      { type: 'feature', de: 'System-Auswahl: lege fest, welche Systeme dich interessieren — Sync & Scan überspringen den Rest.', en: 'System selection: choose which systems you care about — sync & scan skip the rest.', ja: '機種選択: 対象にしたい機種を指定 — 同期とスキャンはそれ以外をスキップします。' },
      { type: 'feature', de: 'Spiel-Details zeigen jetzt, ob du die ROM besitzt (mit Pfad), plus Vollbild-Ansicht.', en: 'Game details now show whether you own the ROM (with path), plus a fullscreen view.', ja: 'ゲーム詳細で ROM を所持しているか（パス付き）を表示し、全画面表示も追加。' },
      { type: 'feature', de: 'Speicher-Übersicht: sehen, wie viel Datenbank, Bilder, Backups & Temp belegen.', en: 'Storage overview: see how much database, images, backups & temp use.', ja: 'ストレージ概要: データベース・画像・バックアップ・一時ファイルの使用量を確認できます。' },
      { type: 'improve', de: 'Spiele-Suche viel treffsicherer: „oracle of ages" findet nicht mehr „Legend of Mana" (Stoppwörter ignoriert, alle Suchwörter müssen passen).', en: 'Game search far more accurate: "oracle of ages" no longer returns "Legend of Mana" (stopwords ignored, all search words must match).', ja: 'ゲーム検索の精度を大幅向上: 「oracle of ages」で「Legend of Mana」が出なくなりました（ストップワードを無視し、全検索語の一致を要求）。' },
      { type: 'improve', de: 'Spiele-Suche zeigt die Trefferanzahl an.', en: 'Game search shows the number of results.', ja: 'ゲーム検索でヒット件数を表示します。' },
      { type: 'improve', de: 'Einstellungen aufgeräumt & strukturiert; erweiterte Werte (Rate-Limit, Pfade) direkt in der App editierbar.', en: 'Settings tidied & structured; advanced values (rate limit, paths) editable right in the app.', ja: '設定を整理・構造化し、詳細項目（レート制限、パス）をアプリ内で編集できるようにしました。' },
      { type: 'improve', de: 'Geführte Tour erweitert; Scan-Tabelle mit kompakter/voller Ansicht.', en: 'Guided tour expanded; scan table with compact/full view.', ja: 'ガイドツアーを拡充。スキャン表にコンパクト/詳細表示を追加。' },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-06-29',
    title: { de: 'Politur, Tools & Spielereien', en: 'Polish, tools & playfulness', ja: '磨き上げ、ツール、遂び心' },
    changes: [
      { type: 'feature', de: 'Englische Übersetzung der gesamten Oberfläche (alle Ansichten), umschaltbar oben rechts.', en: 'Full English translation of the whole UI (all views), switchable top-right.', ja: 'UI 全体（全画面）の英語翻訳。右上から切り替えられます。' },
      { type: 'feature', de: 'Befehlspalette (Strg+K): Spiele, Aktionen & Navigation blitzschnell finden.', en: 'Command palette (Ctrl+K): find games, actions & navigation instantly.', ja: 'コマンドパレット（Ctrl+K）: ゲーム、操作、画面移動を素早く検索。' },
      { type: 'feature', de: 'Geführte Tour erklärt die Oberfläche Schritt für Schritt.', en: 'Guided tour explains the UI step by step.', ja: 'ガイドツアーが UI をステップごとに説明します。' },
      { type: 'feature', de: 'Status-Box: laufender Scan/Sync/Bild-Vorladen bleibt beim Tab-Wechsel sichtbar.', en: 'Status box: a running scan/sync/image pre-load stays visible across tabs.', ja: 'ステータスボックス: 実行中のスキャン/同期/画像事前取得がタブを切り替えても見えます。' },
      { type: 'feature', de: 'Sammlung aufräumen: fehlende/verschobene ROMs finden & entfernen. RetroArch-Playlist (.lpl) exportieren.', en: 'Clean up collection: find & remove missing/moved ROMs. Export a RetroArch playlist (.lpl).', ja: 'コレクションの整理: 見つからない・移動された ROM を検出して削除。RetroArch プレイリスト（.lpl）の書き出しも可能。' },
      { type: 'feature', de: 'Benachrichtigung, wenn die Ordner-Überwachung neue Treffer findet.', en: 'Notification when folder watch finds new matches.', ja: 'フォルダ監視が新しいマッチを見つけたときに通知します。' },
      { type: 'feature', de: 'Mehr Leben: animierte Zähler, weiche Übergänge, Skeleton-Ladeanzeigen, optionaler Aurora-Hintergrund, Ring- statt Balken-Fortschritt (wählbar).', en: 'More life: animated counters, smooth transitions, skeleton loaders, optional aurora background, ring instead of bar progress (selectable).', ja: '表現を強化: カウンターのアニメーション、なめらかなトランジション、スケルトン表示、任意のオーロラ背景、バーの代わりにリング進捗（選択可）。' },
      { type: 'feature', de: 'Neue interaktive Easter-Eggs: spielbares Snake (tippe „snake"), Live-CRT-Regler („crt"), steuerbarer Pac-Man („waka"), versteckte Klick-Jagd.', en: 'New interactive easter eggs: playable Snake (type "snake"), live CRT tuner ("crt"), steerable Pac-Man ("waka"), hidden click hunt.', ja: '新しいインタラクティブな隠し要素: プレイ可能なスネーク（「snake」と入力）、ライブ CRT 調整（「crt」）、操作できるパックマン（「waka」）、隠しクリック探し。' },
      { type: 'fix', de: 'ZIPs mit LZMA-Kompression („Unknown compression method") werden jetzt über 7za entpackt.', en: 'ZIPs with LZMA compression ("Unknown compression method") are now extracted via 7za.', ja: 'LZMA 圧縮の ZIP（「Unknown compression method」）を 7za 経由で展開できるようになりました。' },
      { type: 'fix', de: 'Klarere Hashing-Fehlermeldungen; Scan-Timeout-Standard auf 10 Min angehoben (große Images auf Netzlaufwerken).', en: 'Clearer hashing error messages; default scan timeout raised to 10 min (large images on network drives).', ja: 'ハッシュ計算のエラーメッセージを明確化。スキャンタイムアウトの既定を 10 分に引き上げ（ネットワーク上の大容量イメージ対応）。' },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-06-28',
    title: { de: 'Onboarding, Diff & Offline', en: 'Onboarding, Diff & Offline', ja: '初期設定、差分、オフライン' },
    changes: [
      { type: 'feature', de: 'Erst-Start-Assistent: ROM-Ordner, RA-Login und Hash-Sync in drei Schritten.', en: 'First-run wizard: ROM folder, RA login and hash sync in three steps.', ja: '初回起動ウィザード: ROM フォルダ、RA ログイン、ハッシュ同期を 3 ステップで。' },
      { type: 'feature', de: 'Sammlung-Diff: zeigt nach jedem Scan, was neu ist, jetzt Erfolge hat, verloren oder verschwunden ist.', en: 'Collection diff: after each scan, see what is new, newly playable, lost or gone.', ja: 'コレクション差分: スキャンごとに新規・新たにプレイ可能・失われた・消えた項目を表示します。' },
      { type: 'feature', de: 'Erfolgs-Badges & Boxart lassen sich vorab lokal speichern — Spiel-Details laden danach komplett offline.', en: 'Achievement badges & box art can be pre-cached locally — game details then load fully offline.', ja: '実績バッジとボックスアートを事前にローカル保存 — ゲーム詳細が完全オフラインで表示されます。' },
      { type: 'feature', de: 'Tastatur-Shortcuts (g+Taste für Navigation, / für Suche, ? für Hilfe, Esc schließt).', en: 'Keyboard shortcuts (g+key to navigate, / to search, ? for help, Esc to close).', ja: 'キーボードショートカット（g＋キーで移動、/ で検索、? でヘルプ、Esc で閉じる）。' },
      { type: 'feature', de: 'Englische Übersetzung der Kern-Oberfläche — Sprache oben rechts umschaltbar.', en: 'English translation of the core UI — switch language top-right.', ja: '主要 UI の英語翻訳 — 右上から言語を切替できます。' },
      { type: 'feature', de: 'Versions-Verlauf: ein Klick auf die Version unten links öffnet das Änderungsprotokoll.', en: 'Version history: click the version bottom-left to open the changelog.', ja: 'バージョン履歴: 左下のバージョン表示をクリックすると更新履歴が開きます。' },
      { type: 'feature', de: 'Neues Easter-Egg — tippe „waka". 🟡', en: 'New easter egg — type "waka". 🟡', ja: '新しい隠し要素 — 「waka」と入力。🟡' },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-06-27',
    title: { de: 'Profil-Hub & Caching', en: 'Profile hub & caching', ja: 'プロフィールハブとキャッシュ' },
    changes: [
      { type: 'feature', de: 'Profil-Hub mit Mastery, Sammlung und Insights als Unter-Tabs.', en: 'Profile hub with Mastery, Collection and Insights as sub-tabs.', ja: 'マスタリー・コレクション・分析をサブタブにまとめたプロフィールハブ。' },
      { type: 'feature', de: 'Quick Wins: Spiele kurz vor Mastery und schnelle Einstiege auf der Übersicht.', en: 'Quick Wins: games close to mastery and easy starts on the dashboard.', ja: 'クイックウィン: マスター間近のゲームと始めやすいゲームをダッシュボードに表示。' },
      { type: 'feature', de: 'Versions-Report: für „Kein Match"-ROMs die passende unterstützte RA-Version finden.', en: 'Version report: find the supported RA version for "no match" ROMs.', ja: 'バージョンレポート: 「マッチなし」の ROM に対応する RA バージョンを探せます。' },
      { type: 'feature', de: 'Automatische DB-Backups (Start + nach Scan), manuell, Download und Restore.', en: 'Automatic DB backups (start + after scan), manual, download and restore.', ja: 'DB の自動バックアップ（起動時＋スキャン後）、手動実行、ダウンロード、復元に対応。' },
      { type: 'improve', de: 'Konfigurierbare Cache-Fristen und manuelles Aktualisieren überall.', en: 'Configurable cache TTLs and manual refresh everywhere.', ja: 'キャッシュの有効期間を設定でき、各所で手動更新も可能に。' },
      { type: 'improve', de: 'CSV-Export für Scan und Sammlung, Sortierung und Live-Anzeige der aktuellen Datei.', en: 'CSV export for scan and collection, sorting and live current-file display.', ja: 'スキャンとコレクションの CSV 書き出し、並び替え、処理中ファイルのライブ表示。' },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-06-20',
    title: { de: 'Disc-Systeme & Überwachung', en: 'Disc systems & watching', ja: 'ディスク機種と監視' },
    changes: [
      { type: 'feature', de: 'RAHasher-Integration für Disc-Systeme (PS1, PS2, Saturn, Dreamcast …) inkl. .chd.', en: 'RAHasher integration for disc systems (PS1, PS2, Saturn, Dreamcast …) incl. .chd.', ja: 'ディスク機種（PS1、PS2、サターン、ドリームキャストなど）向けに RAHasher を統合。.chd にも対応。' },
      { type: 'feature', de: 'Ordner-Überwachung: neue/geänderte Dateien werden automatisch geprüft.', en: 'Folder watch: new/changed files are checked automatically.', ja: 'フォルダ監視: 新規・変更ファイルを自動でチェックします。' },
      { type: 'feature', de: 'Drag & Drop Schnelltest und Duplikat-Erkennung (1G1R-Helfer).', en: 'Drag & drop quick test and duplicate detection (1G1R helper).', ja: 'ドラッグ＆ドロップの簡易チェックと重複検出（1G1R 支援）。' },
      { type: 'fix', de: 'Streaming-Hashing für sehr große ROMs ohne Speicherüberlauf.', en: 'Streaming hashing for very large ROMs without memory blow-up.', ja: '巨大な ROM でもメモリを使いすぎないストリーミングハッシュ計算。' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-06-12',
    title: { de: 'Sammlung & Themes', en: 'Collection & themes', ja: 'コレクションとテーマ' },
    changes: [
      { type: 'feature', de: 'Persistente Sammlung mit Filtern nach Status und System.', en: 'Persistent collection with filters by status and system.', ja: 'ステータスと機種で絞り込める永続コレクション。' },
      { type: 'feature', de: 'Mehrere Retro-Themes und Schriftarten-Auswahl.', en: 'Multiple retro themes and font choices.', ja: '複数のレトロテーマとフォント選択。' },
      { type: 'improve', de: 'Lokaler Bild-Cache für Icons und Boxart.', en: 'Local image cache for icons and box art.', ja: 'アイコンとボックスアートのローカル画像キャッシュ。' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-06-05',
    title: { de: 'Erste Version', en: 'Initial release', ja: '初回リリース' },
    changes: [
      { type: 'feature', de: 'Rekursiver ROM-Scan mit RetroAchievements-Hash-Abgleich (Cartridge-Systeme, ZIP/RAR/7z).', en: 'Recursive ROM scan with RetroAchievements hash matching (cartridge systems, ZIP/RAR/7z).', ja: 'RetroAchievements ハッシュ照合による再帰的な ROM スキャン（カートリッジ機種、ZIP/RAR/7z）。' },
      { type: 'feature', de: 'Lokale Hash-Datenbank pro System, Einzeltest und Scan-Verlauf.', en: 'Local per-system hash database, single check and scan history.', ja: '機種ごとのローカルハッシュDB、単体チェック、スキャン履歴。' },
    ],
  },
];
