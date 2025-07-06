import {
  ActionPanel,
  Action,
  Color,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
  getPreferenceValues,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { homedir } from "os";
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
  recordRadikoProgram,
} from "./radiko-guide";

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

/**
 * 日付選択用のオプションを表すインターフェース。
 */
interface DateOption {
  value: string; // YYYYMMDD
  label: string; // M月D日 (曜日)
}

/**
 * 今日から過去7日間の日付選択オプションを生成します。
 * @returns `DateOption`の配列。
 */
function generateDateOptions(): DateOption[] {
  const options: DateOption[] = [];
  const today = new Date();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    const value = `${year}${month}${day}`;
    const label = `${date.getMonth() + 1}月${date.getDate()}日 (${weekdays[date.getDay()]})`;

    options.push({ value, label });
  }
  return options;
}

/**
 * 特定の放送局の番組表を表示するコンポーネント。
 * @param props - stationIdを含むプロパティ。
 */
function ProgramList(props: { stationId: string; date: string; authToken: string }) {
  const { stationId, date: initialDate, authToken } = props;
  const [dates, setDates] = useState<DateOption[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [programs, setPrograms] = useState<RadikoProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const dateOptions = generateDateOptions();
    setDates(dateOptions);
    if (!dateOptions.some((d) => d.value === initialDate)) {
      setSelectedDate(dateOptions[0].value);
    }
  }, []);

  useEffect(() => {
    if (!stationId || !selectedDate) {
      return;
    }

    async function fetchPrograms() {
      setIsLoading(true);
      try {
        const xmlData = await getRadikoPrograms(selectedDate, stationId);
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
  }, [stationId, selectedDate]);

  const now = new Date();

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`${stationId} の番組表`}
      searchBarPlaceholder="番組を検索..."
      searchBarAccessory={
        <List.Dropdown tooltip="日付を選択" value={selectedDate} onChange={setSelectedDate}>
          <List.Dropdown.Section title="日付">
            {dates.map((date) => (
              <List.Dropdown.Item key={date.value} title={date.label} value={date.value} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {programs.map((program) => {
        const programEndTime = parseRadikoDateTime(program.to);
        const isFinished = now > programEndTime;
        const tagColor = isFinished ? Color.Green : Color.SecondaryText;

        return (
          <List.Item
            key={`${program.id}-${program.ft}`}
            icon={program.img}
            title={program.title}
            subtitle=""
            keywords={program.pfm ? program.pfm.split(/[、, ]+/) : []}
            accessories={[
              { text: program.pfm },
              {
                icon: Icon.Clock,
                tag: { value: formatTime(program.ft), color: tagColor },
              },
            ]}
            actions={
              <ActionPanel>
                {isFinished && (
                  <Action
                    title="この番組を録音する"
                    icon={Icon.Download}
                    onAction={async () => {
                      const toast = await showToast({
                        style: Toast.Style.Animated,
                        title: "録音を開始しています...",
                      });
                      try {
                        const preferences = getPreferenceValues<Preferences>();
                        let saveDirectory = preferences.saveDirectory;
                        if (saveDirectory.startsWith("~")) {
                          saveDirectory = saveDirectory.replace("~", homedir());
                        }

                        const outputPath = await recordRadikoProgram(
                          authToken,
                          program.stationId,
                          program.title,
                          program.ft,
                          program.to,
                          saveDirectory,
                          preferences.ffmpegPath,
                        );
                        toast.style = Toast.Style.Success;
                        toast.title = `「${program.title}」の録音が完了しました`;
                        toast.message = `保存先: ${outputPath}`;
                      } catch (error) {
                        toast.style = Toast.Style.Failure;
                        toast.title = "録音に失敗しました";
                        toast.message = error instanceof Error ? error.message : String(error);
                      }
                    }}
                  />
                )}
                <Action.CopyToClipboard title="番組名をコピー" content={program.title} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

interface FormValues {
  stationId: string;
  date: string;
}

export default function Command() {
  const { push } = useNavigation();
  const [stations, setStations] = useState<Station[]>([]);
  const [dates, setDates] = useState<DateOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authToken, setAuthToken] = useState<string>("");

  useEffect(() => {
    async function fetchInitialData() {
      try {
        const dateOptions = generateDateOptions();
        setDates(dateOptions);

        const auth1Response = await authenticate1();
        const authToken = getAuthTokenFromAuthResponse(auth1Response);
        setAuthToken(authToken);
        const partialKey = getPatialKeyFromAuthResponse(auth1Response);
        const areaCode = await authenticate2(authToken, partialKey);
        const stationXml = await getRadikoStationList(areaCode);
        const parsedStations = parseStationListXml(stationXml);

        if (parsedStations.length === 0) {
          await showToast({
            style: Toast.Style.Failure,
            title: "利用可能な放送局が見つかりませんでした",
          });
        }

        setStations(parsedStations);
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "初期データの取得に失敗しました",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchInitialData();
  }, []);

  function handleSubmit(values: FormValues) {
    if (!values.stationId || !values.date) {
      showToast({ style: Toast.Style.Failure, title: "放送局と日付を選択してください" });
      return;
    }
    push(<ProgramList stationId={values.stationId} date={values.date} authToken={authToken} />);
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="番組表を見る" icon={Icon.List} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="stationId" title="放送局">
        {stations.map((station) => (
          <Form.Dropdown.Item key={station.id} value={station.id} title={station.name} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="date" title="日付">
        {dates.map((date) => (
          <Form.Dropdown.Item key={date.value} value={date.value} title={date.label} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

// TODO: 局選択はリスト+検索バーの日付選択から、次の画面で番組表の表示+検索バーの日付選択にできるか？
