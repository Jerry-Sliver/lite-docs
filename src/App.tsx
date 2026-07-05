import { useEffect, useMemo, useRef, useState } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import type { PartialBlock } from '@blocknote/core'
import '@blocknote/mantine/style.css'
import './App.css'

type DocNode = {
  id: string
  libraryId: string
  parentId: string | null
  title: string
  emoji: string
  description?: string
  cover?: string
  isDraft?: boolean
  content: PartialBlock[]
  sortOrder: number
  createdAt: string
  updatedAt: string
}

type ProjectLibrary = {
  id: string
  title: string
  description: string
  cover: string
  hidden?: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

type Template = {
  id: string
  name: string
  description: string
  emoji: string
  content: PartialBlock[]
  custom?: boolean
  sourceDocId?: string
}

type AppState = {
  activeDocId: string
  openDocIds: string[]
  libraries: ProjectLibrary[]
  docs: DocNode[]
  customTemplates: Template[]
}

type MenuState = {
  docId: string
  x: number
  y: number
  placement: 'top' | 'bottom'
}

type LibraryDialogState = {
  mode: 'create' | 'edit'
  libraryId?: string
  title: string
  description: string
}

const STORAGE_KEY = 'light-docs-workspace-v1'
const INBOX_LIBRARY_ID = 'lib-inbox'

const now = () => new Date().toISOString()

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const getCoverStyle = (cover: string) => {
  const value = cover || 'linear-gradient(135deg, #f4e3ca, #caa978)'
  if (value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('http')) {
    return { backgroundImage: `url("${value}")` }
  }
  return { background: value }
}

const compressCoverImage = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const maxSide = 900
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')

      if (!context) {
        reject(new Error('无法处理封面图片。'))
        return
      }

      canvas.width = width
      canvas.height = height
      context.drawImage(image, 0, 0, width, height)
      const mimeType = canvas.toDataURL('image/webp', 0.82).startsWith('data:image/webp')
        ? 'image/webp'
        : 'image/jpeg'
      resolve(canvas.toDataURL(mimeType, 0.82))
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('图片读取失败，请换一张图片试试。'))
    }

    image.src = objectUrl
  })

const paragraph = (text: string): PartialBlock => ({
  type: 'paragraph',
  content: text,
})

const heading = (text: string, level = 2): PartialBlock => ({
  type: 'heading',
  props: { level },
  content: text,
})

const bullet = (text: string): PartialBlock => ({
  type: 'bulletListItem',
  content: text,
})

const templates: Template[] = [
  {
    id: 'blank',
    name: '空白文档',
    description: '快速记录想法、会议、提示词或分镜。',
    emoji: '□',
    content: [paragraph('')],
  },
  {
    id: 'prompt-project',
    name: 'AI 提示词工程',
    description: '保存目标、变量、模板和最终提示词。',
    emoji: '✦',
    content: [
      heading('AI 提示词工程', 1),
      paragraph('目标：'),
      bullet('使用场景：'),
      bullet('输入变量：'),
      bullet('输出格式：'),
      heading('提示词正文'),
      paragraph('你是一名 {角色}，请根据 {背景} 完成 {任务}。'),
    ],
  },
  {
    id: 'storyboard',
    name: '分镜文档',
    description: '用于把镜头、画面、旁白和生成提示词放在一起。',
    emoji: '▦',
    content: [
      heading('分镜文档', 1),
      paragraph('项目说明：'),
      heading('镜头 001'),
      bullet('画面：'),
      bullet('镜头运动：'),
      bullet('台词/旁白：'),
      bullet('AI 生成提示词：'),
    ],
  },
  {
    id: 'daily',
    name: '每日工作页',
    description: '轻量记录任务、想法和待处理内容。',
    emoji: '◇',
    content: [
      heading('每日工作页', 1),
      heading('今天要推进'),
      bullet(''),
      heading('灵感/素材'),
      paragraph(''),
      heading('明天继续'),
      bullet(''),
    ],
  },
]

