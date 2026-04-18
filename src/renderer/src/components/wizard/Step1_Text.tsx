import { useWizardStore } from '../../stores/wizardStore'
import { Textarea } from '../ui/Textarea'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { HelpCircle, ArrowRight } from 'lucide-react'

export function Step1_Text() {
  const { rawText, setRawText, nextStep } = useWizardStore()

  return (
    <div className="max-w-2xl mx-auto w-full animate-slide-up">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-xl font-semibold">Исходный текст</h2>
        <Tooltip content="Вставьте любой текст — новость, статью, пресс-релиз. AI адаптирует его для озвучки.">
          <HelpCircle size={16} className="text-muted" />
        </Tooltip>
      </div>

      <Textarea
        value={rawText}
        onChange={e => setRawText(e.target.value)}
        placeholder="Вставьте текст новости или любого другого контента..."
        rows={16}
        className="text-base leading-relaxed"
        hint={`${rawText.length} символов · ${rawText.trim().split(/\s+/).filter(Boolean).length} слов`}
      />

      <div className="flex items-center justify-between mt-6">
        <p className="text-sm text-muted">
          На следующем шаге AI подготовит текст для синтеза речи
        </p>
        <Button
          onClick={nextStep}
          disabled={rawText.trim().length < 10}
          icon={<ArrowRight size={16} />}
        >
          Продолжить
        </Button>
      </div>
    </div>
  )
}
