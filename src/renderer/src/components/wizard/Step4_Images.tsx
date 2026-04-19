import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useWizardStore } from '../../stores/wizardStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { Textarea } from '../ui/Textarea'
import { Select } from '../ui/Select'
import { mediaApi, aiApi, BASE_URL } from '../../lib/api'
import { PROVIDER_LABELS } from '../../types'
import { HelpCircle, ArrowLeft, ArrowRight, UploadCloud, X, ArrowUpDown, Image, Info, Wand2, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const IMAGE_AI_PROVIDERS = ['openai', 'gemini'] as const

const IMAGE_MODELS = {
  openai: [
    { id: 'gpt-image-1.5', name: 'GPT Image 1.5' },
    { id: 'gpt-image-1-mini', name: 'GPT Image 1 Mini' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image' },
    { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview' },
  ],
} as const

export function Step4_Images() {
  const { images, audioDuration, projectId, preparedText, addImages, removeImage, reorderImages, nextStep, prevStep } = useWizardStore()
  const { apiKeys } = useSettingsStore()

  const recommended = audioDuration > 0 ? Math.max(1, Math.round(audioDuration / 4)) : null
  const perImage = recommended && images.length > 0 ? (audioDuration / images.length).toFixed(1) : null
  const tooFew = recommended && images.length > 0 && images.length < recommended - 1
  const tooMany = recommended && images.length > 0 && images.length > recommended + 2
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [imageProvider, setImageProvider] = useState<(typeof IMAGE_AI_PROVIDERS)[number]>('openai')
  const [imageModel, setImageModel] = useState<string>(IMAGE_MODELS.openai[0].id)
  const [imageDirection, setImageDirection] = useState('')
  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([])
  const availableImageProviders = IMAGE_AI_PROVIDERS.filter(provider => apiKeys[provider]?.trim())

  useEffect(() => {
    if (!imageDirection.trim() && preparedText.trim()) {
      setImageDirection('Современный кинематографичный стиль, выразительный свет, реалистичные детали, чистая композиция, без текста в кадре.')
    }
  }, [preparedText])

  useEffect(() => {
    if (!availableImageProviders.length) return
    if (!availableImageProviders.includes(imageProvider)) {
      const nextProvider = availableImageProviders[0]
      setImageProvider(nextProvider)
      setImageModel(IMAGE_MODELS[nextProvider][0].id)
    }
  }, [availableImageProviders, imageProvider])

  const modelOptions = IMAGE_MODELS[imageProvider]
  const providerKey = apiKeys[imageProvider]
  const generateCount = recommended ?? 1

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

  const handleGenerateImages = async () => {
    if (!projectId) return
    if (!providerKey) {
      toast.error(`Укажите API-ключ для ${PROVIDER_LABELS[imageProvider]} в настройках проекта`)
      return
    }
    if (!preparedText.trim()) {
      toast.error('Сначала подготовьте текст, чтобы система могла собрать scene-prompts')
      return
    }

    setGenerating(true)
    try {
      const res = await aiApi.generateImages({
        provider: imageProvider,
        model: imageModel,
        api_key: providerKey,
        project_id: projectId,
        source_text: preparedText,
        creative_direction: imageDirection,
        count: generateCount,
      })
      setGeneratedPrompts(res.prompts || [])
      addImages(res.images.map((img: any) => ({
        id: img.id,
        filename: img.filename,
        url: `${BASE_URL}/media/images/${projectId}/${img.filename}`,
        order: images.length + img.order,
      })))
      toast.success(`Сгенерировано ${res.images.length} изображений`)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Ошибка генерации изображений')
    } finally {
      setGenerating(false)
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
            <Tooltip content="Сначала LLM сгенерирует список сцен-промптов по содержанию текста, затем изображения будут созданы по ним по очереди. Повторный запуск обновит AI-сгенерированные файлы с теми же именами.">
              <HelpCircle size={14} className="text-muted" />
            </Tooltip>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Провайдер"
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
              label="Модель"
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

          <Textarea
            label="Визуальное направление"
            value={imageDirection}
            onChange={e => setImageDirection(e.target.value)}
            rows={6}
            hint={recommended
              ? `Система сначала соберёт ${generateCount} отдельных scene-prompts по смыслу текста, затем сгенерирует ${generateCount} изображений.`
              : 'Сначала сгенерируйте озвучку, чтобы система рассчитала рекомендованное количество кадров.'}
          />

          {generatedPrompts.length > 0 && (
            <div className="rounded-xl border border-border bg-surface-2/60 p-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Сгенерированные scene-prompts</p>
              {generatedPrompts.map((prompt, index) => (
                <div key={index} className="text-xs text-white/75 leading-relaxed">
                  {index + 1}. {prompt}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              AI-изображения сохраняются в проект с постоянными именами `generated_001`, `generated_002` и так далее.
            </p>
            <Button
              onClick={handleGenerateImages}
              loading={generating}
              disabled={!projectId || !recommended || !preparedText.trim()}
              icon={<Wand2 size={16} />}
              className="whitespace-nowrap"
            >
              {generating ? 'Генерация...' : `Сгенерировать ${generateCount} изображений`}
            </Button>
          </div>
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
                — по ~4 сек. на кадр (оптимально для восприятия).
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
