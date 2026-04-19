import { useSettingsStore } from '../stores/settingsStore'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { BASE_URL, mediaApi } from '../lib/api'
import { AI_MODELS, PROVIDER_LABELS, TTS_VOICES, type AIProvider } from '../types'
import { Settings, Eye, EyeOff, ImagePlus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import toast from 'react-hot-toast'

const PROVIDERS = Object.keys(PROVIDER_LABELS) as AIProvider[]

export function SettingsPage() {
  const settings = useSettingsStore()
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const watermarkInputRef = useRef<HTMLInputElement>(null)
  const models = AI_MODELS.filter(m => m.provider === settings.defaultProvider)
  const defaultWatermarkUrl = useMemo(
    () => settings.defaultWatermark ? `${BASE_URL}/media/default-watermark/${settings.defaultWatermark}` : null,
    [settings.defaultWatermark]
  )

  const save = () => toast.success('Настройки сохранены (авто-сохранение включено)')

  const handleDefaultWatermarkSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const res = await mediaApi.uploadDefaultWatermark(file)
      settings.setDefaultWatermark(res.filename)
      toast.success('Глобальный watermark загружен')
    } catch {
      toast.error('Ошибка загрузки watermark')
    } finally {
      event.target.value = ''
    }
  }

  const handleDefaultWatermarkRemove = async () => {
    if (!settings.defaultWatermark) return
    try {
      await mediaApi.deleteDefaultWatermark(settings.defaultWatermark)
      settings.setDefaultWatermark('')
      toast.success('Глобальный watermark удалён')
    } catch {
      toast.error('Ошибка удаления watermark')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Settings size={16} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Глобальные настройки</h1>
            <p className="text-sm text-muted">Используются как значения по умолчанию для новых проектов</p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <section className="bg-surface-1 border border-border rounded-xl p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">AI по умолчанию</h2>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Провайдер"
                value={settings.defaultProvider}
                onChange={e => {
                  const p = e.target.value as AIProvider
                  settings.setDefaultProvider(p)
                  const first = AI_MODELS.find(m => m.provider === p)
                  if (first) settings.setDefaultModel(first.id)
                }}
                options={PROVIDERS.map(p => ({ value: p, label: PROVIDER_LABELS[p] }))}
              />
              <Select
                label="Модель"
                value={settings.defaultModel}
                onChange={e => settings.setDefaultModel(e.target.value)}
                options={models.map(m => ({ value: m.id, label: m.name }))}
              />
            </div>
          </section>

          <section className="bg-surface-1 border border-border rounded-xl p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">API Ключи</h2>
            {PROVIDERS.map(p => (
              <Input
                key={p}
                label={`${PROVIDER_LABELS[p]}`}
                type={showKeys[p] ? 'text' : 'password'}
                value={settings.apiKeys[p] || ''}
                onChange={e => settings.setApiKey(p, e.target.value)}
                placeholder={p === 'openai' ? 'sk-...' : p === 'anthropic' ? 'sk-ant-...' : '...'}
                suffix={
                  <button onClick={() => setShowKeys(s => ({ ...s, [p]: !s[p] }))} className="text-muted hover:text-white">
                    {showKeys[p] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                }
              />
            ))}
            <p className="text-xs text-muted">Ключи хранятся локально в зашифрованном localStorage</p>
          </section>

          <section className="bg-surface-1 border border-border rounded-xl p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">TTS (синтез речи)</h2>
            <div className="flex items-center gap-2 text-xs text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2">
              ✓ Silero v5 встроен — работает офлайн, без Docker и внешних сервисов
            </div>
            <Select
              label="Голос по умолчанию"
              value={settings.ttsVoice}
              onChange={e => settings.setTtsVoice(e.target.value)}
              options={TTS_VOICES.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))}
            />
          </section>

          <section className="bg-surface-1 border border-border rounded-xl p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Watermark по умолчанию</h2>
            <input
              ref={watermarkInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleDefaultWatermarkSelected}
            />
            <div className="flex items-center gap-3">
              <Button type="button" variant="secondary" icon={<ImagePlus size={16} />} onClick={() => watermarkInputRef.current?.click()}>
                Загрузить watermark
              </Button>
              {settings.defaultWatermark && (
                <Button type="button" variant="ghost" icon={<Trash2 size={16} />} onClick={handleDefaultWatermarkRemove}>
                  Удалить
                </Button>
              )}
            </div>
            {defaultWatermarkUrl ? (
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <img src={defaultWatermarkUrl} alt="Default watermark" className="h-16 w-auto object-contain" />
              </div>
            ) : (
              <p className="text-xs text-muted">Этот watermark будет автоматически подставляться в новые проекты, но его можно будет заменить или удалить в настройках проекта.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
