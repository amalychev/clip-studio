import axios from 'axios'

export const BASE_URL = 'http://127.0.0.1:8765'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,
})

// Projects
export const projectsApi = {
  list: () => api.get('/projects').then(r => r.data),
  get: (id: string) => api.get(`/projects/${id}`).then(r => r.data),
  create: (data: object) => api.post('/projects', data).then(r => r.data),
  update: (id: string, data: object) => api.patch(`/projects/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/projects/${id}`).then(r => r.data),
}

// Global settings (pre-fill keys)
export const settingsApi = {
  get: () => api.get('/settings').then(r => r.data),
  save: (data: object) => api.post('/settings', data).then(r => r.data),
}

// AI text preparation
export const aiApi = {
  prepare: (data: { text: string; provider: string; model: string; api_key: string; project_id: string }) =>
    api.post('/ai/prepare', data).then(r => r.data),
}

// TTS (runs in-process via Silero — no external service needed)
export const ttsApi = {
  generate: (data: { text: string; voice: string; project_id: string }) =>
    api.post('/tts/generate', data).then(r => r.data),
  voices: () => api.get('/tts/voices').then(r => r.data),
}

// Media
export const mediaApi = {
  uploadImages: (projectId: string, files: File[]) => {
    const form = new FormData()
    files.forEach(f => form.append('files', f))
    return api.post(`/media/images/${projectId}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  listImages: (projectId: string) => api.get(`/media/images/${projectId}`).then(r => r.data),
  deleteImage: (projectId: string, filename: string) =>
    api.delete(`/media/images/${projectId}/${filename}`).then(r => r.data),
  listMusic: () => api.get('/media/music').then(r => r.data),
  uploadMusic: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/media/music', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
}

// Subtitles
export const subtitleApi = {
  generate: (data: { text: string; duration: number; project_id: string }) =>
    api.post('/subtitles/generate', data).then(r => r.data),
  save: (data: { subtitles: object[]; project_id: string }) =>
    api.post('/subtitles/save', data).then(r => r.data),
}

// Video export (SSE stream)
export function createVideoExportStream(
  projectId: string,
  payload: object,
  onProgress: (data: { stage: string; percent: number; message: string; done: boolean; error?: string }) => void
): () => void {
  const url = `${BASE_URL}/video/export/${projectId}`

  api.post(url, payload).catch(() => {})

  const evtSource = new EventSource(`${BASE_URL}/video/progress/${projectId}`)
  evtSource.onmessage = (e) => {
    const data = JSON.parse(e.data)
    onProgress(data)
    if (data.done || data.error) evtSource.close()
  }
  evtSource.onerror = () => {
    onProgress({ stage: 'error', percent: 0, message: 'Ошибка соединения', done: true, error: 'connection' })
    evtSource.close()
  }
  return () => evtSource.close()
}
