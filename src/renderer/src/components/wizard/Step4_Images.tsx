import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useWizardStore } from '../../stores/wizardStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { Textarea } from '../ui/Textarea'
import { Select } from '../ui/Select'
import { mediaApi, aiApi, BASE_URL } from '../../lib/api'
import { AI_MODELS, PROVIDER_LABELS, type AIProvider } from '../../types'
import { HelpCircle, ArrowLeft, ArrowRight, UploadCloud, X, ArrowUpDown, Image, Info, Wand2, AlertCircle, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const IMAGE_AI_PROVIDERS = ['openai', 'gemini'] as const

const IMAGE_MODELS = {
  openai: [
    { id: 'gpt-image-1', name: 'GPT Image 1' },
    { id: 'dall-e-3', name: 'DALL-E 3' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image' },
  ],
} as const

const DEFAULT_DIRECTION =
  '9:16 вертикальные пропорции. Без текста, надписей и логотипов в кадре. ' +
  'Реализм: фотографическое качество, естественное освещение, кинематографический кадр, ' +
  'глубина резкости, детализированные текстуры, натуральные цвета.'

export function Step4_Images() {
  const { images, audioDuration, projectId, preparedText, selectedProvider, selectedModel, addImages, setImages, removeImage, reorderImages, nextStep, prevStep } = useWizardStore()
  const { apiKeys, defaultProvider, defaultModel } = useSettingsStore()

  const recommended = audioDuration > 0 ? Math.max(1, Math.round(audioDuration / 4)) : null
  const perImage = recommended && images.length > 0 ? (audioDuration / images.length).toFixed(1) : null
  const tooFew = recommended && images.length > 0 && images.length < recommended - 1
  const tooMany = recommended && images.length > 0 && images.length > recommended + 2
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [promptProvider, setPromptProvider] = useState<AIProvider>(selectedProvider || defaultProvider)
  const [promptModel, setPromptModel] = useState<string>(selectedModel || defaultModel)
  const [promptLoading, setPromptLoading] = useState(false)
  const [imageProvider, setImageProvider] = useState<(typeof IMAGE_AI_PROVIDERS)[number]>('openai')
  const [imageModel, setImageModel] = useState<string>(IMAGE_MODELS.openai[0].id)
  const [imageDirection, setImageDirection] = useState('')
  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([])
  const [generateCount, setGenerateCount] = useState<number>(recommended ?? 1)
  const [countTouched, setCountTouched] = useState(false)
  const [generatingSlots, setGeneratingSlots] = useState<Set<number>>(new Set())
  const availableImageProviders = IMAGE_AI_PROVIDERS.filter(provider => apiKeys[provider]?.trim())

  useEffect(() => {
    if (!imageDirection.trim() && preparedText.trim()) {
      setImageDirection(DEFAULT_DIRECTION)
    }
  }, [preparedText])

  useEffect(() => {
    if (!countTouched) {
      setGenerateCount(recommended ?? 1)
    }
  }, [recommended, countTouched])

  useEffect(() => {
    if (!availableImageProviders.length) return
    if (!availableImageProviders.includes(imageProvider)) {
      const nextProvider = availableImageProviders[0]
      setImageProvider(nextProvider)
      setImageModel(IMAGE_MODELS[nextProvider][0].id)
    }
  }, [availableImageProviders, imageProvider])

  useEffect(() => {
    const availableModels = AI_MODELS.filter(m => m.provider === promptProvider)
    if (!availableModels.some(m => m.id === promptModel)) {
      setPromptModel(availableModels[0]?.id || '')
    }
  }, [promptProvider, promptModel])

  const modelOptions = IMAGE_MODELS[imageProvider]
  const promptModelOptions = AI_MODELS.filter(m => m.provider === promptProvider)
  const providerKey = apiKeys[imageProvider]
  const promptProviderKey = apiKeys[promptProvider]
  const effectiveGenerateCount = Math.max(1, Math.min(99, generateCount || 1))

  const hasGeneratedImage = (index: number) => {
    const slot = String(index + 1).padStart(3, '0')
    return images.some(img => img.filename.includes(`_generated_${slot}`))
  }

  const updatePrompt = (index: number, value: string) => {
    setGeneratedPrompts(prev => prev.map((p, i) => i === index ? value : p))
  }

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!projectId || !accepted.length) return
    setUploading(true)
    try {
      const res = await mediaApi.uploadImages(projectId, accepted)
      addImages(res.images.map((img: any) => ({
        id: img.id,
        filename: img.filename,
        url: `${BASE_URL}/media/images/${projectId}/${img.filename}`,
        order: images.length + img.order,
      })))
      toast.success(`Загружено ${res.images.length} изображений`)
    } catch {
      toast.error('Ошибка загрузки изображений')
    } finally {
      setUploading(false)
    }
  }, [projectId, images.length, addImages])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    disabled: uploading,
  })

  const handleDragStart = (index: number) => setDragging(index)
  const handleDragEnter = (index: number) => setDragOver(index)
  const handleDrop = (targetIndex: number) => {
    if (dragging === null || dragging === targetIndex) return
    const newOrder = [...images]
    const [moved] = newOrder.splice(dragging, 1)
    newOrder.splice(targetIndex, 0, moved)
    reorderImages(newOrder.map((img, i) => ({ ...img, order: i })))
    setDragging(null)
    setDragOver(null)
  }

  const handleGeneratePrompts = async () => {
    if (!projectId) return
    if (!promptProviderKey) {
      toast.error(`Укажите API-ключ для ${PROVIDER_LABELS[promptProvider]} в настройках проекта`)
      return
    }
    if (!preparedText.trim()) {
      toast.error('Сначала подготовьте текст, чтобы система могла собрать scene-prompts')
      return
    }

    setPromptLoading(true)
    try {
      const res = await aiApi.generateImagePrompts({
        provider: promptProvider,
        model: promptModel,
        api_key: promptProviderKey,
        project_id: projectId,
        source_text: preparedText,
        creative_direction: imageDirection,
        count: effectiveGenerateCount,
      })
      setGeneratedPrompts(res.prompts || [])
      toast.success(`Сгенерировано ${res.prompts?.length || 0} промптов`)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Ошибка генерации промптов')
    } finally {
      setPromptLoading(false)
    }
  }

  const handleGenerateSingleImage = async (index: number) => {
    if (!projectId) return
    if (!providerKey) {
      toast.error(`Укажите API-ключ для ${PROVIDER_LABELS[imageProvider]} в настройках проекта`)
      return
    }
    const prompt = generatedPrompts[index]
    if (!prompt?.trim()) {
      toast.error('Промпт не может быть пустым')
      return
    }

    setGeneratingSlots(prev => new Set(prev).add(index))
    try {
      const slot = index + 1
      const result = await aiApi.generateSingleImage({
        provider: imageProvider,
        model: imageModel,
        api_key: providerKey,
        project_id: projectId,
        prompt,
        slot,
      })
      const newImg = {
        id: result.filename,
        filename: result.filename,
        url: `${BASE_URL}/media/images/${projectId}/${result.filename}`,
        order: result.order,
      }
      const slotStr = String(slot).padStart(3, '0')
      const withoutOld = images.filter(img => !img.filename.includes(`_generated_${slotStr}`))
      setImages([...withoutOld, newImg].map((img, i) => ({ ...img, order: i })))
      toast.success('Изображение создано')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Ошибка генерации изображения')
    } finally {
      setGeneratingSlots(prev => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

  return (
    <div className="max-w-3xl mx-auto w-full animate-slide-up flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">Изображения</h2>
        <Tooltip content="Порядок изображений определяет последовательность кадров в видео. Перетащите для изменения порядка.">
          <HelpCircle size={16} className="text-muted" />
        </Tooltip>
        {images.length > 0 && (
          <span className="ml-auto text-sm text-muted">{images.length} файлов</span>
        )}
      </div>

      {availableImageProviders.length > 0 && (
        <section className="bg-surface-1 border border-border rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">AI-генерация изображений</h3>
            <Tooltip content="LLM сгенерирует список сцен-промптов, вы можете отредактировать каждый, затем создать изображения по одному или перегенерировать отдельные.">
              <HelpCircle size={14} className="text-muted" />
            </Tooltip>
          </div>

          {/* Image generation provider — first, as it's the main choice */}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Провайдер изображений"
              value={imageProvider}
              onChange={e => {
                const provider = e.target.value as (typeof IMAGE_AI_PROVIDERS)[number]
                setImageProvider(provider)
                setImageModel(IMAGE_MODELS[provider][0].id)
              }}
              options={availableImageProviders.map(provider => ({
                value: provider,
                label: PROVIDER_LABELS[provider],
              }))}
            />
            <Select
              label="Модель изображений"
              value={imageModel}
              onChange={e => setImageModel(e.target.value)}
              options={modelOptions.map(model => ({ value: model.id, label: model.name }))}
            />
          </div>

          {!providerKey && (
            <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} />
              API-ключ для {PROVIDER_LABELS[imageProvider]} не задан. Добавьте его в настройках проекта.
            </div>
          )}

          {/* Prompt LLM — secondary choice */}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Провайдер для промптов"
              value={promptProvider}
              onChange={e => {
                const provider = e.target.value as AIProvider
                setPromptProvider(provider)
                const first = AI_MODELS.find(m => m.provider === provider)
                if (first) setPromptModel(first.id)
              }}
              options={(Object.keys(PROVIDER_LABELS) as AIProvider[]).map(provider => ({
                value: provider,
                label: PROVIDER_LABELS[provider],
              }))}
            />
            <Select
              label="Модель"
              value={promptModel}
              onChange={e => setPromptModel(e.target.value)}
              options={promptModelOptions.map(model => ({ value: model.id, label: model.name }))}
            />
          </div>

          {/* Style direction — no label */}
          <Textarea
            value={imageDirection}
            onChange={e => setImageDirection(e.target.value)}
            rows={4}
            placeholder={DEFAULT_DIRECTION}
          />

          {/* Count + generate prompts */}
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={99}
              value={effectiveGenerateCount}
              onChange={e => {
                setCountTouched(true)
                setGenerateCount(Math.max(1, Math.min(99, Number(e.target.value) || 1)))
              }}
              className="w-20 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <span className="text-sm text-muted">
              промптов{recommended ? ` (рекомендуется ${recommended})` : ''}
            </span>
            <Button
              type="button"
              onClick={handleGeneratePrompts}
              loading={promptLoading}
              icon={<Wand2 size={14} />}
              disabled={!projectId || !preparedText.trim() || !promptModel}
              className="ml-auto"
            >
              Сгенерировать промпты
            </Button>
          </div>

          {/* Editable prompts with per-prompt image generation */}
          {generatedPrompts.length > 0 && (
            <div className="flex flex-col gap-3 pt-1">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Промпты — отредактируйте и создайте изображения</p>
              {generatedPrompts.map((prompt, index) => (
                <div key={index} className="flex gap-3 items-start">
                  <div className="flex-1">
                    <Textarea
                      value={prompt}
                      onChange={e => updatePrompt(index, e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleGenerateSingleImage(index)}
                    loading={generatingSlots.has(index)}
                    disabled={!providerKey}
                    icon={hasGeneratedImage(index) ? <RefreshCw size={13} /> : <Image size={13} />}
                    className="shrink-0 mt-0.5"
                  >
                    {hasGeneratedImage(index) ? 'Перегенерировать' : 'Создать'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer',
          isDragActive ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50 hover:bg-surface-2'
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud size={28} className={clsx('mx-auto mb-3', isDragActive ? 'text-accent' : 'text-muted')} />
        <p className="text-sm text-white/80 font-medium">
          {isDragActive ? 'Отпустите для загрузки' : 'Перетащите изображения или кликните'}
        </p>
        <p className="text-xs text-muted mt-1">JPG, PNG, WebP</p>
      </div>

      {/* Recommendation */}
      {recommended && (
        <div className={clsx(
          'flex items-start gap-2.5 px-4 py-3 rounded-lg border text-sm transition-colors',
          tooFew ? 'bg-warning/8 border-warning/25 text-warning' :
          tooMany ? 'bg-warning/8 border-warning/25 text-warning' :
          'bg-surface-2 border-border text-muted'
        )}>
          <Info size={15} className="shrink-0 mt-0.5" />
          <div>
            {images.length === 0 ? (
              <>
                Для аудио <span className="text-white font-medium">{Math.floor(audioDuration / 60)}:{String(Math.floor(audioDuration % 60)).padStart(2,'0')}</span> рекомендуется загрузить{' '}
                <span className="text-white font-medium">{recommended} фото</span>{' '}
                — по ~4 сек. на кадр.
              </>
            ) : tooFew ? (
              <>
                Маловато: при {images.length} фото каждый кадр будет{' '}
                <span className="font-medium">{perImage} сек.</span> — слишком долго. Рекомендуется {recommended}.
              </>
            ) : tooMany ? (
              <>
                Много фото: каждый кадр будет{' '}
                <span className="font-medium">{perImage} сек.</span> — слишком быстро. Рекомендуется {recommended}.
              </>
            ) : (
              <>
                Отлично — {images.length} фото, по <span className="text-white font-medium">{perImage} сек.</span> на кадр.
              </>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {images.map((img, index) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(index)}
              onDragEnd={() => { setDragging(null); setDragOver(null) }}
              className={clsx(
                'relative group rounded-lg overflow-hidden border transition-all aspect-square',
                dragOver === index ? 'border-accent scale-105' : 'border-border',
                dragging === index && 'opacity-50'
              )}
            >
              <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <ArrowUpDown size={18} className="text-white cursor-grab" />
                <button
                  onClick={() => removeImage(img.id)}
                  className="p-1 rounded-md bg-danger/80 hover:bg-danger text-white"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1.5 rounded">
                {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length === 0 && !isDragActive && (
        <div className="text-center py-4 text-sm text-muted flex items-center justify-center gap-2">
          <Image size={16} />
          Добавьте хотя бы одно изображение
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={prevStep} icon={<ArrowLeft size={16} />}>Назад</Button>
        <Button onClick={nextStep} disabled={images.length === 0} icon={<ArrowRight size={16} />}>
          К музыке
        </Button>
      </div>
    </div>
  )
}
