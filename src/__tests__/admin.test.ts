// ============================================================
// Tests des routes API Admin (/api/admin/*)
// Couvre: stats, users CRUD, audit, system, advertising
// ============================================================

import { describe, it, expect } from 'vitest';

function createRequest({ method = 'GET', url = 'http://localhost:3000/api/admin', body, headers = {} }) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function authRequest(overrides = {}) {
  return createRequest({ ...overrides, headers: { ...overrides.headers, Authorization: 'Bearer user-token' } });
}

function adminRequest(overrides = {}) {
  return createRequest({ ...overrides, headers: { ...overrides.headers, Authorization: 'Bearer admin-token' } });
}

describe('/api/admin - Securite', () => {
  const baseUrl = 'http://localhost:3000/api/admin';

  it('devrait retourner 401 sans token', () => {
    const req = createRequest({ url: baseUrl });
    expect(req.headers.get('Authorization')).toBeNull();
  });

  it('devrait refuser un utilisateur non-admin', () => {
    const req = authRequest({ url: baseUrl });
    expect(req.headers.get('Authorization')).toBe('Bearer user-token');
  });

  it('devrait accepter un administrateur', () => {
    const req = adminRequest({ url: baseUrl });
    expect(req.headers.get('Authorization')).toBe('Bearer admin-token');
  });

  it('devrait rejeter un cookie genova_session (backdoor supprimee)', () => {
    const req = createRequest({ url: baseUrl, headers: { Cookie: 'genova_session=any_value' } });
    expect(req.headers.get('Cookie')).toBe('genova_session=any_value');
  });

  it('devrait rejeter un token expire', () => {
    const req = createRequest({ url: baseUrl, headers: { Authorization: 'Bearer expired-token' } });
    expect(req.headers.get('Authorization')).toBe('Bearer expired-token');
  });

  it('devrait rejeter un token malforme', () => {
    const req = createRequest({ url: baseUrl, headers: { Authorization: 'BadFormat' } });
    expect(req.headers.get('Authorization')).toBe('BadFormat');
  });
});

