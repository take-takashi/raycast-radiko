import { writeFile, readFile, stat, mkdir } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { XMLParser } from "fast-xml-parser";
import { tmpdir } from "os";

/**
 * 放送局情報を表すインターフェース。
 */
export interface Station {
  /** 放送局ID (例: "TBS") */
  id: string;
  /** 放送局名 (例: "TBSラジオ") */
  name: string;
}

/**
 * Radikoの番組情報を表すインターフェース。
 */
export interface RadikoProgram {
  /** 番組ID */
  id: string;
  /** 番組名 */
  title: string;
  /** 開始時間 (形式: YYYYMMDDHHmmss) */
  ft: string;
  /** 終了時間 (形式: YYYYMMDDHHmmss) */
  to: string;
  /** 番組の画像URL */
  img: string;
  /** パーソナリティ名 */
  pfm: string;
  /** 放送局ID */
  stationId: string;
  /** 放送局名 */
  stationName: string;
}

/**
 * RadikoのAPIと通信し、番組情報の取得、録音などを行うクライアントクラス。
 */
export class RadikoClient {
  /** Radiko認証で使用する固定キー */
  private static readonly AUTH_KEY = "bcd151073c03b352e1ef2fd66c32209da9ca0afa";
  /** 認証後に取得する認証トークン */
  private authToken: string | null = null;
  /** 認証後に取得するエリアコード */
  private areaCode: string | null = null;
  /** ffmpegコマンドのパス */
  private ffmpegPath: string;
  /** 番組表XMLのキャッシュを保存するディレクトリ */
  private cacheDir: string;

  /**
   * RadikoClientの新しいインスタンスを作成します。
   * @param ffmpegPath ffmpeg実行ファイルのパス。デフォルトは "ffmpeg"。
   */
  constructor(ffmpegPath = "ffmpeg") {
    this.ffmpegPath = ffmpegPath;
    this.cacheDir = join(tmpdir(), "radiko-cache");
    // キャッシュディレクトリが存在しない場合は作成する
    mkdir(this.cacheDir, { recursive: true });
  }

  // --- 認証関連 ---

  /**
   * Radikoの認証処理を実行します。
   * 認証トークンとエリアコードを取得し、インスタンス変数に格納します。
   * @returns 認証トークンとエリアコードを含むオブジェクト。
   */
  public async authenticate(): Promise<{ authToken: string; areaCode: string }> {
    // 認証処理1を実行
    const auth1Response = await this.authenticate1();
    // レスポンスから認証トークンを取得
    const authToken = this.getAuthTokenFromAuthResponse(auth1Response);
    // レスポンスから部分キーを取得
    const partialKey = this.getPartialKeyFromAuthResponse(auth1Response);
    // 認証処理2を実行
    const areaCode = await this.authenticate2(authToken, partialKey);

    // 取得したトークンとエリアコードをインスタンス変数に保存
    this.authToken = authToken;
    this.areaCode = areaCode;

    return { authToken, areaCode };
  }

  /**
   * Radiko認証のステップ1を実行します。
   * @returns `fetch` APIのレスポンスオブジェクト。
   * @throws 認証に失敗した場合にエラーをスローします。
   */
  private async authenticate1(): Promise<Response> {
    const url = "https://radiko.jp/v2/api/auth1";
    const headers = {
      "User-Agent": "curl/7.56.1",
      Accept: "*/*",
      "X-Radiko-App": "pc_html5",
      "X-Radiko-App-Version": "0.0.1",
      "X-Radiko-User": "dummy_user",
      "X-Radiko-Device": "pc",
    };

    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      throw new Error("Radikoの認証(auth1)に失敗しました。");
    }

