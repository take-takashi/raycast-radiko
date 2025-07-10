import { formatTime, parseRadikoDateTime, formatDate, getPastSevenDays } from "../utils";

describe("utils", () => {
  describe("formatTime", () => {
    it("YYYYMMDDHHmmss形式の文字列をHH:mm形式に正しく変換できること", () => {
      expect(formatTime("20230101130500")).toBe("13:05");
    });

    it("空の文字列や不正な形式の文字列の場合は空文字を返すこと", () => {
      expect(formatTime("")).toBe("");
      expect(formatTime("20230101")).toBe("");
    });
  });

  describe("parseRadikoDateTime", () => {
    it("YYYYMMDDHHmmss形式の文字列をDateオブジェクトに正しく変換できること", () => {
      const date = parseRadikoDateTime("20231026133000");
      expect(date.getFullYear()).toBe(2023);
      expect(date.getMonth()).toBe(9); // 0-indexed
      expect(date.getDate()).toBe(26);
      expect(date.getHours()).toBe(13);
      expect(date.getMinutes()).toBe(30);
      expect(date.getSeconds()).toBe(0);
    });
  });

  describe("formatDate", () => {
    it("DateオブジェクトをYYYYMMDD形式の文字列に正しく変換できること", () => {
      const date = new Date(2023, 9, 26); // Month is 0-indexed
      expect(formatDate(date)).toBe("20231026");
    });
  });

  describe("getPastSevenDays", () => {
    it("今日を含む過去7日間のDateオブジェクトの配列を返すこと", () => {
      const mockDate = new Date(2023, 9, 26, 12, 0, 0);
      const OriginalDate = global.Date;
      jest.spyOn(global, "Date").mockImplementation((arg) => {
        if (arg) {
          return new OriginalDate(arg);
        }
        return mockDate;
      });

      const dates = getPastSevenDays();
      expect(dates.length).toBe(7);
      expect(formatDate(dates[0])).toBe("20231020"); // 6 days ago
      expect(formatDate(dates[6])).toBe("20231026"); // today

      jest.restoreAllMocks();
    });
  });
});
