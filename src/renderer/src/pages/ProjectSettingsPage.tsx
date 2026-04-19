import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { projectsApi, mediaApi, BASE_URL } from '../lib/api'
import { useSettingsStore } from '../stores/settingsStore'
import { useWizardStore } from '../stores/wizardStore'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Tooltip } from '../components/ui/Tooltip'
import { AI_MODELS, PROVIDER_LABELS, TTS_VOICES, type AIProvider } from '../types'
import { Settings, Eye, EyeOff, HelpCircle, ArrowRight, ChevronLeft, ImagePlus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const PROVIDERS = Object.keys(PROVIDER_LABELS) as AIProvider[]

export function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const settings = useSettingsStore()
  const wizard = useWizardStore()
  const watermarkInputRef = useRef<HTMLInputElement>(null)

  const [projectName, setProjectName] = useState('')
  const [watermarkFilename, setWatermarkFilename] = useState<string | null>(null)
  const [ttsVoice, setTtsVoice] = useState(settings.ttsVoice)
  const [provider, setProvider] = useState<AIProvider>(settings.defaultProvider)
  const [model, setModel] = useState(settings.defaultModel)
  const [apiKeys, setApiKeys] = useState({ ...settings.apiKeys })
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [isNew, setIsNew] = useState(false)

  useEffect(() => {
    if (!projectId) return
    projectsApi.get(projectId).then(p => {
      setProjectName(p.name)
      const data = p.data || {}
      if (data.watermarkFilename) setWatermarkFilename(data.watermarkFilename)
      if (data.ttsVoice) setTtsVoice(data.ttsVoice)
      if (data.provider) setProvider(data.provider)
      if (data.model) setModel(data.model)
      if (data.apiKeys) setApiKeys({ ...settings.apiKeys, ...data.apiKeys })
      setIsNew(!p.data?.configured)
    }).catch(console.error)
  }, [projectId])

  const models = AI_MODELS.filter(m => m.provider === provider)
  const watermarkUrl = useMemo(
    () => watermarkFilename && projectId ? `${BASE_URL}/media/watermark/${projectId}/${watermarkFilename}` : null,
    [projectId, watermarkFilename]
  )

  const handleWatermarkSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!projectId || !file) return
    try {
      const res = await mediaApi.uploadWatermark(projectId, file)
      setWatermarkFilename(res.filename)
      toast.success('Логотип загружен')
    } catch {
      toast.error('Ошибка загрузки логотипа')
    } finally {
      event.target.value = ''
    }
  }

  const handleWatermarkRemove = async () => {
    if (!projectId || !watermarkFilename) return
    try {
      await mediaApi.deleteWatermark(projectId, watermarkFilename)
      setWatermarkFilename(null)
      toast.success('Логотип удалён')
    } catch {
      toast.error('Ошибка удаления логотипа')
    }
  }

  const handleSave = async () => {
    if (!projectId) return
    setSaving(true)
    try {
      await projectsApi.update(projectId, {
        name: projectName,
        data: {
          configured: true,
          watermarkFilename,
          ttsVoice,
          provider,
          model,
          apiKeys,
        },
      })
      // Persist globally for pre-fill
      settings.setDefaultProvider(provider)
      settings.setDefaultModel(model)
      settings.setTtsVoice(ttsVoice)
      Object.entries(apiKeys).forEach(([p, k]) => settings.setApiKey(p as AIProvider, k))

      // Init wizard
      wizard.reset()
      wizard.setProject(projectId)
      wizard.setProvider(provider)
      wizard.setModel(model)
      wizard.setWatermark(watermarkFilename, watermarkFilename ? `${BASE_URL}/media/watermark/${projectId}/${watermarkFilename}` : null)

      toast.success('Настройки сохранены')
      navigate(`/project/${projectId}/workspace`)
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const toggleShowKey = (p: string) => setShowKeys(s => ({ ...s, [p]: !s[p] }))

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-surface-2 text-muted">
            <ChevronLeft size={18} />
          </button>
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Settings size={16} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Настройки проекта</h1>
            {isNew && <Badge variant="accent" className="mt-0.5">Новый проект</Badge>}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Project info */}
          <section className="bg-surface-1 border border-border rounded-xl p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Проект</h2>
            <Input
              label="Название проекта"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
            />
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-white/80">Логотип / watermark</label>
              <input
                ref={watermarkInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleWatermarkSelected}
              />
              <div className="flex items-center gap-3">
                <Button type="button" variant="secondary" icon={<ImagePlus size={16} />} onClick={() => watermarkInputRef.current?.click()}>
                  Загрузить логотип
                </Button>
                {watermarkFilename && (
                  <Button type="button" variant="ghost" icon={<Trash2 size={16} />} onClick={handleWatermarkRemove}>
                    Удалить
                  </Button>
                )}
              </div>
              {watermarkUrl ? (
                <div className="rounded-xl border border-border bg-surface-2 p-4">
                  <img src={watermarkUrl} alt="Watermark" className="h-16 w-auto object-contain" />
                </div>
              ) : (
                <p className="text-xs text-muted">Картинка будет показана в правом верхнем углу превью и итогового видео.</p>
              )}
            </div>
          </section>

          {/* AI settings */}
          <section className="bg-surface-1 border border-border rounded-xl p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">AI-модель</h2>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Провайдер"
                value={provider}
                onChange={e => {
                  const p = e.target.value as AIProvider
                  setProvider(p)
                  const first = AI_MODELS.find(m => m.provider === p)
                  if (first) setModel(first.id)
                }}
                options={PROVIDERS.map(p => ({ value: p, label: PROVIDER_LABELS[p] }))}
              />
              <Select
                label="Модель"
                value={model}
                onChange={e => setModel(e.target.value)}
                options={models.map(m => ({ value: m.id, label: m.name }))}
              />
            </div>

            {/* API keys */}
            <div className="flex flex-col gap-3">
              {PROVIDERS.map(p => (
                <Input
                  key={p}
                  label={`${PROVIDER_LABELS[p]} API Key`}
                  type={showKeys[p] ? 'text' : 'password'}
                  value={apiKeys[p] || ''}
                  onChange={e => setApiKeys(k => ({ ...k, [p]: e.target.value }))}
                  placeholder={p === 'openai' ? 'sk-...' : p === 'anthropic' ? 'sk-ant-...' : `${p}-...`}
                  suffix={
                    <button onClick={() => toggleShowKey(p)} className="text-muted hover:text-white">
                      {showKeys[p] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  }
                />
              ))}
              <p className="text-xs text-muted">API-ключи хранятся локально и не передаются третьим лицам</p>
            </div>
          </section>

          {/* TTS settings */}
          <section className="bg-surface-1 border border-border rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">TTS (синтез речи)</h2>
              <Tooltip content="Silero v5 работает встроенно — не требует Docker или внешних сервисов. Модель (~100MB) загружается при первом использовании.">
                <HelpCircle size={14} className="text-muted" />
              </Tooltip>
            </div>
            <div className="flex items-center gap-2 text-xs text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2">
              ✓ Silero TTS встроен — работает офлайн, без Docker
            </div>
            <Select
              label="Голос по умолчанию"
              value={ttsVoice}
              onChange={e => setTtsVoice(e.target.value)}
              options={TTS_VOICES.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))}
            />
          </section>

          <Button onClick={handleSave} loading={saving} size="lg" icon={<ArrowRight size={16} />} className="w-full justify-center">
            {isNew ? 'Сохранить и начать' : 'Сохранить настройки'}
          </Button>
        </div>
      </div>
    </div>
  )
}
