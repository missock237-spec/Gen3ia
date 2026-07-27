-- Migration 00007: Ajout des modèles OAuthState et CodeProject
-- Genova AI Agent OS

-- Table OAuthState : stocke les états OAuth en attente de callback
CREATE TABLE IF NOT EXISTS "OAuthState" (
    id              TEXT PRIMARY KEY,
    state           TEXT NOT NULL UNIQUE,
    provider        TEXT NOT NULL,
    userId          TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    agentId         TEXT REFERENCES "Agent"(id) ON DELETE SET NULL,
    scopes          TEXT NOT NULL DEFAULT '',
    redirectUrl     TEXT,
    codeVerifier    TEXT,
    expiresAt       TIMESTAMPTZ NOT NULL,
    createdAt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usedAt          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_state_state ON "OAuthState"(state);
CREATE INDEX IF NOT EXISTS idx_oauth_state_userId ON "OAuthState"(userId);
CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON "OAuthState"(expiresAt);

-- Table WorkflowAuthorization : stocke les tokens OAuth des workflows
CREATE TABLE IF NOT EXISTS "WorkflowAuthorization" (
    id              TEXT PRIMARY KEY,
    workflowId      TEXT NOT NULL REFERENCES "Workflow"(id) ON DELETE CASCADE,
    service         TEXT NOT NULL,
    accessToken     TEXT NOT NULL,
    refreshToken    TEXT,
    tokenType       TEXT NOT NULL DEFAULT 'Bearer',
    expiresAt       TIMESTAMPTZ,
    scopes          TEXT NOT NULL DEFAULT '',
    providerUserId   TEXT,
    providerEmail   TEXT,
    isConnected     BOOLEAN NOT NULL DEFAULT false,
    lastUsedAt      TIMESTAMPTZ,
    createdAt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_auth_workflow ON "WorkflowAuthorization"(workflowId);
CREATE INDEX IF NOT EXISTS idx_workflow_auth_service ON "WorkflowAuthorization"(service);
CREATE INDEX IF NOT EXISTS idx_workflow_auth_expires ON "WorkflowAuthorization"(expiresAt);

-- Table CodeProject : projets de code des utilisateurs
CREATE TABLE IF NOT EXISTS "CodeProject" (
    id              TEXT PRIMARY KEY,
    userId          TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT DEFAULT '',
    language        TEXT NOT NULL DEFAULT 'javascript',
    files           JSONB NOT NULL DEFAULT '[]',
    isPublic        BOOLEAN NOT NULL DEFAULT false,
    createdAt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_code_project_user ON "CodeProject"(userId);
CREATE INDEX IF NOT EXISTS idx_code_project_public ON "CodeProject"(isPublic) WHERE isPublic = true;
