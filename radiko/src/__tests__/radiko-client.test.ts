import { RadikoClient, Station, RadikoProgram } from "../radiko-client";
import { promises as fs } from "fs";
import path from "path";

// jest.mock("node-fetch");
// const fetch = require("node-fetch");

describe("RadikoClient", () => {
  let stationXmlData: string;
  let programXmlData: string;
  let client: RadikoClient;

  beforeAll(async () => {
    stationXmlData = await fs.readFile(path.join(__dirname, "radiko_station_list.xml"), "utf-8");
    programXmlData = await fs.readFile(path.join(__dirname, "radiko_program_tbs.xml"), "utf-8");
  });

  beforeEach(() => {
    client = new RadikoClient();
    // 各テストの前にモックをリセット
    jest.restoreAllMocks();
  });

  describe("parseStationListXml", () => {
    it("放送局リストのXMLを正しくパースできること", () => {
      const stations: Station[] = RadikoClient.parseStationListXml(stationXmlData);
      expect(stations).toBeInstanceOf(Array);
      expect(stations.length).toBeGreaterThan(0);
      expect(stations[0]).toHaveProperty("id");
      expect(stations[0]).toHaveProperty("name");
      expect(stations[0].id).toBe("TBS");
      expect(stations[0].name).toBe("TBSラジオ");
    });
  });

  describe("parseRadikoProgramXml", () => {
    it("番組情報のXMLを正しくパースできること", () => {
      const programs: RadikoProgram[] = RadikoClient.parseRadikoProgramXml(programXmlData);
      expect(programs).toBeInstanceOf(Array);
      expect(programs.length).toBeGreaterThan(0);
      const program = programs[0];
      expect(program).toHaveProperty("id");
      expect(program).toHaveProperty("title");
      expect(program).toHaveProperty("ft");
      expect(program).toHaveProperty("to");
      expect(program).toHaveProperty("img");
      expect(program).toHaveProperty("pfm");
      expect(program).toHaveProperty("stationId");
      expect(program).toHaveProperty("stationName");
      expect(program.stationId).toBe("TBS");
      expect(program.stationName).toBe("TBSラジオ");
    });
  });

  describe("authenticate", () => {
    it("認証に成功し、トークンとエリアコードが設定されること", async () => {
      // auth1とauth2の両方のfetchをモックする
      const mockAuth1Response = {
        ok: true,
        headers: new Map([
          ["X-Radiko-AuthToken", "test-auth-token"],
          ["X-Radiko-KeyOffset", "4"],
          ["X-Radiko-KeyLength", "12"],
        ]),
      };
      const mockAuth2Response = {
        ok: true,
        text: () => Promise.resolve("JP13,tokyo"),
      };

      const fetchSpy = jest
        .spyOn(global, "fetch")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce(mockAuth1Response as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValueOnce(mockAuth2Response as any);

      const result = await client.authenticate();

      expect(result.authToken).toBe("test-auth-token");
      expect(result.areaCode).toBe("JP13");
      // @ts-expect-error privateプロパティをテスト
      expect(client.authToken).toBe("test-auth-token");
      // @ts-expect-error privateプロパティをテスト
      expect(client.areaCode).toBe("JP13");

      // fetchが正しく呼び出されたか確認
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][0]).toBe("https://radiko.jp/v2/api/auth1");
      expect(fetchSpy.mock.calls[1][0]).toBe("https://radiko.jp/v2/api/auth2");
    });

    it("auth1に失敗した場合、エラーがスローされること", async () => {
      const mockAuth1Response = { ok: false };
      jest.spyOn(global, "fetch").mockResolvedValueOnce(mockAuth1Response as Response);

      await expect(client.authenticate()).rejects.toThrow("Radikoの認証(auth1)に失敗しました。");
    });

    it("auth2に失敗した場合、エラーがスローされること", async () => {
      const mockAuth1Response = {
        ok: true,
        headers: new Map([
          ["X-Radiko-AuthToken", "test-auth-token"],
          ["X-Radiko-KeyOffset", "4"],
          ["X-Radiko-KeyLength", "12"],
        ]),
      };
      const mockAuth2Response = { ok: false };

      jest
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(mockAuth1Response as Response)
        .mockResolvedValueOnce(mockAuth2Response as Response);

      await expect(client.authenticate()).rejects.toThrow("Radikoの認証(auth2)に失敗しました。");
    });
  });

  describe("getPrograms", () => {
    const stationId = "TBS";
    const date = "20230101";

    it("キャッシュが存在しない場合、ネットワークから取得すること", async () => {
      // 1. fs.statをモックしてエラーを発生させる（ファイルが見つからない）
      jest.spyOn(fs, "stat").mockRejectedValue(new Error("File not found"));

      // 2. fetchをモックして番組XMLを返す
      const mockFetchResponse = {
        ok: true,
        text: () => Promise.resolve(programXmlData),
      };
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce(mockFetchResponse as Response);

      // 3. fs.writeFileをモックして呼び出されるか確認する
      const writeFileSpy = jest.spyOn(fs, "writeFile").mockResolvedValue(undefined);

      // 4. メソッドを呼び出す
      const programs = await client.getPrograms(stationId, date);

      // 5. アサーション
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      expect(programs.length).toBeGreaterThan(0);
      expect(programs[0].stationId).toBe("TBS");
    });

    it("キャッシュが有効な場合、キャッシュを使用すること", async () => {
      // 1. fs.statをモックして最近のmtimeを返す
      const recentMtime = new Date();
      jest.spyOn(fs, "stat").mockResolvedValue({ mtime: recentMtime } as fs.Stats);

      // 2. fs.readFileをモックしてキャッシュされたデータを返す
      jest.spyOn(fs, "readFile").mockResolvedValue(programXmlData);

      // 3. fetchをスパイして呼び出されないことを確認する
      const fetchSpy = jest.spyOn(global, "fetch");

      // 4. メソッドを呼び出す
      const programs = await client.getPrograms(stationId, date);

      // 5. アサーション
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(programs.length).toBeGreaterThan(0);
      expect(programs[0].stationName).toBe("TBSラジオ");
    });

    it("キャッシュの有効期限が切れている場合、ネットワークから取得すること", async () => {
      // 1. fs.statをモックして古いmtimeを返す
      const oldMtime = new Date(new Date().getTime() - 2 * 60 * 60 * 1000); // 2時間前
      jest.spyOn(fs, "stat").mockResolvedValue({ mtime: oldMtime } as fs.Stats);

      // 2. fetchをモックして新しい番組XMLを返す
      const newProgramXmlData = programXmlData.replace("TBSラジオ", "TBSラジオ(New)");
      const mockFetchResponse = {
        ok: true,
        text: () => Promise.resolve(newProgramXmlData),
      };
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce(mockFetchResponse as Response);

      // 3. fs.writeFileをモックする
      const writeFileSpy = jest.spyOn(fs, "writeFile").mockResolvedValue(undefined);

      // 4. メソッドを呼び出す
      const programs = await client.getPrograms(stationId, date);

      // 5. アサーション
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      expect(programs[0].stationName).toBe("TBSラジオ(New)");
    });

    it("fetchに失敗し、キャッシュも存在しない場合、エラーがスローされること", async () => {
      // 1. fs.statをモックしてエラーを発生させる
      jest.spyOn(fs, "stat").mockRejectedValue(new Error("File not found"));

      // 2. fetchを失敗させる
      const mockFetchResponse = { ok: false };
      jest.spyOn(global, "fetch").mockResolvedValueOnce(mockFetchResponse as Response);

      // 3. エラーがスローされることを表明する
      await expect(client.getPrograms(stationId, date)).rejects.toThrow("Radiko番組表の取得に失敗しました。");
    });
  });
});
("")