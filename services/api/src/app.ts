import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'pg';
import { createAuthRouter, type AuthRouterOptions } from './auth.js';
import { loadAuth } from './auth-context.js';
import { createPortfolioRouter } from './portfolio.js';
import { createMarketRouter } from './market.js';
import { createSubscriptionRouter } from './subscriptions.js';
import type { MarketProvider } from './market-provider.js';
import { HttpError } from './errors.js';

export function createApp(options: AuthRouterOptions & { marketProvider?: MarketProvider }) {
  const { pool,config }=options;
  const app=express();
  app.disable('x-powered-by');
  // Opt-in for the single localhost Nginx proxy; never trust arbitrary remote proxies.
  app.set('trust proxy',config.trustProxyLoopback ? 'loopback' : false);
  app.use((_request,response,next)=> { response.locals.requestId=randomUUID(); response.set('X-Request-ID',response.locals.requestId); next(); });
  app.use(helmet({ referrerPolicy:{policy:'no-referrer'} }));
  app.use((request,_response,next)=> {
    const origin=request.get('Origin');
    if ((origin && origin!==config.frontendOrigin) || (!['GET','HEAD','OPTIONS'].includes(request.method) && origin!==config.frontendOrigin)) {
      next(new HttpError(403,'ORIGIN_INVALID','The request origin is not allowed.')); return;
    }
    next();
  });
  app.use(cors({ origin:config.frontendOrigin,credentials:true,methods:['GET','HEAD','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','X-CSRF-Token'] }));
  app.use(express.json({limit:'32kb',strict:true}));
  app.use('/api',(_request,response,next)=> { response.set('Cache-Control','no-store'); next(); });
  app.get('/health',(_request,response)=>response.json({data:{status:'ok',service:'ifms-api',phase:'P1 Mid'}}));
  app.get('/ready',async(_request,response)=> {
    try {
      const result=await pool.query(`SELECT count(*)=2 AS migrated FROM schema_migrations
        WHERE name IN ('001_p1_foundation.sql','002_subscription_plans.sql')`);
      if(!result.rows[0]?.migrated) { response.status(503).json({data:{status:'not-ready'}}); return; }
      response.json({data:{status:'ready',database:'connected'}});
    } catch { response.status(503).json({data:{status:'not-ready'}}); }
  });
  app.use('/api/v1',rateLimit({windowMs:60_000,limit:300,standardHeaders:'draft-8',legacyHeaders:false,
    message:{error:{code:'RATE_LIMITED',message:'Too many requests. Retry shortly.'}}}));
  app.use('/api/v1/auth',rateLimit({windowMs:10*60_000,limit:60,standardHeaders:'draft-8',legacyHeaders:false,
    message:{error:{code:'AUTH_RATE_LIMITED',message:'Too many authentication requests. Retry later.'}}}));
  app.use('/api/v1',loadAuth(pool),createAuthRouter(options),createPortfolioRouter({pool,config}),createMarketRouter({pool,config,provider:options.marketProvider}),createSubscriptionRouter(pool));
  app.use((_request,_response,next)=>next(new HttpError(404,'NOT_FOUND','Endpoint not found.')));
  const errorHandler: ErrorRequestHandler=(error,_request,response,_next)=> {
    let status=500,code='INTERNAL_ERROR',message='The request could not be completed.';
    if(error instanceof HttpError) {status=error.status;code=error.code;message=error.message;}
    else if(error?.type==='entity.too.large') {status=413;code='BODY_TOO_LARGE';message='The request body is too large.';}
    else if(error instanceof SyntaxError && 'body' in error) {status=400;code='INVALID_JSON';message='Send a valid JSON object.';}
    else if(error?.code==='23505') {status=409;code='CONFLICT';message='The requested resource already exists.';}
    // No raw exception, request body, OAuth code, DB URL or provider URL enters logs.
    response.status(status).json({error:{code,message,requestId:response.locals.requestId}});
  };
  app.use(errorHandler);
  return app;
}
export type AppPool=Pool;
