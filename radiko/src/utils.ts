/**
 * YYYYMMDDHHmmss形式の時刻文字列から HH:mm 形式の文字列を返します。
 * @param dateTimeString - Radiko APIから取得した時刻文字列
 * @returns フォーマットされた時刻文字列 (例: "13:00")
 */
export function formatTime(dateTimeString: string): string {
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
export function parseRadikoDateTime(dateTimeString: string): Date {
  const year = parseInt(dateTimeString.substring(0, 4), 10);
  const month = parseInt(dateTimeString.substring(4, 6), 10) - 1; // 月は0から始まるため-1する
  const day = parseInt(dateTimeString.substring(6, 8), 10);
  const hour = parseInt(dateTimeString.substring(8, 10), 10);
  const minute = parseInt(dateTimeString.substring(10, 12), 10);
  const second = parseInt(dateTimeString.substring(12, 14), 10);
  return new Date(year, month, day, hour, minute, second);
}

/**
 * DateオブジェクトをYYYYMMDD形式の文字列に変換します。
 * @param date - 変換するDateオブジェクト
 * @returns YYYYMMDD形式の文字列
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * 今日を含む過去7日間のDateオブジェクトの配列を返します。
 * @returns Dateオブジェクトの配列
 */
export function getPastSevenDays(): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    dates.push(date);
  }
  return dates;
}
