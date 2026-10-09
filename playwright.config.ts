import { defineConfig,devices } from '@playwright/test';
import { assertDifferentDatabases, disposableDatabaseName } from './services/api/src/db/test-safety.js';
const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl) throw new Error('Set DATABASE_URL to a separate disposable browser database ending in _test.');
disposableDatabaseName(databaseUrl);
assertDifferentDatabases(databaseUrl,process.env.TEST_DATABASE_URL);
export default defineConfig({
  testDir:'tests/e2e',fullyParallel:false,workers:1,retries:0,timeout:45000,
  reporter:process.env.CI ? [['list'],['html',{open:'never'}]]:'list',
  use:{baseURL:'http://localhost:5173',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome'],...(process.env.E2E_BROWSER_CHANNEL ? {channel:process.env.E2E_BROWSER_CHANNEL}: {})}}],
  webServer:[
    {command:'npx tsx scripts/prepare-e2e.ts && npx tsx services/api/src/server.ts',url:'http://127.0.0.1:3001/ready',reuseExistingServer:false,timeout:60000,
      env:{DATABASE_URL:databaseUrl,NODE_ENV:'test',FRONTEND_ORIGIN:'http://localhost:5173',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',MARKET_PROVIDER:'fixture',PORT:'3001',HOST:'127.0.0.1'}},
    {command:'npm run dev -w @ifms/web',url:'http://localhost:5173',reuseExistingServer:false,timeout:60000},
  ],
});
