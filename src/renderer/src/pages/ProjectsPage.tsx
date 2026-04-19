import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Plus, FolderOpen, Trash2, Pencil, Calendar, Video } from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

interface Project {
  id: string
  name: string
  description?: string
  created_at: string
  step?: number
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(console.error)
  }, [])

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const project = await projectsApi.create({ name: name.trim(), description })
      setProjects(p => [project, ...p])
      setShowCreate(false)
      setName('')
      setDescription('')
      navigate(`/project/${project.id}/settings`)
    } catch {
      toast.error('Ошибка создания проекта')
    } finally {
      setLoading(false)
    }
  }

  const openEdit = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditProject(project)
    setEditName(project.name)
    setEditDescription(project.description || '')
  }

  const handleEdit = async () => {
    if (!editProject || !editName.trim()) return
    setEditLoading(true)
    try {
      const updated = await projectsApi.update(editProject.id, {
        name: editName.trim(),
        description: editDescription,
      })
      setProjects(p => p.map(pr => pr.id === editProject.id ? { ...pr, ...updated } : pr))
      setEditProject(null)
      toast.success('Проект обновлён')
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setEditLoading(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Удалить проект?')) return
    try {
      await projectsApi.delete(id)
      setProjects(p => p.filter(pr => pr.id !== id))
      toast.success('Проект удалён')
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Проекты</h1>
          <p className="text-sm text-muted mt-0.5">{projects.length} проектов</p>
        </div>
        {projects.length > 0 && (
          <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>
            Новый проект
          </Button>
        )}
      </div>

      {/* Edit modal */}
      {editProject && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-surface-1 border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-up">
            <h2 className="text-lg font-semibold mb-4">Редактировать проект</h2>
            <div className="flex flex-col gap-4">
              <Input
                label="Название"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEdit()}
                autoFocus
              />
              <Input
                label="Описание (необязательно)"
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                placeholder="Краткое описание"
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setEditProject(null)}>Отмена</Button>
              <Button onClick={handleEdit} loading={editLoading} disabled={!editName.trim()}>
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-surface-1 border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-up">
            <h2 className="text-lg font-semibold mb-4">Новый проект</h2>
            <div className="flex flex-col gap-4">
              <Input
                label="Название"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Например: Новости за апрель"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <Input
                label="Описание (необязательно)"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Краткое описание"
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Отмена</Button>
              <Button onClick={handleCreate} loading={loading} disabled={!name.trim()}>
                Создать
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Projects grid */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted">
          <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
            <Video size={28} />
          </div>
          <div className="text-center">
            <p className="font-medium text-white/70">Нет проектов</p>
            <p className="text-sm mt-1">Создайте первый проект для начала работы</p>
          </div>
          <Button onClick={() => setShowCreate(true)} icon={<Plus size={16} />}>
            Создать проект
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => navigate(`/project/${project.id}/workspace`)}
              className="group bg-surface-1 border border-border rounded-xl p-5 hover:border-accent/50 hover:bg-surface-2 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                  <FolderOpen size={18} className="text-accent" />
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => openEdit(project, e)}
                    className="p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-white transition-all"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(project.id, e)}
                    className="p-1.5 rounded-lg hover:bg-danger/20 text-muted hover:text-danger transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-white truncate">{project.name}</h3>
              {project.description && (
                <p className="text-sm text-muted mt-1 truncate">{project.description}</p>
              )}
              <div className="flex items-center gap-2 mt-4">
                <Calendar size={12} className="text-muted" />
                <span className="text-xs text-muted">
                  {new Date(project.created_at).toLocaleDateString('ru-RU')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
