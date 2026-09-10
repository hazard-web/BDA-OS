import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  AppstoreOutlined,
  AudioOutlined,
  BookOutlined,
  CameraOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  EllipsisOutlined,
  FilterOutlined,
  FormOutlined,
  HighlightOutlined,
  LogoutOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ProjectOutlined,
  SearchOutlined,
  SettingOutlined,
  StarOutlined,
  TagOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  Dropdown,
  Empty,
  Flex,
  Input,
  Layout as AntLayout,
  List,
  Menu,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Space,
  Tooltip,
  Typography,
} from 'antd'
import PulseMark from '../components/PulseMark'
import { useAuth } from '../context/AuthContext'
import {
  NOTE_COLORS,
  createPulseNote,
  formatPulseNoteDay,
  joinNote,
  loadAllPulseNotes,
  loadPulseBoards,
  loadPulseNotebooks,
  loadPulseNotes,
  previewPulseNote,
  pulseNotesDayKey,
  PULSE_NOTES_EVENT,
  savePulseBoards,
  savePulseNotebooks,
  savePulseNotes,
  splitNote,
} from '../utils/pulseNotes'
import { APP_BASE, PULSE_HOME, hasPulseAccount } from '../utils/pulseEntry'
import PulseAppearanceToggle from '../components/PulseAppearanceToggle'
import { AuthLogoLoader, useAccountSignOut } from '../components/auth/AuthLogoLoader'
import './pulse-antd.css'
import './pulse-notes.css'

const { Header, Sider, Content } = AntLayout

const CREATE_ACTIONS = [
  { type: 'text', label: 'Write', Icon: FormOutlined },
  { type: 'capture', label: 'Capture', Icon: CameraOutlined },
  { type: 'todo', label: 'To Do', Icon: CheckSquareOutlined },
  { type: 'attach', label: 'Attach', Icon: PaperClipOutlined },
  { type: 'draw', label: 'Draw', Icon: HighlightOutlined },
  { type: 'audio', label: 'Audio', Icon: AudioOutlined },
  { type: 'video', label: 'Video', Icon: VideoCameraOutlined },
]

const TYPE_HINT = {
  capture: 'Drop a photo here later. For now, jot what you captured.',
  attach: 'File attachments will land here. Describe the file for now.',
  draw: 'Sketch on paper, then write the idea down.',
  audio: 'Voice notes will record here. Capture the gist in text.',
  video: 'Video notes will play here. Summarize what you would film.',
}

const BOARD_COLUMNS = [
  { id: 'lists', title: 'My Lists' },
  { id: 'recents', title: 'Recents' },
  { id: 'files', title: 'All Files' },
  { id: 'reminders', title: 'My Reminders' },
]

function patchNote(email, note, patch) {
  const bucket = note.day || pulseNotesDayKey()
  const list = loadPulseNotes(email, bucket).map((item) =>
    item.id === note.id ? { ...item, ...patch, updatedAt: Date.now() } : item
  )
  savePulseNotes(email, list, bucket)
}

function StartIdeas({ onCreate }) {
  return (
    <Flex className="pn-empty" align="center" justify="center" vertical>
      <Typography.Title level={2} className="pn-empty-title">
        Start jotting down your ideas
      </Typography.Title>
      <Row gutter={[16, 16]} justify="center" className="pn-actions">
        {CREATE_ACTIONS.map(({ type, label, Icon }) => (
          <Col key={type} flex="0 0 128px">
            <Card hoverable className="pn-action-card" onClick={() => onCreate(type)}>
              <Flex vertical align="center" gap={10}>
                <Icon />
                <Typography.Text>{label}</Typography.Text>
              </Flex>
            </Card>
          </Col>
        ))}
      </Row>
    </Flex>
  )
}