const seedState: AppState = {
  activeDocId: 'doc-welcome',
  openDocIds: ['doc-welcome', 'doc-prompt'],
  customTemplates: [],
  libraries: [
    {
      id: INBOX_LIBRARY_ID,
      title: '未归档',
      description: '系统自动收纳未保存和外部打开的文档。',
      cover: 'linear-gradient(135deg, #f6e4c5, #c9ad83)',
      hidden: true,
      sortOrder: -1,
      createdAt: now(),
      updatedAt: now(),
    },
  ],
  docs: [
    {
      id: 'doc-welcome',
      libraryId: INBOX_LIBRARY_ID,
      parentId: null,
      title: '轻文档使用说明',
      emoji: '□',
      sortOrder: 2,
      createdAt: now(),
      updatedAt: now(),
      content: [
        heading('轻文档', 1),
        paragraph('这是一个本地优先的轻量文档工具原型，目标是保留飞书 Docs 的顺手体验，去掉云端协作和重型加载。'),
        bullet('左侧是多级文档树，可以快速切换。'),
        bullet('顶部标签可以在多个已打开文档之间来回跳。'),
        bullet('右侧模板可以一键新建预设文档。'),
        bullet('内容保存在浏览器本地，下一阶段会包成 Tauri 桌面应用。'),
      ],
    },
    {
      id: 'doc-prompt',
      libraryId: INBOX_LIBRARY_ID,
      parentId: null,
      title: '提示词工程模板',
      emoji: '✦',
      sortOrder: 0,
      createdAt: now(),
      updatedAt: now(),
      content: templates[1].content,
    },
    {
      id: 'doc-shot',
      libraryId: INBOX_LIBRARY_ID,
      parentId: null,
      title: '广告片分镜草稿',
      emoji: '▦',
      sortOrder: 0,
      createdAt: now(),
      updatedAt: now(),
      content: templates[2].content,
    },
  ],
}

function cloneBlocks(blocks: PartialBlock[]) {
  return JSON.parse(JSON.stringify(blocks)) as PartialBlock[]
}

function normalizeLibraries(rawLibraries: Partial<ProjectLibrary>[] | undefined): ProjectLibrary[] {
  if (rawLibraries?.length) {
    const libraries = rawLibraries.map((library, index) => ({
      id: library.id || uid('lib'),
      title: library.title || '未命名项目库',
      description: library.description || '',
      cover: library.cover || 'linear-gradient(135deg, #f4e3ca, #caa978)',
      hidden: Boolean(library.hidden),
      sortOrder: typeof library.sortOrder === 'number' ? library.sortOrder : index,
      createdAt: library.createdAt || now(),
      updatedAt: library.updatedAt || now(),
    }))
    if (!libraries.some((library) => library.id === INBOX_LIBRARY_ID)) {
      libraries.unshift({
        id: INBOX_LIBRARY_ID,
        title: '未归档',
        description: '系统自动收纳未保存和外部打开的文档。',
        cover: 'linear-gradient(135deg, #f6e4c5, #c9ad83)',
        hidden: true,
        sortOrder: -1,
        createdAt: now(),
        updatedAt: now(),
      })
    }
    return libraries
  }

  return [
    {
      id: INBOX_LIBRARY_ID,
      title: '未归档',
      description: '系统自动收纳未保存和外部打开的文档。',
      cover: 'linear-gradient(135deg, #f4e3ca, #caa978)',
      hidden: true,
      sortOrder: 0,
      createdAt: now(),
      updatedAt: now(),
    },
  ]
}

function normalizeDocs(rawDocs: Array<Partial<DocNode> & { type?: string }>, libraries: ProjectLibrary[]): DocNode[] {
  const inboxLibraryId = libraries.find((library) => library.hidden)?.id || INBOX_LIBRARY_ID
  const fallbackLibraryId = libraries.find((library) => !library.hidden)?.id || inboxLibraryId
  const legacyContainerIds = new Set(['folder-workspace', 'folder-ai', 'folder-video', 'doc-workspace', 'doc-ai', 'doc-video'])
  return rawDocs.filter((doc) => !legacyContainerIds.has(doc.id || '')).map((doc, index) => ({
    id: doc.id || uid('doc'),
    libraryId: doc.libraryId || (doc.isDraft ? inboxLibraryId : fallbackLibraryId),
    parentId:
      doc.parentId === 'folder-workspace'
        ? null
        : doc.parentId === 'folder-ai'
          ? null
          : doc.parentId === 'folder-video'
            ? null
            : doc.parentId === 'doc-workspace'
              ? null
              : doc.parentId || null,
    title: doc.title || '未命名文档',
    emoji: doc.emoji || '□',
    description: doc.description || '',
    cover: doc.cover || '',
    isDraft: Boolean(doc.isDraft),
    content: doc.content?.length
      ? cloneBlocks(doc.content)
      : [heading(doc.title || '未命名文档', 1), paragraph('')],
    sortOrder: typeof doc.sortOrder === 'number' ? doc.sortOrder : index,
    createdAt: doc.createdAt || now(),
    updatedAt: doc.updatedAt || now(),
  }))
}

