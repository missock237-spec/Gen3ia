'use client';

import React, { useState, useEffect } from 'react';
import {
  Globe,
  Languages,
  Plus,
  Trash2,
  Check,
  Sparkles,
  RefreshCw,
  Sliders,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import {
  SupportedLanguage,
  LanguageProfile,
  DetectionResult,
} from '@/lib/agent-i18n';

export interface LanguageSettingsProps {
  userId: string;
}

interface LanguageOption {
  code: SupportedLanguage;
  label: string;
  nativeLabel: string;
  flag: string;
  isRtl?: boolean;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: SupportedLanguage.FR, label: 'French', nativeLabel: 'Français', flag: '🇫🇷' },
  { code: SupportedLanguage.EN, label: 'English', nativeLabel: 'English', flag: '🇬🇧' },
  { code: SupportedLanguage.AR, label: 'Arabic', nativeLabel: 'العربية', flag: '🇸🇦', isRtl: true },
  { code: SupportedLanguage.SW, label: 'Swahili', nativeLabel: 'Kiswahili', flag: '🇰🇪' },
  { code: SupportedLanguage.WO, label: 'Wolof', nativeLabel: 'Wolof', flag: '🇸🇳' },
  { code: SupportedLanguage.BM, label: 'Bambara', nativeLabel: 'Bamanankan', flag: '🇲🇱' },
];