function NoteCard({ note, selected, onClick }) {
  const tone = NOTE_COLORS.includes(note.color) ? note.color : 'mint'
  const { title, body } = splitNote(note.text)
  return (
    <Card
      hoverable
      size="small"
      className={`pn-note-card is-${tone}${selected ? ' is-open' : ''}`}
      onClick={onClick}
    >
      <Flex gap={10} align="flex-start">
        <div className="pn-note-copy">
          <Typography.Paragraph ellipsis={{ rows: 3 }} className="pn-note-text">
            {previewPulseNote(note.text, 140) || title || 'Empty note'}
          </Typography.Paragraph>
          <Typography.Text type="secondary" className="pn-note-meta">
            {formatPulseNoteDay(note.day)} · {format(new Date(note.updatedAt || Date.now()), 'HH:mm')}
          </Typography.Text>
        </div>
        {body ? <span className="pn-note-thumb" aria-hidden /> : null}
      </Flex>
    </Card>
  )
}

function ListHeader({ title, onSearch, starred, onStar, moreItems }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  return (
    <Flex className="pn-list-head" align="center" justify="space-between" gap={8}>
      <Typography.Title level={4} className="pn-list-title">{title}</Typography.Title>
      <Space size={2}>
        {open ? (
          <Input
            autoFocus
            size="small"
            allowClear
            prefix={<SearchOutlined />}
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              onSearch?.(event.target.value)
            }}
            onBlur={() => { if (!value) setOpen(false) }}
            style={{ width: 140 }}
          />
        ) : (
          <Button type="text" icon={<SearchOutlined />} onClick={() => setOpen(true)} />
        )}
        {onStar ? (
          <Tooltip title={starred ? 'Show all' : 'Starred only'}>
            <Button type="text" icon={<StarOutlined />} className={starred ? 'is-on' : ''} onClick={onStar} />
          </Tooltip>
        ) : null}
        <Dropdown menu={{ items: moreItems || [{ key: 'none', label: 'No extra actions', disabled: true }] }}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      </Space>
    </Flex>
  )
}