    return response;
  }

  /**
   * 認証レスポンスヘッダーから認証トークンを抽出します。
   * @param auth_response 認証APIからのレスポンス。
   * @returns 認証トークン。
   * @throws レスポンスに認証トークンが見つからない場合にエラーをスローします。
   */
  private getAuthTokenFromAuthResponse(auth_response: Response): string {
    const authtoken = auth_response.headers.get("X-Radiko-AuthToken");
    if (!authtoken) {
      throw new Error("レスポンスに認証トークンが見つかりませんでした。");
    }
    return authtoken;
  }

  /**
   * 認証レスポンスヘッダーから部分キーを生成します。
   * @param auth_response 認証APIからのレスポンス。
   * @returns Base64エンコードされた部分キー。
   * @throws レスポンスにキーのオフセットまたは長さが見つからない場合にエラーをスローします。
   */
  private getPartialKeyFromAuthResponse(auth_response: Response): string {
    const offsetHeader = auth_response.headers.get("X-Radiko-KeyOffset");
    const lengthHeader = auth_response.headers.get("X-Radiko-KeyLength");

    if (!offsetHeader || !lengthHeader) {
      throw new Error("レスポンスにキーのオフセットまたは長さが見つかりませんでした。");
    }

    const offset = Number(offsetHeader);
    const length = Number(lengthHeader);

    const partialKeyBase = RadikoClient.AUTH_KEY.slice(offset, offset + length);
    return Buffer.from(partialKeyBase).toString("base64");
  }

  /**
   * Radiko認証のステップ2を実行します。
   * @param authToken 認証ステップ1で取得した認証トークン。
   * @param partialKey 認証ステップ1で生成した部分キー。
   * @returns エリアコード。
   * @throws 認証に失敗した場合にエラーをスローします。
   */
  private async authenticate2(authToken: string, partialKey: string): Promise<string> {
    const url = "https://radiko.jp/v2/api/auth2";
    const headers = {
      "User-Agent": "curl/7.56.1",
      Accept: "*/*",
      "X-Radiko-App": "pc_html5",
      "X-Radiko-App-Version": "0.0.1",
      "X-Radiko-User": "dummy_user",
      "X-Radiko-Device": "pc",
      "X-Radiko-AuthToken": authToken,
      "X-Radiko-PartialKey": partialKey,
    };

    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      throw new Error("Radikoの認証(auth2)に失敗しました。");
    }

    const body = await response.text();
    const areaCode = body.split(",")[0];
    return areaCode;
  }

  /**
   * APIレスポンスヘッダーをJSONファイルに保存します。デバッグ目的で使用します。
   * @param response `fetch` APIから返される`Response`オブジェクト。
   * @param filename 保存するファイル名。デフォルトは "response_headers.json"。
   */
  public static async saveAuthHeaders(response: Response, filename = "response_headers.json"): Promise<void> {
    const headerObject: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headerObject[key] = value;
    });

    const json = JSON.stringify(headerObject, null, 2);
    await writeFile(filename, json, "utf8");
  }

  // --- 放送局・番組情報関連 ---

  /**
   * 指定されたエリアのRadiko放送局リストを取得します。
   * @param areaCode エリアコード (例: "JP13")。指定しない場合は認証時に取得したエリアコードを使用します。
   * @returns `Station`オブジェクトの配列。
   * @throws エリアコードが利用できない場合にエラーをスローします。
   */
  public async getStationList(areaCode?: string): Promise<Station[]> {
    const code = areaCode || this.areaCode;
    if (!code) {
      throw new Error(
        "エリアコードが指定されておらず、認証情報からも取得できませんでした。先に認証を行うか、エリアコードを指定してください。",
      );
    }
    const xmlData = await this.fetchStationListXml(code);
    return RadikoClient.parseStationListXml(xmlData);
  }

  /**
   * 放送局リストのXMLをRadikoサーバーから取得します。
   * @param areaCode エリアコード。
   * @returns 放送局リストのXML文字列。
   * @throws XMLの取得に失敗した場合にエラーをスローします。
   */
  private async fetchStationListXml(areaCode: string): Promise<string> {
    const response = await fetch(`https://radiko.jp/v2/station/list/${areaCode}.xml`);
    if (!response.ok) {
      throw new Error("Radiko放送局リストの取得に失敗しました。");
    }
    return response.text();
  }

  /**
   * 放送局リストのXML文字列をパースし、`Station`オブジェクトの配列に変換します。
   * @param xmlData 放送局リストのXML文字列。
   * @returns パースされた`Station`オブジェクトの配列。
   */
  public static parseStationListXml(xmlData: string): Station[] {
    const parser = new XMLParser();
    const jsonObj = parser.parse(xmlData);
    const stationsArray = jsonObj.stations.station;
    return stationsArray.map((s: { id: string; name: string }) => ({
      id: s.id,
      name: s.name,
    }));
  }

  /**
   * 指定した放送局と日付の番組表を取得します。
   * @param stationId 放送局ID。
   * @param date 日付 (形式: YYYYMMDD)。
   * @returns `RadikoProgram`オブジェクトの配列。
   */
  public async getPrograms(stationId: string, date: string): Promise<RadikoProgram[]> {
    const xmlData = await this.fetchProgramsXml(stationId, date);
    return RadikoClient.parseRadikoProgramXml(xmlData);
  }

  /**
   * 番組表のXMLをRadikoサーバーから取得、またはキャッシュから読み込みます。
   * @param stationId 放送局ID。
   * @param date 日付 (形式: YYYYMMDD)。
   * @returns 番組表のXML文字列。
   * @throws XMLの取得に失敗した場合にエラーをスローします。
   */
  private async fetchProgramsXml(stationId: string, date: string): Promise<string> {
    const cachePath = join(this.cacheDir, `${stationId}_${date}.xml`);
    const cacheExpiry = 60 * 60 * 1000; // 1時間

    try {
      const stats = await stat(cachePath);
      // キャッシュが有効期限内の場合
      if (new Date().getTime() - stats.mtime.getTime() < cacheExpiry) {
        console.log("番組表データをキャッシュから使用します。");
        return await readFile(cachePath, "utf-8");
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      // キャッシュが見つからない場合は、そのまま処理を続行してRadikoから取得
    }

    console.log("番組表データをRadikoから取得します。");
    const url = `https://radiko.jp/v3/program/station/date/${date}/${stationId}.xml`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Radiko番組表の取得に失敗しました。");
    }
    const xmlData = await response.text();
    // 取得したXMLをキャッシュに保存
    await writeFile(cachePath, xmlData, "utf-8");
    return xmlData;
  }

  /**
   * 番組情報のXMLをパースして、`RadikoProgram`オブジェクトの配列に変換します。
   * @param xmlData 番組情報を含むXML文字列。
   * @returns パースされた`RadikoProgram`オブジェクトの配列。
   */
  public static parseRadikoProgramXml(xmlData: string): RadikoProgram[] {
    const parser = new XMLParser({
      ignoreAttributes: false, // ft, to, dur などの属性をパースするために必要
    });
    const jsonObj = parser.parse(xmlData);

    const stationId = jsonObj?.radiko?.stations?.station?.["@_id"] || "不明な放送局ID";
    const stationName = jsonObj?.radiko?.stations?.station?.name || "不明な放送局";

    const programNodes = jsonObj?.radiko?.stations?.station?.progs?.prog;

    if (!programNodes) return [];

    const programs = Array.isArray(programNodes) ? programNodes : [programNodes];

    return programs.map((p) => ({
      id: p["@_id"], // 番組ID
      title: p.title, // 番組名
      ft: p["@_ft"], // 開始時間
      to: p["@_to"], // 終了時間
      img: p.img, // 画像URL
      pfm: p.pfm, // パーソナリティ
      stationId: stationId, // 放送局ID
      stationName: stationName, // 放送局名
    }));
  }

  // --- 録音関連 ---

  /**
   * Radikoのタイムフリー番組を録音します。
   * **注意:** このメソッドを実行するには、システムに`ffmpeg`がインストールされている必要があります。
   * @param program 録音する番組情報 (`RadikoProgram`オブジェクト)。
   * @param stationId 放送局ID (例: "TBS")。
   * @param programTitle 番組名（ファイル名として使用）。
   * @param programImage 番組の画像URL。
   * @param startTime 録音開始時間 (形式: YYYYMMDDHHmmss)。
   * @param endTime 録音終了時間 (形式: YYYYMMDDHHmmss)。
   * @param saveDirectory ファイルを保存するディレクトリのパス。
   * @returns 録音されたファイルのフルパスを含む`Promise<string>`。
   * @throws 認証トークンが見つからない場合にエラーをスローします。
   */
  public async recordProgram(
    program: RadikoProgram, // new param
    stationId: string,
    programTitle: string,
    programImage: string | undefined,
    startTime: string,
    endTime: string,
    saveDirectory: string,
  ): Promise<string> {
    if (!this.authToken) {
      throw new Error("録音を開始できません。認証トークンが見つかりません。先に認証を行ってください。");
    }

    // ファイル名に使用できない文字をアンダースコアに置換
    const safeProgramTitle = programTitle.replace(/[/:*?"<>|]/g, "_");
    const filename = `${stationId}_${safeProgramTitle}_${startTime}.m4a`;
    const finalOutputPath = join(saveDirectory, filename);

    // 画像がない場合は、録音のみ実行して終了
    if (!programImage) {
      return this.executeRecording(stationId, startTime, endTime, finalOutputPath);
    }

    // 画像がある場合は、一時ファイルに録音
    const { tmpdir } = await import("os");
    const { writeFile, rm, rename } = await import("fs/promises");
    const tempAudioPath = join(tmpdir(), `radiko_temp_${Date.now()}.m4a`);

    await this.executeRecording(stationId, startTime, endTime, tempAudioPath);

    let tempImagePath: string | undefined;
    try {
      // 画像を一時ファイルにダウンロード
      const imageResponse = await fetch(programImage);
      if (!imageResponse.ok) {
        throw new Error(`カバー画像のダウンロードに失敗しました: ${imageResponse.statusText}`);
      }
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const tempImageExt = programImage.split(".").pop()?.split("?")[0] || "jpg";
      tempImagePath = join(tmpdir(), `radiko_cover_${Date.now()}.${tempImageExt}`);
      await writeFile(tempImagePath, imageBuffer);
      console.log(`カバー画像を一時ファイルに保存しました: ${tempImagePath}`);

      // カバー画像とメタデータを追加
      await this.addMetadata(
        tempAudioPath,
        finalOutputPath,
        programTitle,
        program.pfm, // artist
        program.stationName, // album
        tempImagePath,
      );

      return finalOutputPath;
    } catch (error) {
      console.error(
        `カバー画像またはメタデータの追加に失敗しました: ${error}。録音ファイルはメタデータなしで保存されます。`,
      );
      // メタデータの追加に失敗した場合は、一時音声ファイルを最終的なパスに移動する
      await rename(tempAudioPath, finalOutputPath);
      return finalOutputPath;
    } finally {
      // 一時ファイルをクリーンアップ
      await rm(tempAudioPath, { force: true });
      if (tempImagePath) {
        await rm(tempImagePath, { force: true });
      }
    }
  }

  /**
   * ffmpegを使用して録音を実行します。
   * @param stationId 放送局ID。
   * @param startTime 録音開始時間 (形式: YYYYMMDDHHmmss)。
   * @param endTime 録音終了時間 (形式: YYYYMMDDHHmmss)。
   * @param outputPath 出力ファイルのパス。
   * @returns 録音されたファイルのパスを含むPromise。
   * @throws 認証トークンが見つからない場合にエラーをスローします。
   */
  private executeRecording(stationId: string, startTime: string, endTime: string, outputPath: string): Promise<string> {
    if (!this.authToken) {
      return Promise.reject(new Error("認証トークンが見つかりません。"));
    }
    const url = `https://radiko.jp/v2/api/ts/playlist.m3u8?station_id=${stationId}&l=15&ft=${startTime}&to=${endTime}`;

    return new Promise<string>((resolve, reject) => {
      const args = [
        "-y", // 出力ファイルが既に存在する場合に上書きする
        "-fflags",
        "+discardcorrupt", // 破損したパケットを無視する
        "-headers",
        `X-Radiko-Authtoken: ${this.authToken}`,
        "-i",
        url,
        "-bsf:a",
        "aac_adtstoasc",
        "-acodec",
        "copy",
        outputPath,
      ];

      const ffmpeg = spawn(this.ffmpegPath, args);

      ffmpeg.stderr.on("data", (data) => {
        console.log(`ffmpeg: ${data}`);
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          console.log(`録音が完了しました: ${outputPath}`);
          resolve(outputPath);
        } else {
          reject(new Error(`ffmpegプロセスがエラーコード ${code} で終了しました。`));
        }
      });

      ffmpeg.on("error", (err) => {
        reject(new Error(`ffmpegプロセスの開始に失敗しました: ${err.message}`));
      });
    });
  }

  /**
   * 音声ファイルにメタデータとカバー画像を追加します。
   * **注意:** このメソッドを実行するには、システムに`ffmpeg`がインストールされている必要があります。
   * @param audioFilePath 入力音声ファイルのパス。
   * @param outputFilePath 出力音声ファイルのパス。 **`audioFilePath`とは異なるパスを指定してください。**
   * @param title 曲名。
   * @param artist アーティスト名。
   * @param album アルバム名。
   * @param imageFilePath (任意) カバー画像のパス。
   * @returns メタデータが追加された新しいファイルのパスを含む`Promise<string>`。
   * @throws 入力パスと出力パスが同じ場合にエラーをスローします。
   */
  public async addMetadata(
    audioFilePath: string,
    outputFilePath: string,
    title: string,
    artist: string,
    album: string,
    imageFilePath?: string,
  ): Promise<string> {
    if (audioFilePath === outputFilePath) {
      return Promise.reject(new Error("入力ファイルパスと出力ファイルパスを同じにすることはできません。"));
    }

    return new Promise<string>((resolve, reject) => {
      const args = [
        "-y", // 出力ファイルが既に存在する場合に上書きする
        "-i",
        audioFilePath,
      ];

      // 画像が指定されている場合は追加
      if (imageFilePath) {
        args.push("-i", imageFilePath, "-map", "0:a", "-map", "1:v", "-c", "copy", "-disposition:1", "attached_pic");
      }

      // メタデータを追加
      args.push(
        "-metadata",
        `title=${title}`,
        "-metadata",
        `artist=${artist}`,
        "-metadata",
        `album=${album}`,
        "-id3v2_version",
        "3",
        outputFilePath,
      );

      const ffmpeg = spawn(this.ffmpegPath, args);

      ffmpeg.stderr.on("data", (data) => {
        console.log(`ffmpeg: ${data}`);
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          console.log(`メタデータとカバー画像の追加に成功しました: ${outputFilePath}`);
          resolve(outputFilePath);
        } else {
          reject(new Error(`ffmpegプロセスがエラーコード ${code} で終了しました。`));
        }
      });

      ffmpeg.on("error", (err) => {
        reject(new Error(`ffmpegプロセスの開始に失敗しました: ${err.message}`));
      });
    });
  }
}
