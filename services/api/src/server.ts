import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';

const config=loadConfig();
const pool=createPool(config.databaseUrl);
const server=createServer(createApp({pool,config}));
server.listen(config.port,config.host,()=>process.stdout.write(`IIPA API listening on ${config.host}:${config.port}\n`));
server.on('error',()=> {process.stderr.write('API could not start. Check the configured host and port.\n');process.exitCode=1;});
async function close() { server.close(); await pool.end(); }
process.once('SIGINT',()=>void close()); process.once('SIGTERM',()=>void close());
