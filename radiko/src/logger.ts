import { environment } from "@raycast/api";
import * as fs from "fs";
import * as path from "path";

enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG"
}

const LOG_FILE_NAME = "radiko-extension.log";
const LOG_FILE_PATH = path.join(environment.supportPath, LOG_FILE_NAME);
const LOG_RETENTION_DAYS = 7;

/**
 * ログファイルのローテーションを処理します。
 * 最終更新日時が指定された日数より古い場合、ログファイルを削除します。
 */
function rotateLogFile() {
  if (!fs.existsSync(LOG_FILE_PATH)) {
    return;
  }

  try {
    const stats = fs.statSync(LOG_FILE_PATH);
    const lastModified = new Date(stats.mtime);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastModified.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > LOG_RETENTION_DAYS) {
      fs.unlinkSync(LOG_FILE_PATH);
      log(LogLevel.INFO, "古いログファイルを削除しました。");
    }
  } catch (error) {
    // ここでのエラーはコンソールに出力するに留める
    console.error("ログファイルのローテーションに失敗しました:", error);
  }
}

/**
 * ログメッセージをフォーマットし、ファイルに追記します。
 * @param level - ログレベル (INFO, WARN, ERROR)
 * @param message - ログメッセージ
 * @param optionalParams - 追加のオブジェクトなど
 */
function log(level: LogLevel, message: string, ...optionalParams: unknown[]): void {
  try {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] ${message}`;

    const paramsString = optionalParams.length > 0 ? optionalParams.map((p) => JSON.stringify(p, null, 2)).join(" ") : "";

    const logEntry = `${formattedMessage}${paramsString ? `\n${paramsString}` : ""}\n`;

    fs.appendFileSync(LOG_FILE_PATH, logEntry, { encoding: "utf-8" });
  } catch (error) {
    // ログ書き込み自体のエラーはコンソールに出力
    console.error("ログの書き込みに失敗しました:", error);
  }
}

// モジュール初期化時にログローテーションを実行
rotateLogFile();

export const logger = {
  info: (message: string, ...optionalParams: unknown[]) => log(LogLevel.INFO, message, ...optionalParams),
  warn: (message: string, ...optionalParams: unknown[]) => log(LogLevel.WARN, message, ...optionalParams),
  error: (message: string, ...optionalParams: unknown[]) => log(LogLevel.ERROR, message, ...optionalParams),
  debug: (message: string, ...optionalParams: unknown[]) => log(LogLevel.DEBUG, message, ...optionalParams),
  getLogFilePath: () => LOG_FILE_PATH
};