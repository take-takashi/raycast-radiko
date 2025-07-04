import { authenticate1, getAuthTokenFromAuthResponse, getPatialKeyFromAuthResponse } from "./radiko-guide";

export async function debug() {
  console.log("Debugging Radiko Guide...");
}

(async () => {
  const auth_response = await authenticate1();
  // console.log("Authentication Data:", data);
  // await saveAuthHeaders(auth_response);

  const auth_token = getAuthTokenFromAuthResponse(auth_response);
  console.log("Auth Token:", auth_token);
  const partial_key = getPatialKeyFromAuthResponse(auth_response);
  console.log("Partial Key:", partial_key);
})();
