import { ActionPanel, Action, Color, Icon, List, showToast, Toast, getPreferenceValues } from "@raycast/api";
import { useState, useEffect } from "react";
import { homedir } from "os";
import { RadikoProgram, RadikoClient } from "./radiko-client";

interface Preferences {
  saveDirectory: string;
  ffmpegPath: string;
}

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

/**
 * YYYYMMDDHHmmss形式の文字列をDateオブジェクトに変換します。
 * @param dateTimeString - Radiko APIから取得した時刻文字列
 * @returns Dateオブジェクト
 */
function parseRadikoDateTime(dateTimeString: string): Date {
  const year = parseInt(dateTimeString.substring(0, 4), 10);
  const month = parseInt(dateTimeString.substring(4, 6), 10) - 1; // 月は0から始まるため-1する
  const day = parseInt(dateTimeString.substring(6, 8), 10);
  const hour = parseInt(dateTimeString.substring(8, 10), 10);
  const minute = parseInt(dateTimeString.substring(10, 12), 10);
  const second = parseInt(dateTimeString.substring(12, 14), 10);
  return new Date(year, month, day, hour, minute, second);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getPastSevenDays(): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    dates.push(date);
  }
  return dates;
}

export default function Command() {
  const [programsByStation, setProgramsByStation] = useState<Map<string, RadikoProgram[]>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(new Date()));
  const [radikoClient, setRadikoClient] = useState<RadikoClient | null>(null);

  const sevenDays = getPastSevenDays();

  useEffect(() => {
    async function fetchAllPrograms() {
      setIsLoading(true);
      try {
        const preferences = getPreferenceValues<Preferences>();
        const client = new RadikoClient(preferences.ffmpegPath);
        await client.authenticate();
        setRadikoClient(client);

        const parsedStations = await client.getStationList();

        if (parsedStations.length === 0) {
          await showToast({
            style: Toast.Style.Failure,
            title: "利用可能な放送局が見つかりませんでした",
          });
          return;
        }

        const allProgramsPromises = parsedStations.map(async (station) => {
          const programs = await client.getPrograms(station.id, selectedDate);
          return { stationId: station.id, stationName: station.name, programs };
        });

        const results = await Promise.all(allProgramsPromises);

        const programsMap = new Map<string, RadikoProgram[]>();
        results.forEach((result) => {
          if (result.programs.length > 0) {
            programsMap.set(result.stationName, result.programs);
          }
        });

        setProgramsByStation(programsMap);
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

    fetchAllPrograms();
  }, [selectedDate]);

  async function handleRecord(program: RadikoProgram) {
    if (!radikoClient) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Radikoクライアントが初期化されていません",
        message: "番組表を再読み込みしてください。",
      });
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "録音を開始します...",
      message: `${program.title}`,
    });

    try {
      const preferences = getPreferenceValues<Preferences>();
      let saveDirectory = preferences.saveDirectory;
      if (saveDirectory.startsWith("~")) {
        saveDirectory = saveDirectory.replace("~", homedir());
      }

      const outputPath = await radikoClient.recordProgram(
        program,
        program.stationId,
        program.title,
        program.img, // new param
        program.ft,
        program.to,
        saveDirectory,
      );

      toast.style = Toast.Style.Success;
      toast.title = "録音が完了しました";
      toast.message = `ファイル: ${outputPath}`;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "録音に失敗しました";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  const now = new Date();

  const navigationTitle = () => {
    const today = formatDate(new Date());
    if (selectedDate === today) {
      return "今日の番組表 (全放送局)";
    }
    const year = parseInt(selectedDate.substring(0, 4), 10);
    const month = parseInt(selectedDate.substring(4, 6), 10) - 1;
    const day = parseInt(selectedDate.substring(6, 8), 10);
    const date = new Date(year, month, day);
    const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
    return `${date.getMonth() + 1}/${date.getDate()}(${dayOfWeek})の番組表 (全放送局)`;
  };

  return (
    <List
      isLoading={isLoading}
      navigationTitle={navigationTitle()}
      searchBarPlaceholder="番組を検索..."
      searchBarAccessory={
        <List.Dropdown tooltip="日付を選択" value={selectedDate} onChange={(newValue) => setSelectedDate(newValue)}>
          {sevenDays.map((date, index) => {
            const dateString = formatDate(date);
            const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
            const isToday = formatDate(new Date()) === dateString;
            const label = isToday
              ? `今日 ${date.getMonth() + 1}/${date.getDate()}(${dayOfWeek})`
              : `${date.getMonth() + 1}/${date.getDate()}(${dayOfWeek})`;
            return <List.Dropdown.Item key={index} title={label} value={dateString} />;
          })}
        </List.Dropdown>
      }
    >
      {Array.from(programsByStation.entries()).map(([stationName, programs]) => (
        <List.Section key={stationName} title={stationName}>
          {programs.map((program) => {
            const programEndTime = parseRadikoDateTime(program.to);
            const isFinished = now > programEndTime;
            const tagColor = isFinished ? Color.Green : Color.SecondaryText;

            return (
              <List.Item
                key={`${program.id}-${program.ft}`}
                icon={program.img}
                title={program.title}
                subtitle={program.pfm}
                accessories={[
                  {
                    icon: Icon.Clock,
                    tag: { value: `${formatTime(program.ft)} - ${formatTime(program.to)}`, color: tagColor },
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action title="この番組を録音する" icon={Icon.Download} onAction={() => handleRecord(program)} />
                    <Action.CopyToClipboard title="番組名をコピー" content={program.title} />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ))}
    </List>
  );
}