export function LanguageSettings({ userId }: LanguageSettingsProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSavedSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Profile Form State
  const [preferredLanguage, setPreferredLanguage] = useState<SupportedLanguage>(
    SupportedLanguage.FR
  );
  const [fallbackLanguage, setFallbackLanguage] = useState<SupportedLanguage>(
    SupportedLanguage.EN
  );
  const [autoDetect, setAutoDetect] = useState<boolean>(true);
  const [agentOverrides, setAgentOverrides] = useState<Record<string, SupportedLanguage>>({});

  // Agent Override Form State
  const [newAgentId, setNewAgentId] = useState<string>('');
  const [newAgentLang, setNewAgentLang] = useState<SupportedLanguage>(SupportedLanguage.FR);

  // Interactive Detector Test State
  const [testText, setTestText] = useState<string>('');
  const [detecting, setDetecting] = useState<boolean>(false);
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);

  // Load language profile on mount
  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/agent-i18n?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) throw new Error('Failed to load profile');
        const data: LanguageProfile = await res.json();

        setPreferredLanguage(data.preferredLanguage || SupportedLanguage.FR);
        setFallbackLanguage(data.fallbackLanguage || SupportedLanguage.EN);
        setAutoDetect(data.autoDetect !== undefined ? data.autoDetect : true);
        setAgentOverrides(data.agentOverrides || {});
      } catch (err) {
        setError('Unable to load language preferences. Using default settings.');
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      loadProfile();
    }
  }, [userId]);

  // Save profile changes
  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    setSavedSuccess(false);

    const isRtl = preferredLanguage === SupportedLanguage.AR;

    const payload = {
      userId,
      preferredLanguage,
      fallbackLanguage,
      autoDetect,
      agentOverrides,
      rtl: isRtl,
    };

    try {
      const res = await fetch('/api/agent-i18n', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to save profile');

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save language settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Add agent override
  const handleAddOverride = () => {
    const trimmedId = newAgentId.trim();
    if (!trimmedId) return;

    setAgentOverrides((prev) => ({
      ...prev,
      [trimmedId]: newAgentLang,
    }));

    setNewAgentId('');
  };

  // Remove agent override
  const handleRemoveOverride = (agentId: string) => {
    setAgentOverrides((prev) => {
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
  };

  // Run language detection test
  const handleTestDetection = async () => {
    if (!testText.trim()) return;
    setDetecting(true);
    setDetectionResult(null);

    try {
      const res = await fetch('/api/agent-i18n/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText }),
      });

      if (!res.ok) throw new Error('Detection failed');
      const data: DetectionResult = await res.json();
      setDetectionResult(data);
    } catch (err) {
      // Ignore test error or show inline
    } finally {
      setDetecting(false);
    }
  };

  const isCurrentRtl = preferredLanguage === SupportedLanguage.AR;

  if (loading) {
    return (
      <div className="bg-card border rounded-lg p-6 flex items-center justify-center space-x-3 text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading language preferences...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-card border rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                Multi-Language Agent Responses (i18n)
              </h2>
              <p className="text-sm text-muted-foreground">
                Configure preferred languages, automatic language detection, and agent overrides for African and global markets.
              </p>
            </div>
          </div>

          {/* RTL Badge if Arabic is active */}
          {isCurrentRtl && (
            <div className="flex items-center space-x-2 bg-amber-500/10 text-amber-600 border border-amber-500/20 px-3 py-1.5 rounded-full text-xs font-semibold">
              <span className="text-sm">🇸🇦</span>
              <span>RTL Mode Active (Right-To-Left)</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg flex items-center space-x-2 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-lg flex items-center space-x-2 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Language settings updated successfully!</span>
        </div>
      )}

      {/* Main Settings Card */}
      <div className="bg-card border rounded-lg p-6 space-y-6 shadow-sm">
        <div className="flex items-center space-x-2 text-lg font-semibold text-foreground border-b pb-3">
          <Languages className="w-5 h-5 text-primary" />
          <h3>General Language Preferences</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Preferred Language */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground block">
              Preferred Response Language
            </label>
            <select
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value as SupportedLanguage)}
              className="w-full bg-secondary border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.flag} {opt.nativeLabel} ({opt.label})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Agents will default to replying in this language when auto-detect is off or uncertain.
            </p>
          </div>

          {/* Fallback Language */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground block">
              Fallback Language
            </label>
            <select
              value={fallbackLanguage}
              onChange={(e) => setFallbackLanguage(e.target.value as SupportedLanguage)}
              className="w-full bg-secondary border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.flag} {opt.nativeLabel} ({opt.label})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Used if preferred language processing or detection fails.
            </p>
          </div>
        </div>

        {/* Auto-Detect Toggle */}
        <div className="flex items-center justify-between p-4 bg-secondary/50 border rounded-lg">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                Automatic Language Detection
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Automatically detect the user's language from input messages (French, English, Arabic, Swahili, Wolof, Bambara) and respond in the same language.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoDetect}
              onChange={(e) => setAutoDetect(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {/* RTL Alert Box if Arabic is Preferred */}
        {isCurrentRtl && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 rounded-lg text-sm space-y-1">
            <div className="font-semibold flex items-center space-x-2">
              <span>🇸🇦 RTL Text Direction Enabled</span>
            </div>
            <p className="text-xs">
              Arabic uses Right-to-Left formatting. Agent interface components will align text from right to left accordingly when rendering Arabic responses.
            </p>
          </div>
        )}
      </div>

      {/* Per-Agent Overrides */}
      <div className="bg-card border rounded-lg p-6 space-y-6 shadow-sm">
        <div className="flex items-center space-x-2 text-lg font-semibold text-foreground border-b pb-3">
          <Sliders className="w-5 h-5 text-primary" />
          <h3>Per-Agent Language Overrides</h3>
        </div>

        <p className="text-sm text-muted-foreground">
          Force specific AI Agents to always respond in a designated language, ignoring global preferences or auto-detection.
        </p>

        {/* Add Override Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="text"
            placeholder="Agent ID (e.g. agent-sales, support-agent)"
            value={newAgentId}
            onChange={(e) => setNewAgentId(e.target.value)}
            className="flex-1 bg-secondary border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />

          <select
            value={newAgentLang}
            onChange={(e) => setNewAgentLang(e.target.value as SupportedLanguage)}
            className="bg-secondary border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.flag} {opt.nativeLabel}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleAddOverride}
            disabled={!newAgentId.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Add Override</span>
          </button>
        </div>

        {/* Overrides Table / List */}
        {Object.keys(agentOverrides).length === 0 ? (
          <div className="text-center py-6 border border-dashed rounded-lg text-sm text-muted-foreground">
            No agent overrides configured yet.
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(agentOverrides).map(([agentId, langCode]) => {
              const langOpt = LANGUAGE_OPTIONS.find((opt) => opt.code === langCode);
              return (
                <div
                  key={agentId}
                  className="flex items-center justify-between p-3 bg-secondary/40 border rounded-lg text-sm"
                >
                  <div className="flex items-center space-x-3">
                    <span className="font-mono font-medium text-foreground bg-muted px-2 py-0.5 rounded text-xs">
                      {agentId}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium flex items-center space-x-1.5 text-foreground">
                      <span>{langOpt?.flag}</span>
                      <span>{langOpt?.nativeLabel || langCode}</span>
                      <span className="text-xs text-muted-foreground">({langOpt?.label})</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveOverride(agentId)}
                    className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                    title="Remove Override"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Language Detector Tester */}
      <div className="bg-card border rounded-lg p-6 space-y-4 shadow-sm">
        <div className="flex items-center space-x-2 text-lg font-semibold text-foreground border-b pb-3">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3>Interactive Language Detector Tester</h3>
        </div>

        <p className="text-sm text-muted-foreground">
          Type or paste text in French, English, Arabic, Swahili, Wolof, or Bambara to test real-time detection heuristics.
        </p>

        <div className="space-y-3">
          <textarea
            rows={3}
            placeholder="e.g. Bonjour comment allez-vous? / Habari gani rafiki? / Nanga def waaw / I ni sogoma / مرحبا بك"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="w-full bg-secondary border text-foreground rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />

          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2 text-xs">
              <span
                onClick={() => setTestText('Bonjour, comment ça va aujourd\'hui?')}
                className="cursor-pointer bg-muted hover:bg-muted/80 px-2 py-1 rounded text-muted-foreground"
              >
                🇫🇷 French sample
              </span>
              <span
                onClick={() => setTestText('Habari yako, asante sana rafiki')}
                className="cursor-pointer bg-muted hover:bg-muted/80 px-2 py-1 rounded text-muted-foreground"
              >
                🇰🇪 Swahili sample
              </span>
              <span
                onClick={() => setTestText('Nanga def, jaajaf lool')}
                className="cursor-pointer bg-muted hover:bg-muted/80 px-2 py-1 rounded text-muted-foreground"
              >
                🇸🇳 Wolof sample
              </span>
              <span
                onClick={() => setTestText('I ni sogoma, anitché bamanankan')}
                className="cursor-pointer bg-muted hover:bg-muted/80 px-2 py-1 rounded text-muted-foreground"
              >
                🇲🇱 Bambara sample
              </span>
              <span
                onClick={() => setTestText('مرحبا بك كيف حالك اليوم')}
                className="cursor-pointer bg-muted hover:bg-muted/80 px-2 py-1 rounded text-muted-foreground"
              >
                🇸🇦 Arabic sample
              </span>
            </div>

            <button
              type="button"
              onClick={handleTestDetection}
              disabled={detecting || !testText.trim()}
              className="bg-secondary hover:bg-secondary/80 text-foreground border px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5 disabled:opacity-50"
            >
              {detecting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-primary" />
              )}
              <span>Detect</span>
            </button>
          </div>

          {detectionResult && (
            <div className="p-4 bg-secondary/40 border rounded-lg space-y-2 mt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Detected Language:</span>
                {(() => {
                  const match = LANGUAGE_OPTIONS.find(
                    (o) => o.code === detectionResult.detectedLanguage
                  );
                  return (
                    <span className="font-semibold text-foreground flex items-center space-x-1.5">
                      <span>{match?.flag}</span>
                      <span>{match?.nativeLabel} ({match?.label})</span>
                      <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-mono ml-2">
                        {Math.round(detectionResult.confidence * 100)}% confidence
                      </span>
                    </span>
                  );
                })()}
              </div>

              {detectionResult.alternatives && detectionResult.alternatives.length > 0 && (
                <div className="text-xs border-t pt-2 mt-2 space-y-1">
                  <span className="text-muted-foreground block">Alternative matches:</span>
                  <div className="flex flex-wrap gap-2">
                    {detectionResult.alternatives.map((alt) => {
                      const opt = LANGUAGE_OPTIONS.find((o) => o.code === alt.language);
                      return (
                        <span
                          key={alt.language}
                          className="bg-background border px-2 py-0.5 rounded text-muted-foreground flex items-center space-x-1"
                        >
                          <span>{opt?.flag}</span>
                          <span>{opt?.label}:</span>
                          <span className="font-mono">{Math.round(alt.confidence * 100)}%</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Save Settings Footer Action */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSaveProfile}
          disabled={saving}
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2.5 rounded-md text-sm font-semibold transition-colors flex items-center space-x-2 shadow-sm disabled:opacity-50"
        >
          {saving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          <span>{saving ? 'Saving...' : 'Save Language Preferences'}</span>
        </button>
      </div>
    </div>
  );
}
