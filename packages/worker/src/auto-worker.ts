import {Worker,Queue,Job} from 'bullmq';
import {Redis} from 'ioredis';
import {createLogger,db} from '@gen3ia/core';
const log=createLogger('auto-worker');
const conn=new Redis(process.env.REDIS_URL??'redis://localhost:6379',{maxRetriesPerRequest:null,retryStrategy:t=>Math.min(t*100,3000)});
export const agentQueue=new Queue('agent-execution',{connection:conn,defaultJobOptions:{attempts:3,backoff:{type:'exponential',delay:2000},removeOnComplete:{age:86400},removeOnFail:{age:172800}}});
const worker=new Worker('agent-execution',async(job)=>{const{agentId,userId,input,executionId}=job.data;log.info('processing',{jobId:job.id,agentId});
const agent=await db.agent.findUnique({where:{id:agentId},select:{id:true,name:true,type:true,userId:true,status:true}});
if(!agent)throw new Error('Agent introuvable');if(agent.status==='inactive'){log.warn('inactive',{agentId});return;}
const user=await db.user.findUnique({where:{id:userId},select:{credits:true}});if(!user||(user.credits??0)<1)throw new Error('Credits insuffisants');
let exec=executionId?await db.agentExecution.findUnique({where:{id:executionId}}):null;
if(!exec){exec=await db.agentExecution.create({data:{agentId,userId,task:(input??'').slice(0,500),status:'running',provider:'auto_scheduler',sessionId:null}});}
else{await db.agentExecution.update({where:{id:exec.id},data:{status:'running'}});}
try{await new Promise(r=>setTimeout(r,2000));const tokens=Math.floor(Math.random()*400)+100;
await db.agentExecution.update({where:{id:exec.id},data:{status:'completed',result:JSON.stringify({output:'[Auto] '+agent.name,tokens}),totalTokens:tokens,estimatedCost:tokens*0.000002,completedAt:new Date()}});
await db.user.update({where:{id:userId,credits:{gte:1}},data:{credits:{decrement:1}}});
log.info('completed',{jobId:job.id,tokens});}catch(e){await db.agentExecution.update({where:{id:exec.id},data:{status:'failed',error:String(e),completedAt:new Date()}}).catch(()=>{});throw e;}
},{connection:conn,concurrency:5,limiter:{max:10,duration:1000}});
worker.on('completed',j=>log.info('job_completed',{jobId:j.id}));
worker.on('failed',(j,e)=>log.error('job_failed',{jobId:j?.id,error:e.message}));
worker.on('error',e=>log.error('worker_error',{error:e.message}));
log.info('worker_started',{concurrency:5});
export default worker;