import { describe, it, expect, beforeEach } from 'vitest';
import {
  PermissionScope,
  RiskLevel,
  SCOPE_DEFINITIONS,
  PermissionManager,
  SandboxGuard,
  AuditLogger,
  permissionManager,
  sandboxGuard,
  auditLogger,
} from '../lib/agent-permissions';

describe('Agent Permissions & Sandboxing', () => {
  let pm: PermissionManager;
  let guard: SandboxGuard;
  let logger: AuditLogger;

  beforeEach(() => {
    pm = new PermissionManager();
    guard = new SandboxGuard();
    logger = new AuditLogger();
  });

  describe('SCOPE_DEFINITIONS', () => {
    it('contains definitions for all 13 scopes', () => {
      const scopes = Object.values(PermissionScope);
      expect(scopes.length).toBe(13);
      scopes.forEach((scope) => {
        expect(SCOPE_DEFINITIONS[scope]).toBeDefined();
        expect(SCOPE_DEFINITIONS[scope].scope).toBe(scope);
        expect(SCOPE_DEFINITIONS[scope].description).toBeDefined();
        expect(SCOPE_DEFINITIONS[scope].riskLevel).toBeDefined();
      });
    });

    it('assigns correct risk levels', () => {
      expect(SCOPE_DEFINITIONS[PermissionScope.EXEC_TERMINAL].riskLevel).toBe(RiskLevel.CRITICAL);
      expect(SCOPE_DEFINITIONS[PermissionScope.MANAGE_AGENTS].riskLevel).toBe(RiskLevel.CRITICAL);
      expect(SCOPE_DEFINITIONS[PermissionScope.ACCESS_NETWORK].riskLevel).toBe(RiskLevel.HIGH);
      expect(SCOPE_DEFINITIONS[PermissionScope.READ_FILES].riskLevel).toBe(RiskLevel.LOW);
    });
  });

  describe('PermissionManager', () => {
    it('requests scopes and computes risk summary correctly', () => {
      const summary = pm.requestScopes('agent-test', [
        PermissionScope.READ_FILES,
        PermissionScope.EXEC_TERMINAL,
        PermissionScope.ACCESS_NETWORK,
      ]);

      expect(summary.requiredApprovals.length).toBe(2); // EXEC_TERMINAL, ACCESS_NETWORK
      expect(summary.riskSummary[RiskLevel.LOW]).toBe(1);
      expect(summary.riskSummary[RiskLevel.HIGH]).toBe(1);
      expect(summary.riskSummary[RiskLevel.CRITICAL]).toBe(1);
    });

    it('grants and retrieves permissions', async () => {
      const grant = await pm.grantPermissions('agent-1', 'user-1', [
        PermissionScope.READ_CONVERSATIONS,
        PermissionScope.WRITE_CONVERSATIONS,
      ]);

      expect(grant.agentId).toBe('agent-1');
      expect(grant.userId).toBe('user-1');
      expect(grant.scopes).toContain(PermissionScope.READ_CONVERSATIONS);

      const scopes = await pm.getGrantedScopes('agent-1', 'user-1');
      expect(scopes).toHaveLength(2);
      expect(scopes).toContain(PermissionScope.READ_CONVERSATIONS);
    });

    it('revokes permissions', async () => {
      await pm.grantPermissions('agent-1', 'user-1', [PermissionScope.READ_FILES]);
      let scopes = await pm.getGrantedScopes('agent-1', 'user-1');
      expect(scopes).toContain(PermissionScope.READ_FILES);

      await pm.revokePermissions('agent-1', 'user-1');
      scopes = await pm.getGrantedScopes('agent-1', 'user-1');
      expect(scopes).toHaveLength(0);
    });

    it('checks single permission scope', async () => {
      await pm.grantPermissions('agent-1', 'user-1', [PermissionScope.READ_MEMORY]);

      const checkAllowed = await pm.checkPermission('agent-1', 'user-1', PermissionScope.READ_MEMORY);
      expect(checkAllowed.allowed).toBe(true);

      const checkDenied = await pm.checkPermission('agent-1', 'user-1', PermissionScope.WRITE_MEMORY);
      expect(checkDenied.allowed).toBe(false);
      expect(checkDenied.missingScopes).toContain(PermissionScope.WRITE_MEMORY);
    });

    it('checks multiple permission scopes', async () => {
      await pm.grantPermissions('agent-1', 'user-1', [
        PermissionScope.READ_FILES,
        PermissionScope.WRITE_FILES,
      ]);

      const checkAll = await pm.checkMultiple('agent-1', 'user-1', [
        PermissionScope.READ_FILES,
        PermissionScope.WRITE_FILES,
      ]);
      expect(checkAll.allowed).toBe(true);

      const checkMissing = await pm.checkMultiple('agent-1', 'user-1', [
        PermissionScope.READ_FILES,
        PermissionScope.EXEC_TERMINAL,
      ]);
      expect(checkMissing.allowed).toBe(false);
      expect(checkMissing.missingScopes).toContain(PermissionScope.EXEC_TERMINAL);
    });

    it('enforces allowed domains condition', async () => {
      await pm.grantPermissions('agent-1', 'user-1', [PermissionScope.ACCESS_NETWORK], {
        allowedDomains: ['github.com', 'openai.com'],
      });

      const allowedCheck = await pm.checkPermission(
        'agent-1',
        'user-1',
        PermissionScope.ACCESS_NETWORK,
        'api.github.com'
      );
      expect(allowedCheck.allowed).toBe(true);

      const deniedCheck = await pm.checkPermission(
        'agent-1',
        'user-1',
        PermissionScope.ACCESS_NETWORK,
        'malicious-site.com'
      );
      expect(deniedCheck.allowed).toBe(false);
    });
  });

  describe('SandboxGuard', () => {
    it('wraps API call and executes when permitted', async () => {
      await permissionManager.grantPermissions('agent-sb', 'user-sb', [PermissionScope.READ_FILES]);

      const result = await sandboxGuard.wrapApiCall(
        'agent-sb',
        'user-sb',
        PermissionScope.READ_FILES,
        async () => 'file contents'
      );

      expect(result).toBe('file contents');
    });

    it('throws error when API call is denied', async () => {
      await expect(
        sandboxGuard.wrapApiCall(
          'agent-sb',
          'user-sb',
          PermissionScope.EXEC_TERMINAL,
          async () => 'exec'
        )
      ).rejects.toThrow(/Permission denied/);
    });

    it('enforces rate limits per minute', () => {
      const allowed1 = guard.enforceRateLimit('agent-rl', 'user-rl', 2);
      const allowed2 = guard.enforceRateLimit('agent-rl', 'user-rl', 2);
      const allowed3 = guard.enforceRateLimit('agent-rl', 'user-rl', 2);

      expect(allowed1).toBe(true);
      expect(allowed2).toBe(true);
      expect(allowed3).toBe(false);
    });

    it('enforces credit limits per day', async () => {
      const ok1 = await guard.enforceCreditLimit('agent-cl', 'user-cl', 10, 5);
      const ok2 = await guard.enforceCreditLimit('agent-cl', 'user-cl', 10, 5);
      const ok3 = await guard.enforceCreditLimit('agent-cl', 'user-cl', 10, 5);

      expect(ok1).toBe(true);
      expect(ok2).toBe(true);
      expect(ok3).toBe(false);
    });
  });

  describe('AuditLogger', () => {
    it('logs entries and retrieves audit history', async () => {
      await logger.log({
        agentId: 'agent-audit',
        userId: 'user-audit',
        scope: PermissionScope.READ_CONVERSATIONS,
        action: 'fetch_conversations',
        allowed: true,
      });

      await logger.log({
        agentId: 'agent-audit',
        userId: 'user-audit',
        scope: PermissionScope.EXEC_TERMINAL,
        action: 'run_bash',
        allowed: false,
      });

      const logs = await logger.getAuditLog('agent-audit', 'user-audit', 10);
      expect(logs).toHaveLength(2);
      expect(logs[0].action).toBe('run_bash');
      expect(logs[0].allowed).toBe(false);
      expect(logs[1].action).toBe('fetch_conversations');
      expect(logs[1].allowed).toBe(true);
    });
  });
});