function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return seedState

  try {
    const parsed = JSON.parse(raw) as AppState
    const libraries = normalizeLibraries(parsed.libraries)
    const docs = Array.isArray(parsed.docs) ? normalizeDocs(parsed.docs, libraries) : seedState.docs
    const firstDoc = docs[0]
    const activeDocId = docs.some((doc) => doc.id === parsed.activeDocId)
      ? parsed.activeDocId
      : firstDoc?.id || ''

    return {
      libraries,
      docs,
      activeDocId,
      openDocIds: Array.isArray(parsed.openDocIds)
        ? parsed.openDocIds.filter((id) => docs.some((doc) => doc.id === id))
        : activeDocId
          ? [activeDocId]
          : [],
      customTemplates: Array.isArray(parsed.customTemplates) ? parsed.customTemplates : [],
    }
  } catch {
    return seedState
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function EditorCanvas({
  doc,
  onChange,
}: {
  doc: DocNode
  onChange: (blocks: PartialBlock[]) => void
}) {
  const editor = useCreateBlockNote({
    initialContent: doc.content?.length ? cloneBlocks(doc.content) : [paragraph('')],
  })

  return (
    <BlockNoteView
      editor={editor}
      theme="light"
      onChange={() => onChange(cloneBlocks(editor.document))}
    />
  )
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [menuState, setMenuState] = useState<MenuState | null>(null)
  const [moveDocId, setMoveDocId] = useState<string | null>(null)
  const [selectedMoveLibraryId, setSelectedMoveLibraryId] = useState<string>(INBOX_LIBRARY_ID)
  const [selectedMoveParentId, setSelectedMoveParentId] = useState<string | null>(null)
  const [moveQuery, setMoveQuery] = useState('')
  const [libraryDialog, setLibraryDialog] = useState<LibraryDialogState | null>(null)
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null)
  const editorWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      console.error('保存到本地存储失败，可能是封面或文档内容过大。', error)
      window.alert('本地存储空间不足，刚才的内容可能没有保存。建议换一张更小的封面，或删除不需要的大图封面。')
    }
  }, [state])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('.node-menu') || target.closest('.tree-action')) return
      setMenuState(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuState(null)
        setMoveDocId(null)
        setLibraryDialog(null)
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const activeDoc = state.docs.find((doc) => doc.id === state.activeDocId)
  const openDocs = state.openDocIds
    .map((id) => state.docs.find((doc) => doc.id === id))
    .filter(Boolean) as DocNode[]
  const allTemplates = useMemo(() => [...templates, ...state.customTemplates], [state.customTemplates])
  const libraries = useMemo(
    () => [...state.libraries].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN')),
    [state.libraries],
  )
  const visibleLibraries = useMemo(() => libraries.filter((library) => !library.hidden), [libraries])
  const inboxLibraryId = libraries.find((library) => library.hidden)?.id || INBOX_LIBRARY_ID

  const filteredDocs = useMemo(() => {
    const value = query.trim().toLowerCase()
    const archivedDocs = state.docs.filter((doc) => !doc.isDraft)
    if (!value) return archivedDocs
    const matches = new Set<string>()

    archivedDocs.forEach((doc) => {
      if (doc.title.toLowerCase().includes(value)) {
        let current: DocNode | undefined = doc
        while (current) {
          matches.add(current.id)
          current = state.docs.find((item) => item.id === current?.parentId)
        }
      }
    })

    return archivedDocs.filter((doc) => matches.has(doc.id))
  }, [query, state.docs])

  const childMap = useMemo(() => {
    return filteredDocs.reduce<Record<string, DocNode[]>>((map, doc) => {
      const parentKey = doc.parentId || `lib:${doc.libraryId}`
      map[parentKey] ||= []
      map[parentKey].push(doc)
      map[parentKey].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'))
      return map
    }, {})
  }, [filteredDocs])

  const moveTargets = useMemo(() => {
    if (!moveDocId) return []
    const blockedIds = new Set([moveDocId, ...collectChildIds(moveDocId, state.docs)])
    const value = moveQuery.trim().toLowerCase()
    const archivedDocs = state.docs.filter((doc) => !doc.isDraft)
    if (!value) return archivedDocs.filter((doc) => !blockedIds.has(doc.id))

    const matchedIds = new Set<string>()
    archivedDocs.forEach((doc) => {
      if (blockedIds.has(doc.id) || !doc.title.toLowerCase().includes(value)) return
      let current: DocNode | undefined = doc
      while (current && !blockedIds.has(current.id)) {
        matchedIds.add(current.id)
        current = state.docs.find((item) => item.id === current?.parentId)
      }
    })
    return archivedDocs.filter((doc) => matchedIds.has(doc.id))
  }, [moveDocId, moveQuery, state.docs])

  const moveChildMap = useMemo(() => {
    return moveTargets.reduce<Record<string, DocNode[]>>((map, doc) => {
      const parentKey = doc.parentId || `lib:${doc.libraryId}`
      map[parentKey] ||= []
      map[parentKey].push(doc)
      map[parentKey].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'))
      return map
    }, {})
  }, [moveTargets])

  const recentDocs = useMemo(
    () => [...state.docs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 12),
    [state.docs],
  )
  const draftDocs = useMemo(() => state.docs.filter((doc) => doc.isDraft), [state.docs])

  const updateDoc = (id: string, patch: Partial<DocNode>) => {
    setState((current) => ({
      ...current,
      docs: current.docs.map((doc) =>
        doc.id === id ? { ...doc, ...patch, updatedAt: now() } : doc,
      ),
    }))
  }

  const openDoc = (docId: string) => {
    setSelectedLibraryId(null)
    setState((current) => ({
      ...current,
      activeDocId: docId,
      openDocIds: current.openDocIds.includes(docId)
        ? current.openDocIds
        : [...current.openDocIds, docId],
    }))
  }

  const openHome = () => {
    setState((current) => ({ ...current, activeDocId: '' }))
    setSelectedLibraryId(null)
    setMenuState(null)
  }

  const selectLibrary = (libraryId: string) => {
    setSelectedLibraryId(libraryId)
    setState((current) => ({ ...current, activeDocId: '' }))
    setMenuState(null)
  }

  const openNodeMenu = (docId: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const menuWidth = 180
    const menuHeight = 292
    const bottomReserve = 68
    const spaceBelow = window.innerHeight - rect.bottom - bottomReserve
    const placement = spaceBelow < menuHeight ? 'top' : 'bottom'
    setMenuState({
      docId,
      x: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12)),
      y: placement === 'top'
        ? Math.max(8, rect.top - menuHeight - 4)
        : Math.min(rect.bottom + 4, window.innerHeight - menuHeight - bottomReserve),
      placement,
    })
  }

  const focusEditorBody = () => {
    requestAnimationFrame(() => {
      const editable = editorWrapRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')
      editable?.focus()
    })
  }

  const closeDoc = (docId: string) => {
    setState((current) => {
      const openDocIds = current.openDocIds.filter((id) => id !== docId)
      const activeDocId =
        current.activeDocId === docId ? openDocIds.at(-1) || current.activeDocId : current.activeDocId
      return { ...current, openDocIds, activeDocId }
    })
  }

  const createChildDoc = (parentId: string) => {
    const parent = state.docs.find((doc) => doc.id === parentId)
    createDoc(templates[0], parent?.libraryId || inboxLibraryId, parentId)
    setCollapsed((current) => ({ ...current, [parentId]: false }))
  }

  const createRootDocInLibrary = (libraryId: string, template = templates[0]) => {
    setSelectedLibraryId(libraryId)
    createDoc(template, libraryId, null, false)
  }

  const createDoc = (
    template = templates[0],
    libraryId = inboxLibraryId,
    parentId: string | null = null,
    isDraft = false,
  ) => {
    setSelectedLibraryId(null)
    const siblingCount = state.docs.filter((doc) => doc.libraryId === libraryId && doc.parentId === parentId).length
    const doc: DocNode = {
      id: uid('doc'),
      libraryId,
      parentId,
      title: template.name,
      emoji: template.emoji,
      isDraft,
      content: cloneBlocks(template.content),
      sortOrder: siblingCount,
      createdAt: now(),
      updatedAt: now(),
    }

    setState((current) => ({
      ...current,
      docs: [...current.docs, doc],
      activeDocId: doc.id,
      openDocIds: [...current.openDocIds.filter((id) => id !== doc.id), doc.id],
    }))
  }

  const deleteDoc = (docId: string) => {
    if (!state.docs.some((doc) => doc.id === docId)) return
    const childIds = collectChildIds(docId, state.docs)
    const removeIds = new Set([docId, ...childIds])
    const nextDocs = state.docs.filter((doc) => !removeIds.has(doc.id))
    const nextActive = removeIds.has(state.activeDocId)
      ? nextDocs[0]?.id || ''
      : state.activeDocId

    setState((current) => ({
      ...current,
      docs: nextDocs,
      activeDocId: nextActive,
      openDocIds: current.openDocIds.filter((id) => !removeIds.has(id)),
    }))
  }

  const duplicateDoc = (docId: string) => {
    const source = state.docs.find((doc) => doc.id === docId)
    if (!source) return
    const siblingCount = state.docs.filter((doc) => doc.parentId === source.parentId).length
    const copy: DocNode = {
      ...source,
      id: uid('doc'),
      title: `${source.title} 副本`,
      content: cloneBlocks(source.content),
      sortOrder: siblingCount,
      createdAt: now(),
      updatedAt: now(),
    }

    setState((current) => ({
      ...current,
      docs: [...current.docs, copy],
      activeDocId: copy.id,
      openDocIds: [...current.openDocIds, copy.id],
    }))
    setMenuState(null)
  }

  const openMoveDialog = (docId: string) => {
    const source = state.docs.find((doc) => doc.id === docId)
    setMoveDocId(docId)
    setSelectedMoveLibraryId(source?.libraryId || inboxLibraryId)
    setSelectedMoveParentId(source?.parentId || null)
    setMoveQuery('')
    setMenuState(null)
  }

  const moveDoc = (docId: string, nextLibraryId: string, nextParentId: string | null) => {
    const blockedIds = new Set([docId, ...collectChildIds(docId, state.docs)])
    if (nextParentId && blockedIds.has(nextParentId)) return
    const affectedIds = new Set([docId, ...collectChildIds(docId, state.docs)])
    const siblingCount = state.docs.filter((doc) =>
      doc.libraryId === nextLibraryId && doc.parentId === nextParentId && doc.id !== docId
    ).length

    setState((current) => ({
      ...current,
      docs: current.docs.map((doc) =>
        affectedIds.has(doc.id)
          ? {
              ...doc,
              libraryId: nextLibraryId,
              parentId: doc.id === docId ? nextParentId : doc.parentId,
              isDraft: false,
              sortOrder: doc.id === docId ? siblingCount : doc.sortOrder,
              updatedAt: now(),
            }
          : doc,
      ),
    }))
    setMoveDocId(null)
    setMenuState(null)
  }

  const createDraftDoc = () => {
    const doc: DocNode = {
      id: uid('doc'),
      libraryId: inboxLibraryId,
      parentId: null,
      title: '未命名文档',
      emoji: '□',
      isDraft: true,
      content: cloneBlocks(templates[0].content),
      sortOrder: 0,
      createdAt: now(),
      updatedAt: now(),
    }

    setState((current) => ({
      ...current,
      docs: [...current.docs, doc],
      activeDocId: doc.id,
      openDocIds: [...current.openDocIds, doc.id],
    }))
  }

  const createFromTemplate = (template: Template) => {
    const parentId = selectedLibraryId ? null : activeDoc && !activeDoc.isDraft ? activeDoc.id : null
    const libraryId = selectedLibraryId || (activeDoc && !activeDoc.isDraft ? activeDoc.libraryId : inboxLibraryId)
    createDoc(template, libraryId, parentId, false)
    if (parentId) setCollapsed((current) => ({ ...current, [parentId]: false }))
  }

  const saveDocAsTemplate = (docId: string) => {
    const doc = state.docs.find((item) => item.id === docId)
    if (!doc) return
    const template: Template = {
      id: uid('tpl'),
      name: doc.title,
      description: '来自自定义文档模板',
      emoji: doc.emoji,
      content: cloneBlocks(doc.content),
      custom: true,
      sourceDocId: doc.id,
    }
    setState((current) => ({
      ...current,
      customTemplates: [
        ...current.customTemplates.filter((item) => item.sourceDocId !== doc.id),
        template,
      ],
    }))
    setMenuState(null)
  }

  const openCreateLibraryDialog = () => {
    setLibraryDialog({
      mode: 'create',
      title: '',
      description: '',
    })
  }

  const openEditLibraryDialog = (library: ProjectLibrary) => {
    setLibraryDialog({
      mode: 'edit',
      libraryId: library.id,
      title: library.title,
      description: library.description,
    })
  }

  const saveLibraryDialog = () => {
    if (!libraryDialog) return
    const title = libraryDialog.title.trim() || '未命名项目库'
    const description = libraryDialog.description.trim()

    if (libraryDialog.mode === 'create') {
      const library: ProjectLibrary = {
        id: uid('lib'),
        title,
        description,
        cover: 'linear-gradient(135deg, #f4e3ca, #caa978)',
        sortOrder: visibleLibraries.length,
        createdAt: now(),
        updatedAt: now(),
      }
      setState((current) => ({ ...current, libraries: [...current.libraries, library] }))
      setLibraryDialog(null)
      return
    }

    setState((current) => ({
      ...current,
      libraries: current.libraries.map((library) =>
        library.id === libraryDialog.libraryId
          ? { ...library, title, description, updatedAt: now() }
          : library,
      ),
    }))
    setLibraryDialog(null)
  }

  const deleteLibrary = (libraryId: string) => {
    const library = state.libraries.find((item) => item.id === libraryId)
    if (!library || library.hidden) return
    const ok = window.confirm(`删除项目库「${library.title}」？里面的文档会移动到未归档，不会被删除。`)
    if (!ok) return

    setState((current) => ({
      ...current,
      libraries: current.libraries.filter((item) => item.id !== libraryId),
      docs: current.docs.map((doc) =>
        doc.libraryId === libraryId
          ? { ...doc, libraryId: inboxLibraryId, parentId: null, isDraft: false, updatedAt: now() }
          : doc,
      ),
    }))
    if (selectedLibraryId === libraryId) setSelectedLibraryId(null)
    setLibraryDialog(null)
  }

  const openLibrary = (libraryId: string) => {
    const firstDoc = state.docs
      .filter((doc) => doc.libraryId === libraryId && !doc.isDraft)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'))[0]
    if (firstDoc) {
      openDoc(firstDoc.id)
      return
    }
    createDoc(templates[0], libraryId)
  }

  const uploadLibraryCover = async (libraryId: string, file: File | undefined) => {
    if (!file) return
    try {
      const cover = await compressCoverImage(file)
      setState((current) => ({
        ...current,
        libraries: current.libraries.map((library) =>
          library.id === libraryId ? { ...library, cover, updatedAt: now() } : library,
        ),
      }))
    } catch (error) {
      console.error(error)
      window.alert('这张封面处理失败了，请换一张图片试试。')
    }
  }

  const renderLibraryTree = (library: ProjectLibrary) => (
    <div className="library-tree" key={library.id}>
      <div
        className={`library-row ${selectedLibraryId === library.id ? 'active' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => selectLibrary(library.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            selectLibrary(library.id)
          }
        }}
      >
        <span>▤</span>
        <strong>{library.title}</strong>
        <button
          className="library-manage"
          type="button"
          title="在项目库根目录新建文档"
          onClick={(event) => {
            event.stopPropagation()
            createRootDocInLibrary(library.id)
          }}
        >
          +
        </button>
        <button
          className="library-manage"
          type="button"
          title="管理项目库"
          onClick={(event) => {
            event.stopPropagation()
            openEditLibraryDialog(library)
          }}
        >
          ...
        </button>
      </div>
      {renderTreeForLibrary(library.id, null, 1)}
    </div>
  )

  const renderTreeForLibrary = (libraryId: string, parentId: string | null, depth = 0) => {
    const key = parentId || `lib:${libraryId}`
    return (childMap[key] || []).map((doc) => {
      const children = childMap[doc.id] || []
      const isCollapsed = collapsed[doc.id]
      const active = doc.id === state.activeDocId
      const hasChildren = children.length > 0

      return (
        <div className="tree-group" key={doc.id}>
          <div className={`tree-item ${active ? 'active' : ''}`} style={{ paddingLeft: 12 + depth * 14 }}>
            <button
              className="twisty-button"
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (hasChildren) {
                  setCollapsed((current) => ({ ...current, [doc.id]: !current[doc.id] }))
                }
              }}
            >
              {hasChildren ? (isCollapsed ? '>' : 'v') : ''}
            </button>
            <button className="tree-open" type="button" onClick={() => openDoc(doc.id)}>
              <span className="emoji">{doc.emoji}</span>
              <span className="tree-title">{doc.title}</span>
            </button>
            <div className="tree-actions">
              <button
                className="tree-action"
                type="button"
                title="新建子文档"
                onClick={(event) => {
                  event.stopPropagation()
                  createChildDoc(doc.id)
                }}
              >
                +
              </button>
              <button
                className="tree-action"
                type="button"
                title="更多"
                onClick={(event) => {
                  event.stopPropagation()
                  openNodeMenu(doc.id, event.currentTarget)
                }}
              >
                ...
              </button>
            </div>
          </div>
          {!isCollapsed && children.length > 0 ? renderTreeForLibrary(libraryId, doc.id, depth + 1) : null}
        </div>
      )
    })
  }

  const renderMoveTree = (libraryId: string, parentId: string | null, depth = 0) => {
    const key = parentId || `lib:${libraryId}`
    return (moveChildMap[key] || []).map((doc) => (
      <div className="move-tree-group" key={doc.id}>
        <button
          type="button"
          className={`move-target ${selectedMoveParentId === doc.id ? 'active' : ''}`}
          style={{ paddingLeft: 10 + depth * 18 }}
          onClick={() => setSelectedMoveParentId(doc.id)}
        >
          <span>{doc.emoji}</span>
          <strong>{doc.title}</strong>
        </button>
        {renderMoveTree(libraryId, doc.id, depth + 1)}
      </div>
    ))
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <button className="brand-home" type="button" onClick={openHome}>
              <h1>轻文档</h1>
            </button>
            <p>本地优先，快速切换</p>
          </div>
          <button className="icon-button" type="button" onClick={createDraftDoc}>
            +
          </button>
        </div>

        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文档"
        />

        <section className="open-docs">
          <div className="section-label">已打开</div>
          <div className="open-doc-list">
            {openDocs.length === 0 ? <span className="muted">还没有打开文档</span> : null}
            {openDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className={`doc-tab ${doc.id === state.activeDocId ? 'active' : ''}`}
                onClick={() => openDoc(doc.id)}
              >
                <span>{doc.emoji}</span>
                <span>{doc.isDraft ? `${doc.title} · 未保存` : doc.title}</span>
                {doc.isDraft ? (
                  <span
                    className="tab-save"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation()
                      openMoveDialog(doc.id)
                    }}
                  >
                    存
                  </span>
                ) : null}
                <span
                  className="tab-close"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation()
                    closeDoc(doc.id)
                  }}
                >
                  x
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="section-label">文档</div>
        <nav className="tree">{visibleLibraries.map(renderLibraryTree)}</nav>
      </aside>

      <main className="workspace">
        {!activeDoc && state.activeDocId === '' ? (
          <section className="home-view">
            <div className="home-head">
              <div>
                <h2>首页</h2>
                <p>项目库和最近文档都在这里。</p>
              </div>
              <button type="button" onClick={openCreateLibraryDialog}>新建项目库</button>
            </div>

            <section className="home-section">
              <div className="section-row">
                <h3>项目库</h3>
                <span>{visibleLibraries.length} 个</span>
              </div>
              <div className="project-grid">
                {visibleLibraries.map((library) => (
                  <article className="project-card" key={library.id}>
                    <button
                      className="project-cover"
                      type="button"
                      style={getCoverStyle(library.cover)}
                      aria-label={`打开项目库：${library.title}`}
                      onPointerMove={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect()
                        const x = ((event.clientX - rect.left) / rect.width) * 100
                        const y = ((event.clientY - rect.top) / rect.height) * 100
                        event.currentTarget.style.setProperty('--cover-x', `${x}%`)
                        event.currentTarget.style.setProperty('--cover-y', `${y}%`)
                      }}
                      onPointerLeave={(event) => {
                        event.currentTarget.style.setProperty('--cover-x', '50%')
                        event.currentTarget.style.setProperty('--cover-y', '50%')
                      }}
                      onClick={() => openLibrary(library.id)}
                    />
                    <div className="project-info">
                      <button type="button" onClick={() => openLibrary(library.id)}>{library.title}</button>
                      <p>{library.description || '还没有描述。'}</p>
                      <div className="project-actions">
                        <label className="cover-upload">
                          上传封面
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              uploadLibraryCover(library.id, event.target.files?.[0])
                              event.currentTarget.value = ''
                            }}
                          />
                        </label>
                        <button type="button" onClick={() => openEditLibraryDialog(library)}>管理</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {draftDocs.length > 0 ? (
              <section className="home-section">
                <div className="section-row">
                  <h3>未保存草稿</h3>
                  <span>{draftDocs.length} 条</span>
                </div>
                <div className="recent-list">
                  {draftDocs.map((doc) => (
                    <button className="recent-row draft" type="button" key={doc.id} onClick={() => openDoc(doc.id)}>
                      <span>{doc.emoji}</span>
                      <strong>{doc.title}</strong>
                      <small>未保存</small>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="home-section">
              <div className="section-row">
                <h3>最近文档</h3>
                <span>{recentDocs.length} 条</span>
              </div>
              <div className="recent-list">
                {recentDocs.map((doc) => (
                  <button className="recent-row" type="button" key={doc.id} onClick={() => openDoc(doc.id)}>
                    <span>{doc.emoji}</span>
                    <strong>{doc.title}</strong>
                    <small>{formatTime(doc.updatedAt)}</small>
                  </button>
                ))}
              </div>
            </section>
          </section>
        ) : activeDoc ? (
          <section className="editor-wrap">
            <div className="doc-head">
              <input
                className="doc-title"
                value={activeDoc.title}
                onChange={(event) => updateDoc(activeDoc.id, { title: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                    focusEditorBody()
                  }
                }}
              />
              <div className="doc-meta">
                <span>{activeDoc.emoji}</span>
                <span>{activeDoc.isDraft ? '未保存到文档库' : `保存于 ${formatTime(activeDoc.updatedAt)}`}</span>
                {activeDoc.isDraft ? (
                  <button type="button" onClick={() => openMoveDialog(activeDoc.id)}>保存到文档库</button>
                ) : null}
                <button type="button" onClick={() => deleteDoc(activeDoc.id)}>删除</button>
              </div>
            </div>
            <div className="editor-card" ref={editorWrapRef}>
              <EditorCanvas
                key={activeDoc.id}
                doc={activeDoc}
                onChange={(blocks) => updateDoc(activeDoc.id, { content: blocks })}
              />
            </div>
          </section>
        ) : (
          <section className="empty-state">
            <h2>选择或新建一篇文档</h2>
            <p>左侧文档树用于快速跳转，右侧模板可以直接生成预设文档。</p>
          </section>
        )}
      </main>

      <aside className="inspector">
        <div className="panel">
          <h2>模板</h2>
          <div className="template-list">
            {allTemplates.map((template) => (
              <button
                className={`template-card ${template.custom ? 'custom' : ''}`}
                key={template.id}
                type="button"
                onClick={() => createFromTemplate(template)}
              >
                <span>{template.emoji}</span>
                <strong>{template.name}</strong>
                <small>{template.custom ? `自定义 · ${template.description}` : template.description}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>下一阶段</h2>
          <ul className="roadmap">
            <li>Tauri 独立窗口</li>
            <li>.ldoc 文件格式</li>
            <li>双击文档打开</li>
            <li>Windows 右键新建</li>
          </ul>
        </div>
      </aside>

      {menuState ? (
        (() => {
          const menuDoc = state.docs.find((doc) => doc.id === menuState.docId)
          if (!menuDoc) return null
          return (
        <div
          className={`node-menu ${menuState.placement}`}
          style={{ left: menuState.x, top: menuState.y }}
          onMouseLeave={() => setMenuState(null)}
        >
          <button type="button" onClick={() => {
            createChildDoc(menuState.docId)
            setMenuState(null)
          }}>新建子文档</button>
          <button type="button" onClick={() => {
            openDoc(menuState.docId)
            setMenuState(null)
          }}>打开</button>
          <button type="button" onClick={() => duplicateDoc(menuState.docId)}>复制</button>
          {menuDoc.isDraft ? (
            <button type="button" onClick={() => openMoveDialog(menuState.docId)}>保存到文档库</button>
          ) : null}
          <button type="button" onClick={() => openMoveDialog(menuState.docId)}>移动到...</button>
          <button type="button" onClick={() => saveDocAsTemplate(menuState.docId)}>设为模板</button>
          <button type="button" disabled>导入 Markdown</button>
          <button type="button" disabled>导出 Markdown</button>
          <button type="button" disabled>导出 Word / PDF</button>
          <button type="button" className="danger-text" onClick={() => {
            deleteDoc(menuState.docId)
            setMenuState(null)
          }}>删除</button>
        </div>
          )
        })()
      ) : null}

      {libraryDialog ? (
        <div className="modal-backdrop" onMouseDown={() => setLibraryDialog(null)}>
          <section className="library-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>{libraryDialog.mode === 'create' ? '新建项目库' : '管理项目库'}</h2>
              <button className="modal-close" type="button" onClick={() => setLibraryDialog(null)}>x</button>
            </div>
            <div className="library-form">
              <label>
                <span>名称</span>
                <input
                  autoFocus
                  value={libraryDialog.title}
                  onChange={(event) => setLibraryDialog((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      saveLibraryDialog()
                    }
                  }}
                  placeholder="项目库名称"
                />
              </label>
              <label>
                <span>描述</span>
                <textarea
                  value={libraryDialog.description}
                  onChange={(event) => setLibraryDialog((current) =>
                    current ? { ...current, description: event.target.value } : current,
                  )}
                  placeholder="可选，用一句话说明这个项目库"
                />
              </label>
              {libraryDialog.mode === 'edit' && libraryDialog.libraryId ? (
                <div className="library-danger">
                  <p>删除项目库只会移除这个容器，里面的文档会移动到未归档。</p>
                  <button
                    className="danger-text"
                    type="button"
                    onClick={() => deleteLibrary(libraryDialog.libraryId as string)}
                  >
                    删除项目库
                  </button>
                </div>
              ) : null}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setLibraryDialog(null)}>取消</button>
              <button className="primary" type="button" onClick={saveLibraryDialog}>
                {libraryDialog.mode === 'create' ? '创建' : '保存'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {moveDocId ? (
        (() => {
          const movingDoc = state.docs.find((doc) => doc.id === moveDocId)
          const isSavingDraft = Boolean(movingDoc?.isDraft)
          return (
        <div className="modal-backdrop" onMouseDown={() => setMoveDocId(null)}>
          <section className="move-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>{isSavingDraft ? '保存' : '移动'}「{movingDoc?.title}」到</h2>
              <button className="modal-close" type="button" onClick={() => setMoveDocId(null)}>x</button>
            </div>
            <div className="move-body">
              <aside className="move-left">
                <input
                  value={moveQuery}
                  onChange={(event) => setMoveQuery(event.target.value)}
                  placeholder="搜索位置"
                />
                <button
                  type="button"
                  className={selectedMoveLibraryId === inboxLibraryId ? 'active' : ''}
                  onClick={() => {
                    setSelectedMoveLibraryId(inboxLibraryId)
                    setSelectedMoveParentId(null)
                  }}
                >
                  ▤ 未归档
                </button>
                {visibleLibraries.map((library) => (
                  <button
                    key={library.id}
                    type="button"
                    className={selectedMoveLibraryId === library.id ? 'active' : ''}
                    onClick={() => {
                      setSelectedMoveLibraryId(library.id)
                      setSelectedMoveParentId(null)
                    }}
                  >
                    ▤ {library.title}
                  </button>
                ))}
              </aside>
              <div className="move-right">
                <button
                  type="button"
                  className={`move-target ${selectedMoveParentId === null ? 'active' : ''}`}
                  onClick={() => setSelectedMoveParentId(null)}
                >
                  <span>▤</span>
                  <strong>{libraries.find((library) => library.id === selectedMoveLibraryId)?.title || '未归档'}</strong>
                </button>
                {renderMoveTree(selectedMoveLibraryId, null)}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setMoveDocId(null)}>取消</button>
              <button className="primary" type="button" onClick={() => moveDoc(moveDocId, selectedMoveLibraryId, selectedMoveParentId)}>
                {isSavingDraft ? '保存' : '确认'}
              </button>
            </div>
          </section>
        </div>
          )
        })()
      ) : null}
    </div>
  )
}

function collectChildIds(parentId: string, docs: DocNode[]) {
  const ids: string[] = []
  const walk = (id: string) => {
    docs
      .filter((doc) => doc.parentId === id)
      .forEach((doc) => {
        ids.push(doc.id)
        walk(doc.id)
      })
  }
  walk(parentId)
  return ids
}

export default App
