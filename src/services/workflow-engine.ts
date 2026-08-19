// Workflow Engine avec ResourceGuard
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkpointManager } from "@/lib/checkpoint";
import { ResourceGuard, limitString } from "@/lib/resource-guard";
const guard = new ResourceGuard({ timeoutMs:120000, maxIterations:100, maxStringLength:50000 });
export type StepType = "agent"|"condition"|"loop"|"parallel"|"wait"|"webhook"|"code";
export interface WorkflowStep { id:string; type:StepType; name:string; config:Record<string,unknown>; next?:string; onSuccess?:string; onFailure?:string; }
export interface WorkflowContext { executionId:string; variables:Record<string,unknown>; stepResults:Record<string,unknown>; errors:Array<{stepId:string;error:string}>; startTime:number; }
class WorkflowEngine {
  async execute(workflowId:string, userId:string, input?:Record<string,unknown>): Promise<WorkflowContext> {
    return guard.withTimeout(async () => {
      const wf = await prisma.workflow.findUnique({ where:{id:workflowId} });
      if (!wf) throw new Error("Introuvable");
      const steps = (typeof wf.steps==="string"?JSON.parse(wf.steps):wf.steps) as WorkflowStep[];
      const limitedSteps = guard.limitArray(steps, 50);
      const ctx: WorkflowContext = { executionId:`wf_${workflowId}_${Date.now()}`, variables:{...input,workflowName:wf.name}, stepResults:{}, errors:[], startTime:Date.now() };
      let idx = 0, it = 0;
      while (idx < limitedSteps.length && it < 100) {
        it++;
        if (Date.now()-ctx.startTime > 120000) throw new Error("Timeout 2min");
        const step = limitedSteps[idx]!;
        try {
          switch (step.type) {
            case "agent": ctx.stepResults[step.id] = await this.executeAgentStep(step, ctx); break;
            case "condition": idx = this.evaluateCondition(step, ctx); continue;
            case "loop": idx = await this.executeLoop(step, ctx, limitedSteps); continue;
            case "parallel": ctx.stepResults[step.id] = await this.executeParallel(step, ctx, limitedSteps); break;
            case "wait": await this.executeWait(step); break;
            case "code": ctx.stepResults[step.id] = this.executeCode(step, ctx); break;
            case "webhook": ctx.stepResults[step.id] = { triggered:true, url:step.config.url }; break;
          }
          if (step.config.outputVariable) ctx.variables[step.config.outputVariable as string] = ctx.stepResults[step.id];
          idx++;
        } catch(e) {
          const msg = e instanceof Error ? e.message : String(e);
          ctx.errors.push({ stepId:step.id, error:msg });
          if (step.onFailure) { idx = limitedSteps.findIndex(s=>s.id===step.onFailure); if (idx<0) idx=limitedSteps.length; } else idx++;
        }
        await checkpointManager.save({ agentId:workflowId, sessionId:ctx.executionId, step:idx, context:{ variables:ctx.variables, stepResults:ctx.stepResults }, memory:[{ role:"user", content:`Step ${idx}`, timestamp:new Date().toISOString() }], actions:[], totalCost:0, totalTokens:0 });
      }
      return ctx;
    }, 120000);
  }
  private async executeAgentStep(step:WorkflowStep, ctx:WorkflowContext) {
    return { agentId:step.config.agentId, input:this.interpolate(step.config.input as string||"", ctx.variables), status:"completed", output:"[Simulation]" };
  }
  private evaluateCondition(step:WorkflowStep, ctx:WorkflowContext): number {
    const { variable,operator,value,ifTrue,ifFalse } = step.config as Record<string,string>;
    const v = ctx.variables[variable];
    let r = false;
    switch(operator) { case "eq": r=v===value; break; case "neq": r=v!==value; break; case "gt": r=Number(v)>Number(value); break; case "lt": r=Number(v)<Number(value); break; case "contains": r=String(v).includes(value); break; case "exists": r=v!==undefined&&v!==null; break; }
    return r ? Number(ifTrue) : Number(ifFalse);
  }
  private async executeLoop(step:WorkflowStep, ctx:WorkflowContext, steps:WorkflowStep[]): Promise<number> {
    const { variable,collection,maxIterations } = step.config as Record<string,unknown>;
    const items = ctx.variables[collection as string] as unknown[] ?? [];
    const max = Math.min(items.length, (maxIterations as number)??10, 25);
    for (let i=0;i<max;i++) { ctx.variables[`${variable}_current`]=items[i]; ctx.variables[`${variable}_index`]=i; }
    return steps.findIndex(s=>s.id===(step.next??step.id))+1;
  }
  private async executeParallel(step:WorkflowStep, ctx:WorkflowContext, steps:WorkflowStep[]) {
    const ss = ((step.config.steps as string[])?.map(id=>steps.find(s=>s.id===id)).filter(Boolean)??[]).slice(0,10);
    return Promise.allSettled(ss.map(async s=>{ if(s!.type==="agent") return this.executeAgentStep(s!,ctx); return null; }));
  }
  private async executeWait(step:WorkflowStep) { await new Promise(r=>setTimeout(r, Math.min((step.config.durationMs as number)??1000, 10000))); }
  private executeCode(step:WorkflowStep, ctx:WorkflowContext) {
    try { return new Function("context", limitString(step.config.code as string||"",5000))(ctx); }
    catch(e) { return { error:`Erreur: ${e instanceof Error?e.message:String(e)}` }; }
  }
  private interpolate(template:string, vars:Record<string,unknown>): string {
    return limitString(template,10000).replace(/\{\{\s*(\w+)\s*\}\}/g, (_,k)=>limitString(String(vars[k]??''),1000));
  }
}
export const workflowEngine = new WorkflowEngine();
