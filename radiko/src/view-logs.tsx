import { Detail, ActionPanel, Action, showToast, Toast } from "@raycast/api";
import { useState, useEffect } from "react";
import { readFile } from "fs/promises";
import { logger } from "./logger";

export default function Command() {
  const [logContent, setLogContent] = useState<string>("ログを読み込み中...");
  const logFilePath = logger.getLogFilePath();

  useEffect(() => {
    async function loadLog() {
      try {
        const content = await readFile(logFilePath, "utf-8");
        setLogContent(content);
      } catch (error) {
        const errorMessage = `ログファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`;
        setLogContent(errorMessage);
        await showToast({
          style: Toast.Style.Failure,
          title: "ログ読み込みエラー",
          message: errorMessage,
        });
        logger.error("ログファイルの読み込みに失敗しました", error);
      }
    }
    loadLog();
  }, []);

  return (
    <Detail
      markdown={`\`\`\`\n${logContent}\n\`\`\``}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="ログをコピー" content={logContent} />
          <Action.OpenInBrowser title="ログファイルをFinderで開く" url={`file://${logFilePath}`} />
        </ActionPanel>
      }
    />
  );
}
