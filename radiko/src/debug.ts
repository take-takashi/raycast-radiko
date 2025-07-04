import {
  authenticate1,
  getAuthTokenFromAuthResponse,
  getPatialKeyFromAuthResponse,
  authenticate2,
  recordRadikoProgram,
  getRadikoStationList,
  parseStationListXml,
  getRadikoPrograms,
} from "./radiko-guide";

export async function debug() {
  console.log("Debugging Radiko Guide...");
}

(async () => {
  /*
  const auth_response = await authenticate1();

  const auth_token = getAuthTokenFromAuthResponse(auth_response);
  console.log("Auth Token:", auth_token);
  const partial_key = getPatialKeyFromAuthResponse(auth_response);
  console.log("Partial Key:", partial_key);

  const areaCode = await authenticate2(auth_token, partial_key);
  console.log("Area Code:", areaCode);
  */

  // ラジオ局一覧の取得
  /*
  const stationXml = await getRadikoStationList(areaCode);
  const stations = parseStationListXml(stationXml);
  console.log("Stations:", stations);
  */

  // 番組表の取得
  const stationId = "TBS"; // TBSラジオのID
  const date = "20250630";
  const programsXml = await getRadikoPrograms(date, stationId);
  console.log("Programs XML:", programsXml);

  // 番組の保存テスト
  //recordRadikoProgram(auth_token, "TBS", "20250701010000", "20250701030000"); // 動かない
  //recordRadikoProgram(auth_token, "LFR", "20250701112000", "20250701113000"); // 動く
})();
