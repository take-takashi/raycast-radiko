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
    // Reset mocks before each test
    jest.restoreAllMocks();
  });

  describe("parseStationListXml", () => {
    it("should parse station list XML correctly", () => {
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
    it("should parse program XML correctly", () => {
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
    it("should authenticate successfully and set token and area code", async () => {
      // Mocking fetch for both auth1 and auth2
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
      // @ts-expect-error test private property
      expect(client.authToken).toBe("test-auth-token");
      // @ts-expect-error test private property
      expect(client.areaCode).toBe("JP13");

      // Check if fetch was called correctly
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][0]).toBe("https://radiko.jp/v2/api/auth1");
      expect(fetchSpy.mock.calls[1][0]).toBe("https://radiko.jp/v2/api/auth2");
    });

    it("should throw an error if auth1 fails", async () => {
      const mockAuth1Response = { ok: false };
      jest.spyOn(global, "fetch").mockResolvedValueOnce(mockAuth1Response as Response);

      await expect(client.authenticate()).rejects.toThrow("Radikoの認証(auth1)に失敗しました。");
    });

    it("should throw an error if auth2 fails", async () => {
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

    it("should fetch from network if cache does not exist", async () => {
      // 1. Mock fs.stat to throw an error (file not found)
      jest.spyOn(fs, "stat").mockRejectedValue(new Error("File not found"));

      // 2. Mock fetch to return program XML
      const mockFetchResponse = {
        ok: true,
        text: () => Promise.resolve(programXmlData),
      };
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce(mockFetchResponse as Response);

      // 3. Mock fs.writeFile to check if it's called
      const writeFileSpy = jest.spyOn(fs, "writeFile").mockResolvedValue(undefined);

      // 4. Call the method
      const programs = await client.getPrograms(stationId, date);

      // 5. Assertions
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      expect(programs.length).toBeGreaterThan(0);
      expect(programs[0].stationId).toBe("TBS");
    });

    it("should use cache if it is valid", async () => {
      // 1. Mock fs.stat to return a recent mtime
      const recentMtime = new Date();
      jest.spyOn(fs, "stat").mockResolvedValue({ mtime: recentMtime } as fs.Stats);

      // 2. Mock fs.readFile to return cached data
      jest.spyOn(fs, "readFile").mockResolvedValue(programXmlData);

      // 3. Spy on fetch to ensure it's NOT called
      const fetchSpy = jest.spyOn(global, "fetch");

      // 4. Call the method
      const programs = await client.getPrograms(stationId, date);

      // 5. Assertions
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(programs.length).toBeGreaterThan(0);
      expect(programs[0].stationName).toBe("TBSラジオ");
    });

    it("should fetch from network if cache is expired", async () => {
      // 1. Mock fs.stat to return an old mtime
      const oldMtime = new Date(new Date().getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
      jest.spyOn(fs, "stat").mockResolvedValue({ mtime: oldMtime } as fs.Stats);

      // 2. Mock fetch to return new program XML
      const newProgramXmlData = programXmlData.replace("TBSラジオ", "TBSラジオ(New)");
      const mockFetchResponse = {
        ok: true,
        text: () => Promise.resolve(newProgramXmlData),
      };
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce(mockFetchResponse as Response);

      // 3. Mock fs.writeFile
      const writeFileSpy = jest.spyOn(fs, "writeFile").mockResolvedValue(undefined);

      // 4. Call the method
      const programs = await client.getPrograms(stationId, date);

      // 5. Assertions
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      expect(programs[0].stationName).toBe("TBSラジオ(New)");
    });

    it("should throw an error if fetch fails and no cache exists", async () => {
      // 1. Mock fs.stat to throw an error
      jest.spyOn(fs, "stat").mockRejectedValue(new Error("File not found"));

      // 2. Mock fetch to fail
      const mockFetchResponse = { ok: false };
      jest.spyOn(global, "fetch").mockResolvedValueOnce(mockFetchResponse as Response);

      // 3. Assert that it throws
      await expect(client.getPrograms(stationId, date)).rejects.toThrow("Radiko番組表の取得に失敗しました。");
    });
  });
});
("");