export default function PulseNotes() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const { signingOut, signOutLogo, beginSignOut } = useAccountSignOut()
  const today = pulseNotesDayKey()
  const [nav, setNav] = useState('all')
  const [notebooks, setNotebooks] = useState([{ id: 'my-notebook', name: 'My Notebook' }])
  const [boards, setBoards] = useState([{ id: 'my-board', name: 'My Notebook', title: 'My Noteboard' }])
  const [notes, setNotes] = useState([])
  const [trash, setTrash] = useState([])
  const [query, setQuery] = useState('')
  const [listQuery, setListQuery] = useState('')
  const [openId, setOpenId] = useState(null)
  const [nbOpen, setNbOpen] = useState(false)
  const [nbName, setNbName] = useState('')
  const [boardOpen, setBoardOpen] = useState(false)
  const [boardName, setBoardName] = useState('')
  const [sharedTab, setSharedTab] = useState('all')
  const [reminderTab, setReminderTab] = useState('overdue')
  const [starredOnly, setStarredOnly] = useState(false)

  const email = user?.email
  const initial = String(user?.name || user?.email || 'U').trim().charAt(0).toUpperCase()

  const refresh = useCallback(() => {
    if (!email) return
    setNotebooks(loadPulseNotebooks(email))
    setBoards(loadPulseBoards(email))
    setNotes(loadAllPulseNotes(email))
    setTrash(loadAllPulseNotes(email, { trash: true }))
  }, [email])

  useEffect(() => {
    if (loading || !user) return
    if (!hasPulseAccount(user)) {
      navigate(APP_BASE, { replace: true })
    }
  }, [user, loading, navigate])

  useEffect(() => {
    refresh()
    window.addEventListener(PULSE_NOTES_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(PULSE_NOTES_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [refresh])

  const go = (key) => {
    setOpenId(null)
    setListQuery('')
    setStarredOnly(false)
    setNav(key)
  }

  const live = nav === 'trash' ? trash : notes

  const visible = useMemo(() => {
    let list = live
    if (nav.startsWith('nb:')) {
      list = list.filter((note) => (note.notebookId || 'my-notebook') === nav.slice(3))
    }
    if (starredOnly) list = list.filter((note) => note.starred)
    const q = `${query} ${listQuery}`.trim().toLowerCase()
    if (!q) return list
    return list.filter((note) => String(note.text || '').toLowerCase().includes(q))
  }, [live, nav, query, listQuery, starredOnly])

  const openNote = live.find((note) => note.id === openId) || notes.find((note) => note.id === openId)
  const split = openNote ? splitNote(openNote.text) : { title: '', body: '' }
  const activeBoard = boards.find((item) => item.id === (nav.startsWith('board:') ? nav.slice(6) : 'my-board')) || boards[0]

  const createNote = (type = 'text') => {
    if (!email) return
    const notebookId = nav.startsWith('nb:') ? nav.slice(3) : 'my-notebook'
    const starter = TYPE_HINT[type] ? `${CREATE_ACTIONS.find((item) => item.type === type)?.label || 'Note'}\n` : ''
    const current = loadPulseNotes(email, today)
    const nextNote = createPulseNote(current, starter, { type, notebookId })
    savePulseNotes(email, [...current, nextNote], today)
    if (nav === 'trash' || nav === 'shared' || nav === 'reminders' || nav === 'tags' || nav.startsWith('board:')) {
      setNav('all')
    }
    setOpenId(nextNote.id)
    refresh()
  }

  const writeOpen = (title, body, extra = {}) => {
    if (!email || !openNote) return
    const text = joinNote(title, body)
    patchNote(email, openNote, { text, ...extra })
    const bump = (item) => (item.id === openNote.id ? { ...item, text, ...extra, updatedAt: Date.now() } : item)
    setNotes((current) => current.map(bump))
    setTrash((current) => current.map(bump))
  }

  const moveToTrash = (note) => {
    if (!email || !note) return
    patchNote(email, note, { trashed: true })
    if (openId === note.id) setOpenId(null)
    refresh()
  }

  const restoreNote = (note) => {
    if (!email || !note) return
    patchNote(email, note, { trashed: false })
    setOpenId(note.id)
    setNav('all')
    refresh()
  }

  const destroyNote = (note) => {
    if (!email || !note) return
    const bucket = note.day || today
    savePulseNotes(email, loadPulseNotes(email, bucket).filter((item) => item.id !== note.id), bucket)
    if (openId === note.id) setOpenId(null)
    refresh()
  }

  const addNotebook = () => {
    const name = nbName.trim()
    if (!email || !name) return
    const next = [...notebooks, { id: `${Date.now()}`, name }]
    savePulseNotebooks(email, next)
    setNotebooks(next)
    setNbName('')
    setNbOpen(false)
    go(`nb:${next[next.length - 1].id}`)
  }

  const addBoard = () => {
    const name = boardName.trim()
    if (!email || !name) return
    const next = [...boards, { id: `${Date.now()}`, name, title: name }]
    savePulseBoards(email, next)
    setBoards(next)
    setBoardName('')
    setBoardOpen(false)
    go(`board:${next[next.length - 1].id}`)
  }

  if (loading || !user || !hasPulseAccount(user)) {
    return <AuthLogoLoader show label={signOutLogo ? 'Signing out' : 'Opening BDA OS'} />
  }

  const selectedNav = nav.startsWith('board:') ? nav : nav
  const isBoard = nav === 'boards' || nav.startsWith('board:')
  const isReminders = nav === 'reminders'
  const showList = !isBoard && !isReminders
  const showEditor = Boolean(openNote) && showList && nav !== 'shared' && nav !== 'tags'
  const showStar = nav === 'all' || nav.startsWith('nb:') || nav === 'trash'

  const listTitle = nav === 'trash'
    ? 'Trash'
    : nav === 'shared'
      ? 'Shared'
      : nav === 'tags'
        ? 'Tags'
        : nav.startsWith('nb:')
          ? notebooks.find((item) => `nb:${item.id}` === nav)?.name || 'Notebook'
          : 'All Notes'

  const renderEditor = () => (
    <Flex vertical className="pn-editor-pane">
      <Flex justify="space-between" align="center" className="pn-editor-bar">
        <Typography.Text type="secondary">
          {openNote.day ? format(parseISO(openNote.day), 'EEEE, d MMMM yyyy') : formatPulseNoteDay(today)}
        </Typography.Text>
        <Space>
          {nav === 'trash' ? (
            <>
              <Button onClick={() => restoreNote(openNote)}>Restore</Button>
              <Popconfirm title="Delete forever?" okText="Delete" onConfirm={() => destroyNote(openNote)}>
                <Button danger>Delete forever</Button>
              </Popconfirm>
            </>
          ) : (
            <Popconfirm title="Move to trash?" okText="Trash" onConfirm={() => moveToTrash(openNote)}>
              <Button danger icon={<DeleteOutlined />}>Trash</Button>
            </Popconfirm>
          )}
        </Space>
      </Flex>
      <Input
        size="large"
        variant="borderless"
        placeholder="Title"
        className="pn-title"
        value={split.title}
        onChange={(event) => writeOpen(event.target.value, split.body)}
      />
      {openNote.type === 'todo' ? (
        <Flex vertical gap={8} className="pn-todos">
          {(openNote.todos || []).map((item, index) => (
            <Flex key={item.id || index} gap={8} align="center">
              <Checkbox
                checked={Boolean(item.done)}
                onChange={(event) => {
                  const todos = (openNote.todos || []).map((row, rowIndex) =>
                    rowIndex === index ? { ...row, done: event.target.checked } : row
                  )
                  writeOpen(split.title, split.body, { todos })
                }}
              />
              <Input
                variant="borderless"
                placeholder="To-do"
                value={item.text}
                onChange={(event) => {
                  const todos = (openNote.todos || []).map((row, rowIndex) =>
                    rowIndex === index ? { ...row, text: event.target.value } : row
                  )
                  writeOpen(split.title, split.body, { todos })
                }}
              />
            </Flex>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => writeOpen(split.title, split.body, {
              todos: [...(openNote.todos || []), { id: `t${Date.now()}`, text: '', done: false }],
            })}
          >
            Add item
          </Button>
        </Flex>
      ) : (
        <Input.TextArea
          variant="borderless"
          className="pn-body-input"
          placeholder="Start writing…"
          value={split.body}
          autoSize={{ minRows: 16 }}
          onChange={(event) => writeOpen(split.title, event.target.value)}
        />
      )}
    </Flex>
  )

  return (
    <AntLayout className="pulse-shell pn-shell">
      <AuthLogoLoader show={signOutLogo} label="Signing out" />
      <Header className="pulse-top">
        <button type="button" className="pulse-rail-logo pn-mark" onClick={() => navigate(PULSE_HOME)} aria-label="BDA OS home">
          <PulseMark size={28} />
        </button>
        <button type="button" className="pulse-space" onClick={() => navigate(PULSE_HOME)}>
          You
        </button>
        <button type="button" className="pulse-space is-on">
          Notebook
        </button>
        <div className="pulse-top-tools">
          <Dropdown.Button
            type="primary"
            icon={<DownOutlined />}
            onClick={() => createNote('text')}
            menu={{
              items: CREATE_ACTIONS.filter((item) => item.type !== 'text').map((item) => ({
                key: item.type,
                icon: <item.Icon />,
                label: item.label,
              })),
              onClick: ({ key }) => createNote(key),
            }}
          >
            Write
          </Dropdown.Button>
          <PulseAppearanceToggle />
          <Tooltip title="Settings">
            <Button type="text" icon={<SettingOutlined />} onClick={() => navigate(PULSE_HOME)} />
          </Tooltip>
          <Dropdown
            disabled={signingOut}
            menu={{
              items: [
                { key: 'out', icon: <LogoutOutlined />, danger: true, label: signingOut ? 'Signing out' : 'Sign out', disabled: signingOut, onClick: () => beginSignOut() },
              ],
            }}
          >
            <Avatar className="pulse-avatar" size={30}>{initial}</Avatar>
          </Dropdown>
        </div>
      </Header>

      <AntLayout className="pulse-mid pn-mid">
        <Sider className="pn-nav" width={232} theme="light" trigger={null}>
          <Flex vertical className="pn-nav-inner">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                if (nav === 'reminders' || isBoard) setNav('all')
              }}
              className="pn-nav-search"
            />
            <Menu
              mode="inline"
              selectedKeys={[selectedNav === 'boards' ? `board:${activeBoard?.id}` : selectedNav]}
              onClick={({ key }) => go(key)}
              items={[
                { key: 'all', icon: <FormOutlined />, label: 'All Notes' },
                { key: 'shared', icon: <TeamOutlined />, label: 'Shared' },
                { key: 'reminders', icon: <ClockCircleOutlined />, label: 'Reminders' },
                {
                  type: 'group',
                  label: (
                    <Flex justify="space-between" align="center">
                      <span>Notebooks</span>
                      <PlusOutlined className="pn-group-plus" onClick={(event) => { event.stopPropagation(); setNbOpen(true) }} />
                    </Flex>
                  ),
                  children: notebooks.map((item) => ({
                    key: `nb:${item.id}`,
                    icon: <BookOutlined />,
                    label: item.name,
                  })),
                },
                {
                  type: 'group',
                  label: (
                    <Flex justify="space-between" align="center">
                      <span>Boards</span>
                      <PlusOutlined className="pn-group-plus" onClick={(event) => { event.stopPropagation(); setBoardOpen(true) }} />
                    </Flex>
                  ),
                  children: boards.map((item) => ({
                    key: `board:${item.id}`,
                    icon: <ProjectOutlined />,
                    label: item.name,
                  })),
                },
                {
                  type: 'group',
                  label: 'Tags',
                  children: [{ key: 'tags', icon: <TagOutlined />, label: 'No Tags Available' }],
                },
              ]}
            />
            <div className="pn-nav-foot">
              <Button type="text" block className={nav === 'trash' ? 'is-active' : ''} icon={<DeleteOutlined />} onClick={() => go('trash')}>
                Trash
              </Button>
            </div>
          </Flex>
        </Sider>

        {showList ? (
          <Sider className="pn-list" width={320} theme="light" trigger={null}>
            <Flex vertical className="pn-list-inner">
              <ListHeader
                title={listTitle}
                onSearch={setListQuery}
                starred={starredOnly}
                onStar={showStar ? () => setStarredOnly((value) => !value) : undefined}
                moreItems={showStar ? [
                  { key: 'star', label: starredOnly ? 'Show all notes' : 'Show starred', onClick: () => setStarredOnly((value) => !value) },
                ] : undefined}
              />
              {nav === 'shared' ? (
                <>
                  <Segmented
                    block
                    className="pn-segmented"
                    value={sharedTab}
                    onChange={setSharedTab}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'notes', label: 'Notes' },
                      { value: 'notebooks', label: 'Notebooks' },
                      { value: 'collections', label: 'Collections' },
                    ]}
                  />
                  <Flex flex={1} align="center" justify="center">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing shared with you yet." />
                  </Flex>
                </>
              ) : null}
              {nav === 'tags' ? (
                <Flex flex={1} align="center" justify="center">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tags yet" />
                </Flex>
              ) : null}
              {nav === 'all' || nav.startsWith('nb:') || nav === 'trash' ? (
                visible.length === 0 ? (
                  <Flex flex={1} align="center" justify="center">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={nav === 'trash' ? 'Trash is empty.' : query || listQuery ? 'No matching notes.' : 'No notes yet.'}
                    />
                  </Flex>
                ) : (
                  <List
                    className="pn-note-list"
                    dataSource={visible}
                    split={false}
                    renderItem={(note) => (
                      <List.Item className="pn-note-item">
                        <NoteCard note={note} selected={openId === note.id} onClick={() => setOpenId(note.id)} />
                      </List.Item>
                    )}
                  />
                )
              ) : null}
            </Flex>
          </Sider>
        ) : null}

        <Content className="pulse-body pn-body">
          {isReminders ? (
            <Flex vertical className="pn-page">
              <Flex align="center" justify="space-between">
                <Typography.Title level={3} className="pn-page-title">Reminders</Typography.Title>
                <Button type="text" icon={<EllipsisOutlined />} />
              </Flex>
              <Segmented
                className="pn-segmented"
                value={reminderTab}
                onChange={setReminderTab}
                options={[
                  { value: 'overdue', label: 'Overdue' },
                  { value: 'upcoming', label: 'Upcoming' },
                ]}
              />
              <Flex flex={1} align="center" justify="center">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No reminders yet" />
              </Flex>
            </Flex>
          ) : null}

          {isBoard ? (
            <Flex vertical className="pn-page pn-board-page">
              <Typography.Title level={3} className="pn-board-title">{activeBoard?.title || activeBoard?.name || 'My Noteboard'}</Typography.Title>
              <Flex justify="flex-end" className="pn-board-tools" gap={4}>
                <Tooltip title="Add column">
                  <Button type="text" icon={<AppstoreOutlined />} />
                </Tooltip>
                <Button type="text" icon={<EllipsisOutlined />} />
              </Flex>
              <Row gutter={16} className="pn-board-cols" wrap>
                {BOARD_COLUMNS.map((column) => {
                  const cards = column.id === 'recents' ? notes.slice(0, 6) : []
                  return (
                    <Col key={column.id} xs={24} md={12} xl={6}>
                      <Card
                        className={`pn-board-col${column.id === 'files' ? ' is-focus' : ''}`}
                        title={(
                          <Flex vertical>
                            <Typography.Text strong>{column.title}</Typography.Text>
                            <Typography.Text type="secondary">{cards.length} Notes</Typography.Text>
                          </Flex>
                        )}
                        extra={<Button type="text" size="small" icon={<FilterOutlined />} />}
                      >
                        {cards.length === 0 ? (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notecards" />
                        ) : (
                          <List
                            split={false}
                            dataSource={cards}
                            renderItem={(note) => (
                              <List.Item className="pn-note-item">
                                <NoteCard note={note} selected={false} onClick={() => { setNav('all'); setOpenId(note.id) }} />
                              </List.Item>
                            )}
                          />
                        )}
                      </Card>
                    </Col>
                  )
                })}
              </Row>
            </Flex>
          ) : null}

          {showList && showEditor ? renderEditor() : null}
          {showList && !showEditor ? <StartIdeas onCreate={createNote} /> : null}
        </Content>
      </AntLayout>

      <Modal title="New notebook" open={nbOpen} onOk={addNotebook} onCancel={() => setNbOpen(false)} okButtonProps={{ disabled: !nbName.trim() }}>
        <Input autoFocus placeholder="Notebook name" value={nbName} onChange={(event) => setNbName(event.target.value)} onPressEnter={addNotebook} />
      </Modal>
      <Modal title="New board" open={boardOpen} onOk={addBoard} onCancel={() => setBoardOpen(false)} okButtonProps={{ disabled: !boardName.trim() }}>
        <Input autoFocus placeholder="Board name" value={boardName} onChange={(event) => setBoardName(event.target.value)} onPressEnter={addBoard} />
      </Modal>
    </AntLayout>
  )
}
