import { RadikoClient, Station, RadikoProgram } from "../radiko-client";
import { promises as fs } from "fs";
import path from "path";

describe("RadikoClient", () => {
  let stationXmlData: string;
  let programXmlData: string;

  beforeAll(async () => {
    stationXmlData = await fs.readFile(path.join(__dirname, "radiko_station_list.xml"), "utf-8");
    programXmlData = await fs.readFile(path.join(__dirname, "radiko_program_tbs.xml"), "utf-8");
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
});
