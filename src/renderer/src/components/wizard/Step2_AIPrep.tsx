import { useState } from 'react'
import { useWizardStore } from '../../stores/wizardStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { Textarea } from '../ui/Textarea'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { Badge } from '../ui/Badge'
import { aiApi } from '../../lib/api'
import { AI_MODELS, PROVIDER_LABELS, type AIProvider } from '../../types'
import { HelpCircle, Wand2, ArrowLeft, ArrowRight, AlertCircle, ClipboardCopy } from 'lucide-react'
import toast from 'react-hot-toast'

export function Step2_AIPrep() {
  const { rawText, preparedText, selectedProvider, selectedModel, projectId,
    setPreparedText, setProvider, setModel, nextStep, prevStep } = useWizardStore()
  const { apiKeys } = useSettingsStore()
  const [loading, setLoading] = useState(false)

  const providers = Object.keys(PROVIDER_LABELS) as AIProvider[]
  const models = AI_MODELS.filter(m => m.provider === selectedProvider)

  const handleGenerate = async () => {
    const key = apiKeys[selectedProvider]
    if (!key) {
      toast.error(`Укажите API-ключ для ${PROVIDER_LABELS[selectedProvider]} в настройках проекта`)
      return
    }
    if (!projectId) return

    setLoading(true)
    try {
      const res = await aiApi.prepare({
        text: rawText,
        provider: selectedProvider,
        model: selectedModel,
        api_key: key,
        project_id: projectId,
      })
      setPreparedText(res.prepared_text)
      toast.success('Текст успешно подготовлен')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Ошибка при обращении к AI')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto w-full animate-slide-up flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">Подготовка текста для озвучки</h2>
        <Tooltip content="AI уберёт лишние символы, расставит паузы и адаптирует текст для синтеза речи">
          <HelpCircle size={16} className="text-muted" />
        </Tooltip>
      </div>

      {/* Provider / model selectors */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Select
            label="AI-провайдер"
            value={selectedProvider}
            onChange={e => {
              const p = e.target.value as AIProvider
              setProvider(p)
              const first = AI_MODELS.find(m => m.provider === p)
              if (first) setModel(first.id)
            }}
            options={providers.map(p => ({ value: p, label: PROVIDER_LABELS[p] }))}
          />
        </div>
        <div className="flex-1">
          <Select
            label="Модель"
            value={selectedModel}
            onChange={e => setModel(e.target.value)}
            options={models.map(m => ({ value: m.id, label: m.name }))}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={handleGenerate} loading={loading} icon={<Wand2 size={16} />}>
            Сгенерировать
          </Button>
        </div>
      </div>

      {!apiKeys[selectedProvider] && (
        <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2.5">
          <AlertCircle size={14} />
          API-ключ для {PROVIDER_LABELS[selectedProvider]} не задан. Перейдите в <strong>настройки проекта</strong>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Textarea
          label="Исходный текст"
          value={rawText}
          readOnly
          rows={14}
          className="opacity-60 text-sm"
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white/80">Подготовленный текст</label>
            {preparedText && <Badge variant="success">Готово</Badge>}
          </div>
          {!preparedText ? (
            <div className="relative">
              <textarea
                value={preparedText}
                onChange={e => setPreparedText(e.target.value)}
                rows={14}
                placeholder="Нажмите «Сгенерировать» или введите текст вручную..."
                className="w-full bg-surface-2 border border-border rounded-lg text-sm text-white placeholder-muted px-3 py-2.5 resize-none focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                <button
                  onClick={() => setPreparedText(rawText)}
                  className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-3 border border-border hover:border-accent hover:text-accent text-sm text-muted transition-colors"
                >
                  <ClipboardCopy size={14} />
                  Перенести исходный текст
                </button>
                <span className="text-xs text-muted/50">или сгенерируйте через AI выше</span>
              </div>
            </div>
          ) : (
            <textarea
              value={preparedText}
              onChange={e => setPreparedText(e.target.value)}
              rows={14}
              className="w-full bg-surface-2 border border-border rounded-lg text-sm text-white placeholder-muted px-3 py-2.5 resize-none focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={prevStep} icon={<ArrowLeft size={16} />}>Назад</Button>
        <Button onClick={nextStep} disabled={!preparedText.trim()} icon={<ArrowRight size={16} />}>
          К озвучке
        </Button>
      </div>
    </div>
  )
}
