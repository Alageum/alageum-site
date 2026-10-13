import { randomBytes } from 'node:crypto';
import { writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { isIP } from 'node:net';
const target=process.argv[2];const address=process.argv[3]||'127.0.0.1';
if(!target||isIP(address)!==4)throw Error('Usage: node handoff/create-local-env.mjs ../alageum-local.env LOCAL_IPV4');
const key=()=>randomBytes(32).toString('hex');const password=key();
const env={APP_ENV:'development',NODE_ENV:'development',HOST:address,PORT:'8000',POSTGRES_DB:'alageum_strapi_handoff',POSTGRES_USER:'alageum_strapi',POSTGRES_PASSWORD:password,DATABASE_URL:`postgresql://alageum_strapi:${password}@127.0.0.1:55432/alageum_strapi_handoff`,APP_KEYS:`${key()},${key()}`,ADMIN_JWT_SECRET:key(),API_TOKEN_SALT:key(),TRANSFER_TOKEN_SALT:key(),ENCRYPTION_KEY:key(),ALAGEUM_JWT_SECRET:key(),ALAGEUM_SEED_DEMO:'0',ALAGEUM_IMPORT_CATALOG:'1',STRAPI_TELEMETRY_DISABLED:'true',STRAPI_HIDE_UPDATE_MESSAGE:'true',CORS_ORIGINS:`http://${address}:8000,http://${address}:3000,http://localhost:3000,http://127.0.0.1:3000`};
writeFileSync(target,Object.entries(env).map(([k,v])=>`${k}=${v}\n`).join(''),{mode:0o600,flag:'wx'});chmodSync(target,0o600);console.log('Created private local environment:',resolve(target));
