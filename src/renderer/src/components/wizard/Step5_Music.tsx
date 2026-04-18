import { useEffect, useRef, useState } from 'react'
import { useWizardStore } from '../../stores/wizardStore'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { mediaApi, BASE_URL } from '../../lib/api'
import type { MusicTrack } from '../../types'
import { HelpCircle, ArrowLeft, ArrowRight, Music2, Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { clsx } from 'clsx'

export function Step5_Music() {
  const { selectedMusicId, musicVolume, audioUrl, setMusic, setMusicVolume, nextStep, prevStep } = useWizardStore()
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const musicAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopAll = () => {
    musicAudioRef.current?.pause()
    ttsAudioRef.current?.pause()
    if (ttsTimerRef.current) clearTimeout(ttsTimerRef.current)
    setPlayingId(null)
  }

  useEffect(() => {
    mediaApi.listMusic().then(setTracks).catch(console.error)
    return () => stopAll()
  }, [])

  // Sync volume slider → music in real time (TTS stays at full volume)
  useEffect(() => {
    if (musicAudioRef.current) musicAudioRef.current.volume = musicVolume / 100
  }, [musicVolume])

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const togglePlay = (track: MusicTrack) => {
    if (playingId === track.id) {
      stopAll()
      return
    }
    stopAll()

    const music = new Audio(`${BASE_URL}/media/music/${track.id}`)
    music.volume = musicVolume / 100
    music.play()
    music.onended = () => setPlayingId(null)
    musicAudioRef.current = music
    setPlayingId(track.id)

    // After 1s start TTS in parallel so user hears the mix
    if (audioUrl) {
      ttsTimerRef.current = setTimeout(() => {
        const tts = new Audio(audioUrl)
        tts.volume = 1
        tts.play()
        ttsAudioRef.current = tts
      }, 2000)
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full animate-slide-up flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">Фоновая музыка</h2>
        <Tooltip content="Музыка будет воспроизводиться поверх речи с пониженной громкостью">
          <HelpCircle size={16} className="text-muted" />
        </Tooltip>
      </div>

      {/* Volume slider */}
      <div className="flex items-center gap-3">
        {musicVolume === 0 ? <VolumeX size={16} className="text-muted" /> : <Volume2 size={16} className="text-muted" />}
        <input
          type="range" min={0} max={100} value={musicVolume}
          onChange={e => setMusicVolume(Number(e.target.value))}
          className="flex-1 h-1.5 rounded-full accent-accent cursor-pointer"
        />
        <span className="text-sm text-muted w-10 text-right">{musicVolume}%</span>
      </div>

      {/* Track list */}
      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
        {/* No music option */}
        <Card
          hover
          active={selectedMusicId === null}
          onClick={() => { setMusic(null); stopAll() }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center">
              <VolumeX size={14} className="text-muted" />
            </div>
            <div>
              <p className="text-sm font-medium">Без музыки</p>
              <p className="text-xs text-muted">Только голос</p>
            </div>
            {selectedMusicId === null && <Badge variant="accent" className="ml-auto">Выбрано</Badge>}
          </div>
        </Card>

        {tracks.map(track => {
          const isPlaying = playingId === track.id
          return (
            <Card
              key={track.id}
              hover
              active={selectedMusicId === track.id}
              onClick={() => setMusic(track.id)}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={e => { e.stopPropagation(); togglePlay(track) }}
                  className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0',
                    isPlaying ? 'bg-accent text-white' : 'bg-surface-3 text-muted hover:text-white'
                  )}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{track.name}</p>
                  <p className="text-xs text-muted">{formatDuration(track.duration)}</p>
                </div>
                {selectedMusicId === track.id && <Badge variant="accent" className="shrink-0">Выбрано</Badge>}
              </div>
            </Card>
          )
        })}

        {tracks.length === 0 && (
          <div className="text-center py-8 text-sm text-muted flex flex-col items-center gap-2">
            <Music2 size={24} />
            Треки не найдены. Добавьте MP3-файлы в папку music/ бекенда.
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={prevStep} icon={<ArrowLeft size={16} />}>Назад</Button>
        <Button onClick={nextStep} icon={<ArrowRight size={16} />}>К субтитрам</Button>
      </div>
    </div>
  )
}
