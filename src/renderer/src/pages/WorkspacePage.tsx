import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useWizardStore } from '../stores/wizardStore'
import { StepIndicator } from '../components/wizard/StepIndicator'
import { Step1_Text } from '../components/wizard/Step1_Text'
import { Step2_AIPrep } from '../components/wizard/Step2_AIPrep'
import { Step3_Audio } from '../components/wizard/Step3_Audio'
import { Step4_Images } from '../components/wizard/Step4_Images'
import { Step5_Music } from '../components/wizard/Step5_Music'
import { Step6_Subtitles } from '../components/wizard/Step6_Subtitles'
import { Step7_Preview } from '../components/wizard/Step7_Preview'
import { Step8_Export } from '../components/wizard/Step8_Export'
import { projectsApi } from '../lib/api'

const STEP_COMPONENTS = [
  null,
  Step1_Text,
  Step2_AIPrep,
  Step3_Audio,
  Step4_Images,
  Step5_Music,
  Step6_Subtitles,
  Step7_Preview,
  Step8_Export,
]

export function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { currentStep, setStep, projectId: storedId } = useWizardStore()

  useEffect(() => {
    if (!projectId || projectId === storedId) return

    const { reset, restoreState } = useWizardStore.getState()
    reset()

    projectsApi.get(projectId)
      .then(project => restoreState(projectId, project.data || {}))
      .catch(() => restoreState(projectId, {}))
  }, [projectId])

  const StepComponent = STEP_COMPONENTS[currentStep]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <StepIndicator current={currentStep} onStepClick={setStep} />

      <div className="flex-1 overflow-y-auto p-8">
        {StepComponent ? <StepComponent /> : null}
      </div>
    </div>
  )
}
