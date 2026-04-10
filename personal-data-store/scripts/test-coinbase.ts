import { createPrivateKey } from "crypto";
import { importPKCS8, SignJWT } from "jose";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";

async function main() {
  const keyName = "organizations/6b5036e2-a3d3-41e1-839b-f1525bc70b12/apiKeys/dc0e6fd6-10c2-4ec0-ae01-fa8cd6bc4e54";
  const pem = readFileSync("./coinbase-key.pem", "utf-8");

  const cryptoKey = createPrivateKey(pem);
  const pkcs8Pem = cryptoKey.export({ type: "pkcs8", format: "pem" }) as string;
  const key = await importPKCS8(pkcs8Pem, "ES256");

  const path = "/v2/accounts?limit=100";
  const uri = `GET api.coinbase.com${path}`;

  const jwt = await new SignJWT({
    sub: keyName,
    iss: "cdp",
    aud: ["cdp_service"],
    uri,
  }).setProtectedHeader({ alg: "ES256", kid: keyName, nonce: randomUUID(), typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("2m")
    .setNotBefore(Math.floor(Date.now() / 1000))
    .sign(key);

  console.log("JWT length:", jwt.length);

  const res = await fetch("https://api.coinbase.com" + path, {
    headers: { Authorization: "Bearer " + jwt, "CB-VERSION": "2024-01-01" },
  });
  console.log("Status:", res.status);
  const body = await res.text();
  console.log("Body:", body.slice(0, 500));
}

main();
