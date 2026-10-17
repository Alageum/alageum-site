"use strict";
// Operator/CI diagnostic only. It never stores uploads or contacts public services.
const { readMediaConfig } = require("../src/domain/media-policy");
const { scanBytes } = require("../src/domain/media-scanner");
const clean = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
(async () => {
  const { scanner } = readMediaConfig();
  await scanBytes(clean, scanner);
  let blocked = false;
  try { await scanBytes(eicar, scanner); }
  catch (error) { if (error.code !== "media_malware_detected") throw error; blocked = true; }
  if (!blocked) throw new Error("Scanner accepted EICAR: do not enable media uploads");
  console.log(JSON.stringify({ clean_fixture: "accepted", harmless_eicar_fixture: "rejected", public_writes: 0 }));
})().catch(error => { console.error(error.code || "media_scanner_check_failed", error.message); process.exitCode = 1; });
