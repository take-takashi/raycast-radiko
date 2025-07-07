
import {
  ActionPanel,
  Action,
  Color,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useState, useEffect } from "react";
import {
  RadikoProgram,
  getRadikoPrograms,
  parseRadikoProgramXml,
  Station,
  authenticate1,
  getAuthTokenFromAuthResponse,
  getPatialKeyFromAuthResponse,
  authenticate2,
  getRadikoStationList,
  parseStationListXml,
} from "./radiko-guide";

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

function getTodayDateString(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
}

export default function Command() {
  const [programsByStation, setProgramsByStation] = useState<Map<string, RadikoProgram[]>>(new Map());
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAllPrograms() {
      setIsLoading(true);
      try {
        const auth1Response = await authenticate1();
        const authToken = getAuthTokenFromAuthResponse(auth1Response);
        const partialKey = getPatialKeyFromAuthResponse(auth1Response);
        const areaCode = await authenticate2(authToken, partialKey);
        const stationXml = await getRadikoStationList(areaCode);
        const parsedStations = parseStationListXml(stationXml);
        setStations(parsedStations);

        if (parsedStations.length === 0) {
          await showToast({
            style: Toast.Style.Failure,
            title: "利用可能な放送局が見つかりませんでした",
          });
          return;
        }

        const today = getTodayDateString();
        const allProgramsPromises = parsedStations.map(async (station) => {
          const xmlData = await getRadikoPrograms(today, station.id);
          const programs = parseRadikoProgramXml(xmlData);
          return { stationId: station.id, stationName: station.name, programs };
        });

        const results = await Promise.all(allProgramsPromises);

        const programsMap = new Map<string, RadikoProgram[]>();
        results.forEach(result => {
            if(result.programs.length > 0) {
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
  }, []);

  const now = new Date();

  return (
    <List
      isLoading={isLoading}
      navigationTitle="今日の番組表 (全放送局)"
      searchBarPlaceholder="番組を検索..."
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
