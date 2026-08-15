'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MarketplaceTab, MarketplaceItem, InstalledItem, CreatorForm, ItemType } from './types';

export function MarketplaceView({ userId }: { userId: string }) {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>('loops');
  const [items, setItems] = useState<Record<ItemType, MarketplaceItem[]>>({ skill: [], loop: [], customization: [] });
  const [installed, setInstalled] = useState<InstalledItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [skillFilter, setSkillFilter] = useState('all');
  const [agentId, setAgentId] = useState<string>('');
  const [form, setForm] = useState<CreatorForm>({
    type: 'loop', name: '', slug: '', description: '', icon: '🔄',
    price: 0, category: 'analysis', tags: '', level: 'intermediate',
    compatibleModels: '', config: '{}',
  });

  const fetchMarketplace = useCallback(async (type: ItemType) => {
    try {
      const res = await fetch(`/api/skills?scope=marketplace&type=${type}s`);
      const data = await res.json();
      if (data.success) setItems(prev => ({ ...prev, [type]: data.items }));
    } catch {}
  }, []);

  const fetchInstalled = useCallback(async () => {
    if (!agentId) return;
    try {
      const [skillsRes, loopsRes] = await Promise.all([
        fetch(`/api/skills?scope=installed&type=skills&agentId=${agentId}`),
        fetch(`/api/skills?scope=installed&type=loops&agentId=${agentId}`),
      ]);
      const [skillsData, loopsData] = await Promise.all([skillsRes.json(), loopsRes.json()]);
      const all: InstalledItem[] = [];
      if (skillsData.success) skillsData.items.forEach((i: any) => all.push({ id: i.id, itemId: i.skillId, name: i.skill?.name || '', icon: i.skill?.icon || '🧩', type: 'skill', enabled: i.enabled, config: i.config, createdAt: i.createdAt }));
      if (loopsData.success) loopsData.items.forEach((i: any) => all.push({ id: i.id, itemId: i.loopId, name: i.loop?.name || '', icon: i.loop?.icon || '🔄', type: 'loop', enabled: i.enabled, config: i.config, createdAt: i.createdAt }));
      setInstalled(all);
    } catch {}
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([fetchMarketplace('skill'), fetchMarketplace('loop'), fetchMarketplace('customization')]);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchMarketplace]);
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => { if (!cancelled) try { await fetchInstalled(); } catch {} })();
    return () => { cancelled = true; };
  }, [agentId, fetchInstalled]);

  const install = useCallback(async (type: ItemType, itemId: string) => {
    if (!agentId && type !== 'customization') { alert('Selectionnez un agent'); return; }
    const action = type === 'skill' ? 'install-skill' : type === 'loop' ? 'install-loop' : 'apply-customization';
    const body: any = { [type === 'skill' ? 'skillId' : type === 'loop' ? 'loopId' : 'customizationId']: itemId };
    if (type !== 'customization') body.agentId = agentId;
    const res = await fetch(`/api/skills?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    alert(data.message || 'Erreur');
    if (data.success) fetchInstalled();
  }, [agentId, fetchInstalled]);

  const uninstall = useCallback(async (itemId: string, type: ItemType) => {
    const res = await fetch('/api/skills?action=uninstall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, type }) });
    const data = await res.json();
    if (data.success) fetchInstalled();
  }, [fetchInstalled]);

  const createItem = useCallback(async () => {
    const res = await fetch('/api/skills?action=create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    alert(data.success ? 'Cree avec succes !' : data.error);
    if (data.success) fetchMarketplace(form.type);
  }, [form, fetchMarketplace]);

  const tabs: { key: MarketplaceTab; label: string; icon: string }[] = [
    { key: 'loops', label: 'Boucles IA', icon: '🔄' },
    { key: 'skills', label: 'Competences', icon: '🧩' },
    { key: 'customizations', label: 'Personnalisations', icon: '🎨' },
    { key: 'installed', label: 'Installés', icon: '📦' },
    { key: 'creator', label: 'Createur', icon: '✏️' },
  ];

  const categories = ['all', 'analysis', 'code', 'research', 'writing', 'reasoning', 'creative', 'automation'];

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted-foreground)' }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>🧩 Gen3ia Marketplace</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '.8rem', margin: '2px 0 0' }}>Boucles IA · Competences · Personnalisations</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={agentId} onChange={e => setAgentId(e.target.value)} style={{ padding: '6px 10px', background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.8rem' }}>
            <option value="">Selectionner un agent...</option>
            <option value="agent1">Assistant Pro</option>
            <option value="agent2">Codeur Auto</option>
          </select>
          <span style={{ background: 'var(--muted)', padding: '4px 10px', borderRadius: 'var(--radius)', fontSize: '.75rem', border: '1px solid var(--border)' }}>📦 {installed.length} installés</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              background: activeTab === t.key ? 'var(--primary)' : 'transparent',
              color: activeTab === t.key ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              border: 'none', padding: '8px 16px', borderRadius: 'var(--radius)',
              fontSize: '.875rem', fontWeight: 500, cursor: 'pointer',
            }}
          >{t.icon} {t.label}</button>
        ))}
      </div>

      {/* Boucles IA */}
      {activeTab === 'loops' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {items.loop.filter(i => i.status === 'published').map(loop => (
            <ItemCard key={loop.id} item={loop} type="loop" onInstall={install} />
          ))}
        </div>
      )}

      {/* Competences */}
      {activeTab === 'skills' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {categories.map(c => (
              <button key={c} onClick={() => setSkillFilter(c)}
                style={{
                  background: skillFilter === c ? 'var(--primary)' : 'var(--muted)',
                  color: skillFilter === c ? 'var(--primary-foreground)' : 'var(--foreground)',
                  padding: '4px 12px', borderRadius: 999, fontSize: '.75rem',
                  border: 'none', cursor: 'pointer',
                }}
              >{c === 'all' ? 'Toutes' : c}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {items.skill.filter(s => s.status === 'published' && (skillFilter === 'all' || s.category === skillFilter)).map(skill => (
              <SkillCard key={skill.id} item={skill} onInstall={install} />
            ))}
          </div>
        </>
      )}

      {/* Personnalisations */}
      {activeTab === 'customizations' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {items.customization.filter(c => c.status === 'published').map(cust => (
            <div key={cust.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>{cust.icon}</div>
              <h3 style={{ fontWeight: 600, fontSize: '.95rem', margin: 0 }}>{cust.name}</h3>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '.78rem', margin: '4px 0 8px' }}>{cust.description}</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ background: 'var(--muted)', padding: '2px 8px', borderRadius: 4, fontSize: '.65rem' }}>{cust.tags?.[0] || cust.type}</span>
                <PriceBadge price={cust.price} isFree={cust.isFree} />
              </div>
              <button onClick={() => install('customization', cust.id)}
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', padding: '8px 20px', borderRadius: 'var(--radius)', fontSize: '.8rem', cursor: 'pointer' }}>
                {cust.isFree ? '🎨 Appliquer' : '📥 Acquérir'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Installes */}
      {activeTab === 'installed' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>📦 Installations</h3>
            <span style={{ color: 'var(--muted-foreground)', fontSize: '.8rem' }}>{installed.length} items</span>
          </div>
          {installed.length === 0 && (
            <p style={{ color: 'var(--muted-foreground)', fontSize: '.85rem', textAlign: 'center', padding: 20 }}>
              Aucun item installé. Allez dans l'onglet Boucles ou Compétences pour installer.
            </p>
          )}
          {installed.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{item.icon}</span>
                <div>
                  <span style={{ fontWeight: 500, fontSize: '.85rem' }}>{item.name}</span>
                  <span style={{ color: 'var(--muted-foreground)', fontSize: '.7rem', marginLeft: 8 }}>
                    {item.enabled ? 'Activé' : 'Désactivé'} · {item.type}
                  </span>
                </div>
              </div>
              <button onClick={() => uninstall(item.id, item.type)}
                style={{ background: 'var(--destructive)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 'var(--radius)', fontSize: '.7rem', cursor: 'pointer' }}>
                🗑️ Désinstaller
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Createur */}
      {activeTab === 'creator' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 4px' }}>✏️ Creer et publier</h3>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '.8rem', margin: '0 0 16px' }}>Creez vos propres items et publiez-les sur le marketplace.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: '.8rem', color: 'var(--muted-foreground)' }}>Type
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as ItemType })}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.875rem' }}>
                <option value="loop">🔄 Boucle IA</option>
                <option value="skill">🧩 Competence</option>
                <option value="customization">🎨 Personnalisation</option>
              </select>
            </label>
            <label style={{ fontSize: '.8rem', color: 'var(--muted-foreground)' }}>Nom
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                placeholder="ex: Super analyseur"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.875rem' }} />
            </label>
            <label style={{ fontSize: '.8rem', color: 'var(--muted-foreground)', gridColumn: '1/-1' }}>Description
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
                placeholder="Description de votre creation..."
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.875rem', resize: 'vertical' }} />
            </label>
            <label style={{ fontSize: '.8rem', color: 'var(--muted-foreground)' }}>Prix (crédits)
              <input type="number" value={form.price} onChange={e => setForm({ ...form, price: parseInt(e.target.value) || 0 })}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.875rem' }} />
            </label>
            <label style={{ fontSize: '.8rem', color: 'var(--muted-foreground)' }}>Tags (séparés par virgule)
              <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
                placeholder="react, reflexion, base"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.875rem' }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={createItem}
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', padding: '10px 24px', borderRadius: 'var(--radius)', fontSize: '.875rem', fontWeight: 600, cursor: 'pointer' }}>
              💾 Creer le brouillon
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sous-composants
// ============================================================

function PriceBadge({ price, isFree }: { price: number; isFree: boolean }) {
  if (isFree) return <span style={{ background: 'var(--success)', color: '#fff', padding: '2px 8px', borderRadius: 999, fontSize: '.65rem', fontWeight: 600 }}>GRATUIT</span>;
  return <span style={{ background: 'var(--warning)', color: '#fff', padding: '2px 8px', borderRadius: 999, fontSize: '.65rem', fontWeight: 600 }}>{price} crédits</span>;
}

function ItemCard({ item, type, onInstall }: { item: MarketplaceItem; type: ItemType; onInstall: (t: ItemType, id: string) => void }) {
  const config = typeof item.config === 'string' ? JSON.parse(item.config || '{}') : item.config;
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <span style={{ fontSize: '1.5rem', marginRight: 8 }}>{item.icon}</span>
          <span style={{ fontWeight: 600, fontSize: '.95rem' }}>{item.name}</span>
          {item.isOfficial && <span style={{ background: 'var(--muted)', fontSize: '.65rem', padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}>Officiel</span>}
        </div>
        <PriceBadge price={item.price} isFree={item.isFree} />
      </div>
      <p style={{ color: 'var(--muted-foreground)', fontSize: '.78rem', margin: '6px 0 10px', lineHeight: 1.4 }}>{item.description}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {item.tags?.slice(0, 3).map(t => (
          <span key={t} style={{ background: 'var(--background)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 999, fontSize: '.65rem' }}>{t}</span>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--muted-foreground)', fontSize: '.7rem' }}>
          ⚡ {config?.maxIterations && `${config.maxIterations} itérations`}
          {config?.temperature && ` · 🌡️ ${config.temperature}`}
          {!config?.maxIterations && item.installCount > 0 && `★ ${item.rating} · ${item.installCount}k`}
        </span>
        <button onClick={() => onInstall(type, item.id)}
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', padding: '6px 16px', borderRadius: 'var(--radius)', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer' }}>
          {item.isFree ? '📥 Installer' : '📥 Acheter'}
        </button>
      </div>
      <div style={{ position: 'absolute', top: 8, right: 8, fontSize: '.65rem', color: 'var(--muted-foreground)' }}>★ {item.rating} · {item.installCount}</div>
    </div>
  );
}

function SkillCard({ item, onInstall }: { item: MarketplaceItem; onInstall: (t: ItemType, id: string) => void }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ fontSize: '2rem' }}>{item.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '.9rem' }}>
          {item.name} <PriceBadge price={item.price} isFree={item.isFree} />
        </div>
        <p style={{ color: 'var(--muted-foreground)', fontSize: '.75rem', margin: '2px 0' }}>{item.description}</p>
// @ts-ignore — type narrowing pending, see refactor ticket
        {(item.compatibleModels?.length ?? 0) > 0 && (
          <div style={{ fontSize: '.65rem', color: 'var(--muted-foreground)', marginTop: 4 }}>
// @ts-ignore — type narrowing pending, see refactor ticket
            ✅ {(item.compatibleModels ?? []).join(' · ')}
          </div>
        )}
      </div>
      <button onClick={() => onInstall('skill', item.id)}
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', padding: '6px 12px', borderRadius: 'var(--radius)', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {item.isFree ? '📥 Installer' : '📥 Acheter'}
      </button>
    </div>
  );
}