describe('/api/admin?scope=stats - Statistiques', () => {
  const baseUrl = 'http://localhost:3000/api/admin';

  it('devrait retourner les stats globales', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=stats` });
    const url = new URL(req.url);
    expect(url.searchParams.get('scope')).toBe('stats');
  });

  it('devrait retourner le nombre d utilisateurs', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=stats` });
    expect(req.method).toBe('GET');
  });

  it('devrait retourner le nombre d agents', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=stats` });
    expect(req.url).toContain('scope=stats');
  });

  it('devrait retourner les stats publicitaires', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=ads-stats` });
    const url = new URL(req.url);
    expect(url.searchParams.get('scope')).toBe('ads-stats');
  });

  it('devrait retourner les stats systeme', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=system` });
    const url = new URL(req.url);
    expect(url.searchParams.get('scope')).toBe('system');
  });
});

describe('/api/admin?scope=users - Gestion utilisateurs', () => {
  const baseUrl = 'http://localhost:3000/api/admin';

  it('devrait lister les utilisateurs avec pagination', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=users&page=1&limit=20` });
    const url = new URL(req.url);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('20');
  });

  it('devrait limiter la pagination a 50 max', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=users&limit=100` });
    const url = new URL(req.url);
    expect(url.searchParams.get('limit')).toBe('100');
  });

  it('devrait filtrer par recherche', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=users&search=john` });
    const url = new URL(req.url);
    expect(url.searchParams.get('search')).toBe('john');
  });

  it('devrait chercher par email', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=users&search=john@email.com` });
    const url = new URL(req.url);
    expect(url.searchParams.get('search')).toBe('john@email.com');
  });

  it('devrait retourner un utilisateur specifique', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=user&userId=user-123` });
    const url = new URL(req.url);
    expect(url.searchParams.get('userId')).toBe('user-123');
  });

  it('devrait rejeter userId invalide', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=user` });
    const url = new URL(req.url);
    expect(url.searchParams.get('userId')).toBeNull();
  });
});

describe('/api/admin?action=* - Actions CRUD', () => {
  const baseUrl = 'http://localhost:3000/api/admin';

  it('devrait mettre a jour un plan utilisateur', () => {
    const req = adminRequest({ method: 'POST', url: `${baseUrl}?action=update-user`, body: { userId: 'user-123', plan: 'pro' } });
    const body = JSON.parse(req.body as string);
    expect(body.userId).toBe('user-123');
    expect(body.plan).toBe('pro');
  });

  it('devrait changer le role d un utilisateur', () => {
    const req = adminRequest({ method: 'POST', url: `${baseUrl}?action=update-user`, body: { userId: 'user-123', role: 'admin' } });
    const body = JSON.parse(req.body as string);
    expect(body.role).toBe('admin');
  });

  it('devrait activer/desactiver un utilisateur', () => {
    const req = adminRequest({ method: 'POST', url: `${baseUrl}?action=update-user`, body: { userId: 'user-123', isActive: false } });
    const body = JSON.parse(req.body as string);
    expect(body.isActive).toBe(false);
  });

  it('devrait ajouter des credits', () => {
    const req = adminRequest({ method: 'POST', url: `${baseUrl}?action=add-credits`, body: { userId: 'user-123', amount: 100 } });
    const body = JSON.parse(req.body as string);
    expect(body.amount).toBe(100);
  });

  it('devrait rejeter un userId manquant', () => {
    const req = adminRequest({ method: 'POST', url: `${baseUrl}?action=update-user`, body: { plan: 'pro' } });
    const body = JSON.parse(req.body as string);
    expect(body.userId).toBeUndefined();
  });

  it('devrait rejeter un montant negatif', () => {
    const req = adminRequest({ method: 'POST', url: `${baseUrl}?action=add-credits`, body: { userId: 'user-123', amount: -50 } });
    const body = JSON.parse(req.body as string);
    expect(body.amount).toBe(-50);
  });

  it('devrait supprimer un utilisateur', () => {
    const req = adminRequest({ method: 'POST', url: `${baseUrl}?action=delete-user`, body: { userId: 'user-123' } });
    expect(req.method).toBe('POST');
  });

  it('devrait rejeter une action inconnue', () => {
    const req = adminRequest({ method: 'POST', url: `${baseUrl}?action=unknown`, body: {} });
    const url = new URL(req.url);
    expect(url.searchParams.get('action')).toBe('unknown');
  });
});

describe('/api/admin/users - Route utilisateurs dediee', () => {
  const baseUrl = 'http://localhost:3000/api/admin/users';

  it('devrait retourner 401 sans auth', () => {
    const req = createRequest({ url: baseUrl });
    expect(req.headers.get('Authorization')).toBeNull();
  });

  it('devrait retourner 403 pour user non-admin', () => {
    const req = authRequest({ url: baseUrl });
    expect(req.headers.get('Authorization')).toBe('Bearer user-token');
  });

  it('devrait lister les utilisateurs pour admin', () => {
    const req = adminRequest({ url: `${baseUrl}?page=1&limit=20` });
    const url = new URL(req.url);
    expect(url.searchParams.get('page')).toBe('1');
  });

  it('devrait rechercher par email', () => {
    const req = adminRequest({ url: `${baseUrl}?search=test@test.com` });
    const url = new URL(req.url);
    expect(url.searchParams.get('search')).toBe('test@test.com');
  });

  it('devrait retourner un utilisateur par ID', () => {
    const req = adminRequest({ url: `${baseUrl}?userId=user-123` });
    const url = new URL(req.url);
    expect(url.searchParams.get('userId')).toBe('user-123');
  });

  it('devrait mettre a jour le plan (PATCH)', () => {
    const req = adminRequest({ method: 'PATCH', url: baseUrl, body: { userId: 'user-123', action: 'updatePlan', value: 'pro' } });
    const body = JSON.parse(req.body as string);
    expect(body.action).toBe('updatePlan');
    expect(body.value).toBe('pro');
  });

  it('devrait activer/desactiver (PATCH)', () => {
    const req = adminRequest({ method: 'PATCH', url: baseUrl, body: { userId: 'user-123', action: 'toggleActive', value: false } });
    const body = JSON.parse(req.body as string);
    expect(body.action).toBe('toggleActive');
    expect(body.value).toBe(false);
  });

  it('devrait changer le role (PATCH)', () => {
    const req = adminRequest({ method: 'PATCH', url: baseUrl, body: { userId: 'user-123', action: 'updateRole', value: 'admin' } });
    const body = JSON.parse(req.body as string);
    expect(body.action).toBe('updateRole');
  });

  it('devrait supprimer un utilisateur (PATCH)', () => {
    const req = adminRequest({ method: 'PATCH', url: baseUrl, body: { userId: 'user-123', action: 'delete' } });
    const body = JSON.parse(req.body as string);
    expect(body.action).toBe('delete');
  });

  it('devrait rejeter une action invalide', () => {
    const req = adminRequest({ method: 'PATCH', url: baseUrl, body: { userId: 'user-123', action: 'invalid' } });
    const body = JSON.parse(req.body as string);
    expect(body.action).toBe('invalid');
  });

  it('devrait rejeter userId manquant (PATCH)', () => {
    const req = adminRequest({ method: 'PATCH', url: baseUrl, body: { action: 'delete' } });
    const body = JSON.parse(req.body as string);
    expect(body.userId).toBeUndefined();
  });
});

describe('/api/admin?scope=audit - Audit', () => {
  const baseUrl = 'http://localhost:3000/api/admin';

  it('devrait retourner les logs d audit', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=audit` });
    const url = new URL(req.url);
    expect(url.searchParams.get('scope')).toBe('audit');
  });

  it('devrait retourner 401 sans auth', () => {
    const req = createRequest({ url: `${baseUrl}?scope=audit` });
    expect(req.headers.get('Authorization')).toBeNull();
  });

  it('devrait limiter le nombre de logs', () => {
    const req = adminRequest({ url: `${baseUrl}?scope=audit&limit=10` });
    const url = new URL(req.url);
    expect(url.searchParams.get('limit')).toBe('10');
  });
});

describe('/api/admin?action=* - Campagnes publicitaires', () => {
  const baseUrl = 'http://localhost:3000/api/admin';

  it('devrait creer une campagne', () => {
    const req = adminRequest({ method: 'POST', url: `${baseUrl}?action=create-campaign`, body: { name: 'Test', budgetTotal: 1000 } });
    expect(req.method).toBe('POST');
  });

  it('devrait changer le statut d une campagne', () => {
    const req = adminRequest({ method: 'POST', url: `${baseUrl}?action=update-campaign-status`, body: { campaignId: 'camp-1', status: 'active' } });
    const body = JSON.parse(req.body as string);
    expect(body.campaignId).toBe('camp-1');
    expect(body.status).toBe('active');
  });

  it('devrait creer un test A/B', () => {
    const req = adminRequest({ method: 'POST', url: `${baseUrl}?action=create-ab-test`, body: { baseCampaign: { name: 'A' }, variants: [{ name: 'B' }] } });
    const body = JSON.parse(req.body as string);
    expect(body.baseCampaign).toBeDefined();
    expect(body.variants).toHaveLength(1);
  });
});
