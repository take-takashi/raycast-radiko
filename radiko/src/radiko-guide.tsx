import { ActionPanel, Action, Icon, List } from "@raycast/api";
import { writeFile } from "fs/promises";

const AUTH_KEY = "bcd151073c03b352e1ef2fd66c32209da9ca0afa";

// とりあえずサンプルの作成
export function sample(): string {
  return "hello, world!";
}

// STEP: 認証を済ませてエリアコードを取得
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

// STEP1: radikoの番組表を取得
export async function fetchRadikoGuide(): Promise<any> {
  const response = await fetch("https://radiko.jp/v2/api/program/station/area");
  if (!response.ok) {
    throw new Error("Failed to fetch radiko guide");
  }
  return response.json();
}

// STEP2: 番組表を加工

// STEP3: 番組表
