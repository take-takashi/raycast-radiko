import { ActionPanel, Action, Color, Icon, List, showToast, Toast } from "@raycast/api";
import { useState, useEffect } from "react";
import {
  getRadikoPrograms,
  parseRadikoProgramXml,
  RadikoProgram,
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

export default function Command() {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [programs, setPrograms] = useState<RadikoProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStations() {
      try {
        const auth1Response = await authenticate1();
        const authToken = getAuthTokenFromAuthResponse(auth1Response);
        const partialKey = getPatialKeyFromAuthResponse(auth1Response);
        const areaCode = await authenticate2(authToken, partialKey);
        const stationXml = await getRadikoStationList(areaCode);
        const parsedStations = parseStationListXml(stationXml);
        setStations(parsedStations);

        if (parsedStations.length > 0) {
          setSelectedStationId(parsedStations[0].id);
        } else {
          setIsLoading(false);
          await showToast({
            style: Toast.Style.Failure,
            title: "放送局リストの取得に失敗しました",
          });
        }
      } catch (error) {
        setIsLoading(false);
        await showToast({
          style: Toast.Style.Failure,
          title: "放送局の取得に失敗しました",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    fetchStations();
  }, []);

  useEffect(() => {
    if (!selectedStationId) {
      return;
    }

    // 型ガードで string 型に絞り込まれた値を新しい定数に代入する
    const stationIdForFetch = selectedStationId;

    async function fetchPrograms() {
      setIsLoading(true);
      try {
        const today = new Date();
        const date = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(
          today.getDate(),
        ).padStart(2, "0")}`;

        const xmlData = await getRadikoPrograms(date, stationIdForFetch);
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
  }, [selectedStationId]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="番組を検索..."
      searchBarAccessory={
        <List.Dropdown tooltip="放送局を選択" value={selectedStationId || ""} onChange={setSelectedStationId}>
          <List.Dropdown.Section title="放送局">
            {stations.map((station) => (
              <List.Dropdown.Item key={station.id} title={station.name} value={station.id} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {programs.map((program) => (
        <List.Item
          key={`${program.id}-${program.ft}`}
          icon={program.img}
          title={program.title}
          subtitle="" // subtitleを空にして、accessoriesの表示領域を確保します
          // パーソナリティ名をスペースや読点などで分割し、検索キーワードとして追加
          keywords={program.pfm ? program.pfm.split(/[、, ]+/) : []}
          accessories={[
            { text: program.pfm },
            // 時間表記を色付きのtagとして表示し、stationNameを削除
            // TODO: 放送終了してたらタグの色を変えたい
            {
              icon: Icon.Clock,
              tag: { value: `${formatTime(program.ft)}`, color: Color.SecondaryText },
            },
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
