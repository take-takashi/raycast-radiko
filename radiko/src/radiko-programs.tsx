import { ActionPanel, Action, List, showToast, Toast } from "@raycast/api";
import { useState, useEffect } from "react";
import { getRadikoPrograms, parseRadikoProgramXml, RadikoProgram } from "./radiko-guide";

/**
 * YYYYMMDDHHmmss形式の時刻文字列から HH:mm 形式の文字列を返します。
 * @param dateTimeString - Radiko APIから取得した時刻文字列
 * @returns フォーマットされた時刻文字列 (例: "13:00")
 */
function formatTime(dateTimeString: string): string {
  if (dateTimeString.length !== 14) return "";
  const hour = dateTimeString.substring(8, 10);
  const minute = dateTimeString.substring(10, 12);
  return `${hour}:${minute}`;
}

export default function Command() {
  const [programs, setPrograms] = useState<RadikoProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPrograms() {
      try {
        // 今日の日付をYYYYMMDD形式で取得
        const today = new Date();
        const date = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(
          today.getDate(),
        ).padStart(2, "0")}`;

        // TODO: 放送局を選択できるようにする
        const stationId = "TBS";

        const xmlData = await getRadikoPrograms(date, stationId);
        const parsedPrograms = parseRadikoProgramXml(xmlData);
        setPrograms(parsedPrograms);
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "番組表の取得に失敗しました",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchPrograms();
  }, []);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="番組を検索...">
      {programs.map((program) => (
        <List.Item
          key={program.id}
          icon={program.img}
          title={program.title}
          subtitle={program.pfm}
          accessories={[
            { text: `${formatTime(program.ft)} - ${formatTime(program.to)}` },
            { tag: program.stationName },
          ]}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="番組名をコピー" content={program.title} />
              {/* TODO: 録音アクションなどをここに追加 */}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
