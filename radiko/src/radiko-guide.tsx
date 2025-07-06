import { ActionPanel, Action, Icon, List } from "@raycast/api";
import { writeFile } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { XMLParser } from "fast-xml-parser";

// TODO: ファイル名を変えたい（というクラス化したい）

const AUTH_KEY = "bcd151073c03b352e1ef2fd66c32209da9ca0afa";

export async function authenticate1(): Promise<Response> {
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
    throw new Error("Failed to authenticate with Radiko");
  }

  return response;
}

/**
 * APIレスポンスヘッダーをJSONファイルに保存します。
 *
 * この関数はデバッグや後続のリクエストのために認証情報を永続化する目的で使用できます。
 * ファイル名は `response_headers.json` にハードコードされています。
 *
 * @param response - `fetch` APIから返される`Response`オブジェクト。このオブジェクトのヘッダーがファイルに書き込まれます。
 * @returns ファイル書き込み操作が完了したときに解決される`Promise<void>`。
 */
export async function saveAuthHeaders(response: Response): Promise<void> {
  const headerObject: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headerObject[key] = value;
  });

  const json = JSON.stringify(headerObject, null, 2);
  await writeFile("response_headers.json", json, "utf8");
}

export function getAuthTokenFromAuthResponse(auth_response: Response): string {
  const authtoken = auth_response.headers.get("X-Radiko-AuthToken");
  return authtoken || "";
}

export function getPatialKeyFromAuthResponse(auth_response: Response): string {
  const offset = Number(auth_response.headers.get("X-Radiko-KeyOffset"));
  const length = Number(auth_response.headers.get("X-Radiko-KeyLength"));

  const partialKeyBase = AUTH_KEY.slice(offset, offset + length);
  const partialKey = Buffer.from(partialKeyBase).toString("base64");

  return partialKey;
}

/**
 * Radikoの認証プロセス（ステップ2）を実行します。
 *
 * この関数は、認証ステップ1で取得した認証トークンと部分キーを使用して、
 * Radikoのauth2 APIにリクエストを送信します。成功すると、ユーザーのエリアコードが返されます。
 *
 * @param auth_token - 認証ステップ1（`authenticate1`）で取得した認証トークン。
 * @param partial_key - 認証ステップ1のレスポンスヘッダーから生成された部分キー。
 * @returns ユーザーのエリアコード（例: "JP13"）を含むPromise<string>。
 * @throws 認証リクエストが失敗した場合にエラーをスローします。
 */
export async function authenticate2(auth_token: string, partial_key: string): Promise<string> {
  const url = "https://radiko.jp/v2/api/auth2";
  const headers = {
    "User-Agent": "curl/7.56.1",
    Accept: "*/*",
    "X-Radiko-App": "pc_html5",
    "X-Radiko-App-Version": "0.0.1",
    "X-Radiko-User": "dummy_user",
    "X-Radiko-Device": "pc",
    "X-Radiko-AuthToken": auth_token,
    "X-Radiko-PartialKey": partial_key,
  };

  const response = await fetch(url, {
    method: "GET",
    headers: headers,
  });

  if (!response.ok) {
    throw new Error("Failed to authenticate2 with Radiko");
  }

  // 以下のような中身が入っている
  // JP13,東京都,tokyo Japan
  const body = await response.text();

  // エリアコードのみに絞る
  const areaCode = body.split(",")[0];

  return areaCode;
}

/**
 * 指定されたエリアのRadiko放送局リスト（XML）を取得します。
 * @param areaCode - エリアコード (例: "JP13")。
 * @returns 放送局リストのXML文字列を含むPromise<string>。
 * @throws 放送局リストの取得に失敗した場合にエラーをスローします。
 */
export async function getRadikoStationList(areaCode: string): Promise<string> {
  const response = await fetch(`https://radiko.jp/v2/station/list/${areaCode}.xml`);
  if (!response.ok) {
    throw new Error("Failed to fetch radiko guide");
  }

  // XMLでラジオ局一覧が返ってくるので、テキストで読めるようにする
  const xmlText = await response.text();

  return xmlText;
}

/**
 * 放送局情報を表すインターフェース。
 */
export interface Station {
  id: string;
  name: string;
}

/**
 * 放送局リストのXML文字列をパースし、Stationオブジェクトの配列に変換します。
 * @param xmlData - `getRadikoStationList`から取得したXML文字列。
 * @returns パースされた`Station`オブジェクトの配列。
 */
export function parseStationListXml(xmlData: string): Station[] {
  const parser = new XMLParser();
  const jsonObj = parser.parse(xmlData);

  const stationsArray = jsonObj.stations.station;

  return stationsArray.map((s: { id: string; name: string }) => ({
    id: s.id,
    name: s.name,
  }));
}

export async function getRadikoPrograms(date: string, stationId: string): Promise<string> {
  const url = `https://radiko.jp/v3/program/station/date/${date}/${stationId}.xml`;

  const response = await fetch(url, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch radiko programs");
  }

  return await response.text();
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

/**
 * 番組情報のXMLをパースして、Programオブジェクトの配列に変換します。
 * @param xmlData - 番組情報を含むXML文字列。
 * @returns パースされた`Program`オブジェクトの配列。
 */
export function parseRadikoProgramXml(xmlData: string): RadikoProgram[] {
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

/**
 * Radikoのタイムフリー番組を録音します。
 *
 * この関数は、指定された放送局と時間に基づき、ffmpegを使用して番組をm4aファイルとして保存します。
 * **注意:** この関数を実行するには、システムに`ffmpeg`がインストールされている必要があります。
 *
 * @param auth_token - 認証トークン。
 * @param station_id - 放送局ID (例: "TBS")。
 * @param start_time - 録音開始時間 (形式: YYYYMMDDHHmmss)。
 * @param end_time - 録音終了時間 (形式: YYYYMMDDHHmmss)。
 * @param save_directory - ファイルを保存するディレクトリのパス。
 * @returns 録音されたファイルのフルパスを含む`Promise<string>`。
 * @throws ffmpegプロセスの実行に失敗した場合、または0以外のコードで終了した場合にエラーをスローします。
 */
export async function recordRadikoProgram(
  auth_token: string,
  station_id: string,
  start_time: string,
  end_time: string,
  save_directory: string,
  ffmpeg_path: string,
): Promise<string> {
  const url = `https://radiko.jp/v2/api/ts/playlist.m3u8?station_id=${station_id}&l=15&ft=${start_time}&to=${end_time}`;

  return new Promise<string>((resolve, reject) => {
    const filename = `${station_id}_${start_time}.m4a`;
    const outputPath = join(save_directory, filename);
    const ffmpegCommand = ffmpeg_path || "ffmpeg";
    const args = [
      // "-loglevel",
      // "error",
      "-fflags",
      "+discardcorrupt",
      "-headers",
      `X-Radiko-Authtoken: ${auth_token}`,
      "-i",
      url,
      "-bsf:a",
      "aac_adtstoasc",
      "-acodec",
      "copy",
      outputPath,
    ];

    const ffmpeg = spawn(ffmpegCommand, args);

    ffmpeg.stderr.on("data", (data) => {
      // ffmpegは進捗をstderrに出力することが多いため、ここではエラーとして扱わずログ出力に留めます。
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
