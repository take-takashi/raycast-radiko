import { writeFile } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { XMLParser } from "fast-xml-parser";

/**
 * 放送局情報を表すインターフェース。
 */
export interface Station {
  id: string;
  name: string;
}

export interface RadikoProgram {
  id: string; // 番組ID
  title: string; // 番組名
  ft: string; // 開始時間
  to: string; // 終了時間
  img: string; // 画像URL
  pfm: string; // パーソナリティ名
  stationId: string; // 放送局ID
  stationName: string; // 放送局名
}

export class RadikoClient {
  private static readonly AUTH_KEY = "bcd151073c03b352e1ef2fd66c32209da9ca0afa";
  private authToken: string | null = null;
  private areaCode: string | null = null;
  private ffmpegPath: string;

  constructor(ffmpegPath = "ffmpeg") {
    this.ffmpegPath = ffmpegPath;
  }

  // --- Authentication ---

  /**
   * Radikoの認証を実行し、認証トークンとエリアコードを取得してインスタンスに保存します。
   * @returns 認証トークンとエリアコードを含むオブジェクト。
   */
  public async authenticate(): Promise<{ authToken: string; areaCode: string }> {
    const auth1Response = await this.authenticate1();
    const authToken = this.getAuthTokenFromAuthResponse(auth1Response);
    const partialKey = this.getPartialKeyFromAuthResponse(auth1Response);
    const areaCode = await this.authenticate2(authToken, partialKey);

    this.authToken = authToken;
    this.areaCode = areaCode;

    return { authToken, areaCode };
  }

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
      throw new Error("Failed to authenticate with Radiko (auth1)");
    }

    return response;
  }

  private getAuthTokenFromAuthResponse(auth_response: Response): string {
    const authtoken = auth_response.headers.get("X-Radiko-AuthToken");
    if (!authtoken) {
      throw new Error("Auth token not found in response.");
    }
    return authtoken;
  }

  private getPartialKeyFromAuthResponse(auth_response: Response): string {
    const offsetHeader = auth_response.headers.get("X-Radiko-KeyOffset");
    const lengthHeader = auth_response.headers.get("X-Radiko-KeyLength");

    if (!offsetHeader || !lengthHeader) {
      throw new Error("Key offset or length not found in response.");
    }

    const offset = Number(offsetHeader);
    const length = Number(lengthHeader);

    const partialKeyBase = RadikoClient.AUTH_KEY.slice(offset, offset + length);
    return Buffer.from(partialKeyBase).toString("base64");
  }

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
      throw new Error("Failed to authenticate with Radiko (auth2)");
    }

    const body = await response.text();
    const areaCode = body.split(",")[0];
    return areaCode;
  }

  /**
   * APIレスポンスヘッダーをJSONファイルに保存します。デバッグ目的で使用します。
   * @param response - `fetch` APIから返される`Response`オブジェクト。
   * @param filename - 保存するファイル名。
   */
  public static async saveAuthHeaders(response: Response, filename = "response_headers.json"): Promise<void> {
    const headerObject: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headerObject[key] = value;
    });

    const json = JSON.stringify(headerObject, null, 2);
    await writeFile(filename, json, "utf8");
  }

  // --- Station & Program Info ---

  /**
   * 指定されたエリアのRadiko放送局リストを取得します。
   * @param areaCode - エリアコード (例: "JP13")。指定しない場合は認証時に取得したエリアコードを使用します。
   * @returns `Station`オブジェクトの配列。
   */
  public async getStationList(areaCode?: string): Promise<Station[]> {
    const code = areaCode || this.areaCode;
    if (!code) {
      throw new Error(
        "Area code not provided and not available from authentication. Please authenticate first or provide an area code.",
      );
    }
    const xmlData = await this.fetchStationListXml(code);
    return RadikoClient.parseStationListXml(xmlData);
  }

  private async fetchStationListXml(areaCode: string): Promise<string> {
    const response = await fetch(`https://radiko.jp/v2/station/list/${areaCode}.xml`);
    if (!response.ok) {
      throw new Error("Failed to fetch radiko station list");
    }
    return response.text();
  }

  /**
   * 放送局リストのXML文字列をパースし、Stationオブジェクトの配列に変換します。
   * @param xmlData - XML文字列。
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
   * @param stationId - 放送局ID。
   * @param date - 日付 (形式: YYYYMMDD)。
   * @returns `RadikoProgram`オブジェクトの配列。
   */
  public async getPrograms(stationId: string, date: string): Promise<RadikoProgram[]> {
    const xmlData = await this.fetchProgramsXml(stationId, date);
    return RadikoClient.parseRadikoProgramXml(xmlData);
  }

  private async fetchProgramsXml(stationId: string, date: string): Promise<string> {
    const url = `https://radiko.jp/v3/program/station/date/${date}/${stationId}.xml`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch radiko programs");
    }
    return response.text();
  }

  /**
   * 番組情報のXMLをパースして、Programオブジェクトの配列に変換します。
   * @param xmlData - 番組情報を含むXML文字列。
   * @returns パースされた`Program`オブジェクトの配列。
   */
  public static parseRadikoProgramXml(xmlData: string): RadikoProgram[] {
    const parser = new XMLParser({
      ignoreAttributes: false, // ft, to, dur などの属性をパースするために必要
    });
    const jsonObj = parser.parse(xmlData);

    const stationId = jsonObj?.radiko?.stations?.station?.["@_id"] || "Unknown Station ID";
    const stationName = jsonObj?.radiko?.stations?.station?.name || "Unknown Station";

    const programNodes = jsonObj?.radiko?.stations?.station?.progs?.prog;

    if (!programNodes) return [];

    const programs = Array.isArray(programNodes) ? programNodes : [programNodes];

    return programs.map((p) => ({
      id: p["@_id"], // 番組ID
      title: p.title,
      ft: p["@_ft"], // 開始時間
      to: p["@_to"], // 終了時間
      img: p.img, // 画像URL
      pfm: p.pfm, // パーソナリティ
      stationId: stationId, // 放送局ID
      stationName: stationName, // 放送局名
    }));
  }

  // --- Recording ---

  /**
   * Radikoのタイムフリー番組を録音します。
   * **注意:** このメソッドを実行するには、システムに`ffmpeg`がインストールされている必要があります。
   * @param stationId - 放送局ID (例: "TBS")。
   * @param programTitle - 番組名（ファイル名として使用）。
   * @param startTime - 録音開始時間 (形式: YYYYMMDDHHmmss)。
   * @param endTime - 録音終了時間 (形式: YYYYMMDDHHmmss)。
   * @param saveDirectory - ファイルを保存するディレクトリのパス。
   * @returns 録音されたファイルのフルパスを含む`Promise<string>`。
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
      throw new Error("Cannot record program. Authentication token not found. Please authenticate first.");
    }

    const safeProgramTitle = programTitle.replace(/[/:*?"<>|]/g, "_");
    const filename = `${stationId}_${safeProgramTitle}_${startTime}.m4a`;
    const finalOutputPath = join(saveDirectory, filename);

    // If no image, just record and return.
    if (!programImage) {
      return this.executeRecording(stationId, startTime, endTime, finalOutputPath);
    }

    // With image, record to a temporary file first.
    const { tmpdir } = await import("os");
    const { writeFile, rm, rename } = await import("fs/promises");
    const tempAudioPath = join(tmpdir(), `radiko_temp_${Date.now()}.m4a`);

    await this.executeRecording(stationId, startTime, endTime, tempAudioPath);

    let tempImagePath: string | undefined;
    try {
      // Download image to a temporary file
      const imageResponse = await fetch(programImage);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download cover image: ${imageResponse.statusText}`);
      }
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const tempImageExt = programImage.split(".").pop()?.split("?")[0] || "jpg";
      tempImagePath = join(tmpdir(), `radiko_cover_${Date.now()}.${tempImageExt}`);
      await writeFile(tempImagePath, imageBuffer);
      console.log(`Cover image downloaded to: ${tempImagePath}`);

      // Add cover image and metadata
      await this.addMetadata(
        tempAudioPath,
        finalOutputPath,
        programTitle,
        program.pfm, // artist
        program.title, // album
        tempImagePath,
      );

      return finalOutputPath;
    } catch (error) {
      console.error(`Failed to add cover image or metadata: {error}. The recording will be saved without them.`);
      // If adding metadata fails, move the temp audio file to the final destination.
      await rename(tempAudioPath, finalOutputPath);
      return finalOutputPath;
    } finally {
      // Cleanup all temporary files
      await rm(tempAudioPath, { force: true });
      if (tempImagePath) {
        await rm(tempImagePath, { force: true });
      }
    }
  }

  private executeRecording(stationId: string, startTime: string, endTime: string, outputPath: string): Promise<string> {
    if (!this.authToken) {
      return Promise.reject(new Error("Authentication token not found."));
    }
    const url = `https://radiko.jp/v2/api/ts/playlist.m3u8?station_id=${stationId}&l=15&ft=${startTime}&to=${endTime}`;

    return new Promise<string>((resolve, reject) => {
      const args = [
        "-y",
        "-fflags",
        "+discardcorrupt",
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
   * 音声ファイルにカバー画像を追加します。
   * **注意:** このメソッドを実行するには、システムに`ffmpeg`がインストールされている必要があります。
   * @param audioFilePath - カバー画像を追加する音声ファイルのパス。
   * @param imageFilePath - 追加するカバー画像のパス。
   * @param outputFilePath - 画像を追加した新しい音声ファイルの保存パス。**`audioFilePath`とは異なるパスを指定してください。**
   * @returns 新しいファイルのパスを含む`Promise<string>`。
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
      return Promise.reject(new Error("Input and output file paths cannot be the same."));
    }

    return new Promise<string>((resolve, reject) => {
      const args = [
        "-y", // Overwrite output file if it exists
        "-i",
        audioFilePath,
      ];

      // Add image if provided
      if (imageFilePath) {
        args.push("-i", imageFilePath, "-map", "0:a", "-map", "1:v", "-c", "copy", "-disposition:1", "attached_pic");
      }

      // Add metadata
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
          console.log(`Metadata and cover image added successfully: ${outputFilePath}`);
          resolve(outputFilePath);
        } else {
          reject(new Error(`ffmpeg process exited with code ${code}`));
        }
      });

      ffmpeg.on("error", (err) => {
        reject(new Error(`Failed to start ffmpeg process: ${err.message}`));
      });
    });
  }
}
