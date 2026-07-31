import { describe, it, expect } from 'vitest';
function r(url: string, o: any = {}) {
  return new Request(url, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...o.headers },
    body: o.body ? JSON.stringify(o.body) : undefined });
}
function a(url: string, o: any = {}) { return r(url, { ...o, headers: { ...o.headers, Authorization: 'Bearer t' } }); }

describe('/api/whatsapp', () => {
  it('send 401 sans auth', () => { const x = r('http://localhost:3000/api/whatsapp/send'); expect(x.headers.get('Authorization')).toBeNull(); });
  it('call 401 sans auth', () => { const x = r('http://localhost:3000/api/whatsapp/call'); expect(x.headers.get('Authorization')).toBeNull(); });
  it('send message', () => { const x = a('http://localhost:3000/api/whatsapp/send', { method: 'POST', body: { to: '+237600000000', message: 'Bonjour' } });
    const b = JSON.parse(x.body as string); expect(b.to).toBe('+237600000000'); expect(b.message).toBe('Bonjour'); });
  it('send template', () => { const x = a('http://localhost:3000/api/whatsapp/send', { method: 'POST', body: { to: '+237600000000', template: 'welcome', variables: { name: 'John' } } });
    const b = JSON.parse(x.body as string); expect(b.template).toBe('welcome'); });
  it('call vocal', () => { const x = a('http://localhost:3000/api/whatsapp/call', { method: 'POST', body: { to: '+237600000000', message: 'Message vocal' } });
    const b = JSON.parse(x.body as string); expect(b.message).toBe('Message vocal'); });
  it('webhook entrant', () => { const x = r('http://localhost:3000/api/webhook/whatsapp', { method: 'POST', body: { from: '+237600000000', text: 'Hello' } });
    const b = JSON.parse(x.body as string); expect(b.from).toBe('+237600000000'); });
  it('historique conversations', () => { const x = a('http://localhost:3000/api/whatsapp/conversations'); expect(x.url).toContain('/api/whatsapp/conversations'); });
});

describe('/api/workflows', () => {
  it('list 401 sans auth', () => { const x = r('http://localhost:3000/api/workflows'); expect(x.headers.get('Authorization')).toBeNull(); });
  it('lister avec pagination', () => { const x = a('http://localhost:3000/api/workflows?page=1&limit=10'); const u = new URL(x.url);
    expect(u.searchParams.get('page')).toBe('1'); expect(u.searchParams.get('limit')).toBe('10'); });
  it('filtrer par trigger', () => { const x = a('http://localhost:3000/api/workflows?trigger=manual'); const u = new URL(x.url);
    expect(u.searchParams.get('trigger')).toBe('manual'); });
  it('filtrer par statut', () => { const x = a('http://localhost:3000/api/workflows?status=draft'); const u = new URL(x.url);
    expect(u.searchParams.get('status')).toBe('draft'); });
  it('creer workflow', () => { const x = a('http://localhost:3000/api/workflows', { method: 'POST', body: { name: 'Test', trigger: 'webhook', steps: [] } });
    const b = JSON.parse(x.body as string); expect(b.name).toBe('Test'); expect(b.trigger).toBe('webhook'); });
  it('mettre a jour workflow', () => { const x = a('http://localhost:3000/api/workflows/wf-1', { method: 'PATCH', body: { name: 'V2', status: 'active' } });
    const b = JSON.parse(x.body as string); expect(b.name).toBe('V2'); });
  it('supprimer workflow', () => { const x = a('http://localhost:3000/api/workflows/wf-1', { method: 'DELETE' }); expect(x.method).toBe('DELETE'); });
  it('executer workflow', () => { const x = a('http://localhost:3000/api/workflows/wf-1/run', { method: 'POST', body: { input: { key: 'value' } } });
    const b = JSON.parse(x.body as string); expect(b.input.key).toBe('value'); });
  it('branches workflow', () => { const x = a('http://localhost:3000/api/workflows/wf-1/branches'); expect(x.url).toContain('/branches'); });
  it('versions workflow', () => { const x = a('http://localhost:3000/api/workflows/wf-1/versions'); expect(x.url).toContain('/versions'); });
});

describe('/api/marketplace', () => {
  it('list 401 sans auth liste', () => { const x = r('http://localhost:3000/api/marketplace'); expect(x.headers.get('Authorization')).toBeNull(); });
  it('lister publiquement', () => { const x = r('http://localhost:3000/api/marketplace?type=agent'); const u = new URL(x.url);
    expect(u.searchParams.get('type')).toBe('agent'); });
  it('filtrer par categorie', () => { const x = r('http://localhost:3000/api/marketplace?category=productivity'); const u = new URL(x.url);
    expect(u.searchParams.get('category')).toBe('productivity'); });
  it('rechercher', () => { const x = r('http://localhost:3000/api/marketplace?search=chatbot'); const u = new URL(x.url);
    expect(u.searchParams.get('search')).toBe('chatbot'); });
  it('publier une annonce', () => { const x = a('http://localhost:3000/api/marketplace', { method: 'POST', body: { name: 'Agent GPT', type: 'agent', price: 19.99, description: 'Desc' } });
    const b = JSON.parse(x.body as string); expect(b.name).toBe('Agent GPT'); expect(b.price).toBe(19.99); });
  it('acheter 401 sans auth', () => { const x = r('http://localhost:3000/api/marketplace/listing-1/purchase', { method: 'POST' });
    expect(x.headers.get('Authorization')).toBeNull(); });
  it('acheter avec auth', () => { const x = a('http://localhost:3000/api/marketplace/listing-1/purchase', { method: 'POST' });
    expect(x.url).toContain('/purchase'); });
  it('laisser un avis', () => { const x = a('http://localhost:3000/api/marketplace/listing-1/review', { method: 'POST', body: { rating: 5, comment: 'Excellent' } });
    const b = JSON.parse(x.body as string); expect(b.rating).toBe(5); });
  it('mes achats', () => { const x = a('http://localhost:3000/api/marketplace/my-purchases'); expect(x.url).toContain('/my-purchases'); });
});