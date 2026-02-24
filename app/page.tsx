'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { uploadAndTrainDocument, getDocuments, deleteDocuments } from '@/lib/ragKnowledgeBase'
import { listSchedules, getScheduleLogs, pauseSchedule, resumeSchedule, cronToHuman, triggerScheduleNow } from '@/lib/scheduler'
import type { Schedule, ExecutionLog } from '@/lib/scheduler'
import type { RAGDocument } from '@/lib/ragKnowledgeBase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  FiMessageSquare, FiDatabase, FiSettings, FiSend, FiSearch, FiUpload,
  FiTrash2, FiPlay, FiPause, FiRefreshCw, FiChevronLeft, FiChevronRight,
  FiAlertTriangle, FiCheckCircle, FiClock, FiFile, FiX, FiZap, FiActivity,
  FiShield, FiUsers, FiChevronDown, FiChevronUp,
  FiBookOpen, FiLayers, FiList, FiGrid, FiDownload, FiAlertCircle, FiInfo
} from 'react-icons/fi'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIPELINE_MANAGER_AGENT_ID = '699d404eab5c2a239c014dec'
const ROLE_KNOWLEDGE_AGENT_ID = '699d404eb180522b55d44578'
const CONFLICT_DETECTION_AGENT_ID = '699d404fab5c2a239c014dee'
const RAG_ID = '699d3fa5e9e49857cb795eff'

const ROLES = ['Sales', 'PM', 'Support Engineer', 'Ops', 'Delivery', 'Finance', 'Leadership'] as const
type Role = typeof ROLES[number]

const THEME_VARS = {
  '--background': '0 0% 100%',
  '--foreground': '222 47% 11%',
  '--card': '0 0% 98%',
  '--card-foreground': '222 47% 11%',
  '--primary': '222 47% 11%',
  '--primary-foreground': '210 40% 98%',
  '--secondary': '210 40% 96%',
  '--secondary-foreground': '222 47% 11%',
  '--accent': '210 40% 92%',
  '--muted': '210 40% 94%',
  '--muted-foreground': '215 16% 47%',
  '--border': '214 32% 91%',
  '--destructive': '0 84% 60%',
  '--chart-1': '12 76% 61%',
  '--chart-2': '173 58% 39%',
  '--chart-3': '197 37% 24%',
  '--chart-4': '43 74% 66%',
  '--chart-5': '27 87% 67%',
  '--radius': '0.875rem',
} as React.CSSProperties

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

interface PipelineManagerResponse {
  status: string
  pipeline_summary: {
    total_items_fetched: number
    total_threads_created: number
    total_artifacts_created: number
    pipeline_duration: string
    errors_encountered: number
  }
  stage_results: {
    communication_listener: {
      status: string
      items_fetched: number
      source_breakdown: {
        gmail: number
        outlook: number
        slack: number
        teams: number
        hubspot: number
        notion: number
      }
    }
    context_builder: {
      status: string
      threads_created: number
      avg_confidence: number
    }
    knowledge_structuring: {
      status: string
      artifacts_created: number
      artifacts_by_type: {
        faqs: number
        sops: number
        known_issues: number
        best_practices: number
      }
    }
  }
}

interface KnowledgeAgentResponse {
  answer: string
  confidence: string
  role_context: string
  sources: Array<{
    title: string
    type: string
    relevance_score: number
    excerpt: string
  }>
  related_topics: string[]
  follow_up_suggestions: string[]
}

interface ConflictDetectionResponse {
  status: string
  scan_summary: {
    total_artifacts_scanned: number
    issues_found: number
    critical_count: number
    high_count: number
    medium_count: number
    low_count: number
  }
  findings: Array<{
    severity: string
    type: string
    title: string
    description: string
    affected_artifacts: string[]
    suggested_action: string
    auto_resolvable: boolean
  }>
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  data?: KnowledgeAgentResponse
}

// ---------------------------------------------------------------------------
// Sample Data
// ---------------------------------------------------------------------------

const SAMPLE_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    role: 'user',
    content: 'What is our escalation process for critical production issues?',
    timestamp: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: '2',
    role: 'assistant',
    content: '',
    timestamp: new Date(Date.now() - 295000).toISOString(),
    data: {
      answer: '## Critical Production Escalation Process\n\nWhen a **critical production issue** is identified, follow this escalation path:\n\n1. **L1 Support** acknowledges within 5 minutes and begins triage\n2. **L2 Engineering** is paged if not resolved within 15 minutes\n3. **Engineering Lead** is notified at the 30-minute mark\n4. **VP Engineering + CTO** are briefed if impact exceeds 1 hour\n\n### Communication Requirements\n- Status updates every 15 minutes in #incident-response Slack channel\n- Customer communication via StatusPage within 10 minutes of confirmation\n- Post-mortem document within 48 hours of resolution',
      confidence: 'High',
      role_context: 'Support Engineer - Full escalation visibility with technical details',
      sources: [
        { title: 'SOP-2024-Incident-Response', type: 'SOP', relevance_score: 0.95, excerpt: 'Critical incidents require immediate L1 acknowledgment within 5 minutes...' },
        { title: 'FAQ-Escalation-Matrix', type: 'FAQ', relevance_score: 0.88, excerpt: 'The escalation matrix defines four tiers of response...' },
        { title: 'BP-Communication-During-Outages', type: 'Best Practice', relevance_score: 0.82, excerpt: 'Always communicate proactively with affected customers...' },
      ],
      related_topics: ['Incident Severity Levels', 'Post-Mortem Template', 'On-Call Rotation'],
      follow_up_suggestions: ['What are the severity level definitions?', 'Show me the post-mortem template', 'Who is currently on-call?'],
    },
  },
]

const SAMPLE_PIPELINE_RESPONSE: PipelineManagerResponse = {
  status: 'completed',
  pipeline_summary: {
    total_items_fetched: 247,
    total_threads_created: 89,
    total_artifacts_created: 34,
    pipeline_duration: '4m 32s',
    errors_encountered: 2,
  },
  stage_results: {
    communication_listener: {
      status: 'completed',
      items_fetched: 247,
      source_breakdown: { gmail: 78, outlook: 42, slack: 65, teams: 31, hubspot: 19, notion: 12 },
    },
    context_builder: {
      status: 'completed',
      threads_created: 89,
      avg_confidence: 0.87,
    },
    knowledge_structuring: {
      status: 'completed',
      artifacts_created: 34,
      artifacts_by_type: { faqs: 12, sops: 8, known_issues: 9, best_practices: 5 },
    },
  },
}

const SAMPLE_CONFLICT_RESPONSE: ConflictDetectionResponse = {
  status: 'completed',
  scan_summary: {
    total_artifacts_scanned: 156,
    issues_found: 7,
    critical_count: 1,
    high_count: 2,
    medium_count: 3,
    low_count: 1,
  },
  findings: [
    {
      severity: 'Critical',
      type: 'Contradiction',
      title: 'Conflicting SLA response times in Support SOPs',
      description: 'SOP-2024-Support-SLA states 4-hour response for critical issues, but SOP-2024-Enterprise-Support states 2-hour response. These documents cover the same escalation tier.',
      affected_artifacts: ['SOP-2024-Support-SLA', 'SOP-2024-Enterprise-Support'],
      suggested_action: 'Unify response time to 2 hours across all support SOPs and update the SLA documentation.',
      auto_resolvable: false,
    },
    {
      severity: 'High',
      type: 'Outdated Reference',
      title: 'Deprecated API endpoint referenced in integration guide',
      description: 'The integration guide FAQ-API-v2-Setup references /api/v2/auth which was deprecated 3 months ago. Current endpoint is /api/v3/auth.',
      affected_artifacts: ['FAQ-API-v2-Setup'],
      suggested_action: 'Update all references from /api/v2/ to /api/v3/ in the integration guide.',
      auto_resolvable: true,
    },
    {
      severity: 'Medium',
      type: 'Missing Coverage',
      title: 'No SOP for new billing dispute workflow',
      description: 'Recent Slack threads indicate a new billing dispute process was adopted 2 weeks ago, but no SOP has been created to document it.',
      affected_artifacts: ['thread-billing-dispute-2024-01'],
      suggested_action: 'Create a new SOP documenting the billing dispute resolution workflow.',
      auto_resolvable: false,
    },
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
}

function getRoleBadgeClasses(role: string): string {
  const map: Record<string, string> = {
    Sales: 'bg-blue-100 text-blue-700 border-blue-200',
    PM: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'Support Engineer': 'bg-green-100 text-green-700 border-green-200',
    Ops: 'bg-purple-100 text-purple-700 border-purple-200',
    Delivery: 'bg-amber-100 text-amber-700 border-amber-200',
    Finance: 'bg-rose-100 text-rose-700 border-rose-200',
    Leadership: 'bg-slate-200 text-slate-700 border-slate-300',
  }
  return map[role] ?? 'bg-gray-100 text-gray-700 border-gray-200'
}

function getSeverityBadgeClasses(severity: string): string {
  const s = severity?.toLowerCase() ?? ''
  if (s === 'critical') return 'bg-red-600 text-white'
  if (s === 'high') return 'bg-orange-500 text-white'
  if (s === 'medium') return 'bg-yellow-500 text-gray-900'
  if (s === 'low') return 'bg-blue-400 text-white'
  return 'bg-gray-400 text-white'
}

function getTypeBadgeClasses(type: string): string {
  const t = type?.toLowerCase() ?? ''
  if (t === 'faq') return 'bg-teal-100 text-teal-700'
  if (t === 'sop') return 'bg-sky-100 text-sky-800'
  if (t === 'known issue' || t === 'known_issue') return 'bg-red-50 text-red-600'
  if (t === 'best practice' || t === 'best_practice') return 'bg-amber-50 text-amber-700'
  return 'bg-gray-100 text-gray-700'
}

function generateSessionId(): string {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

// ---------------------------------------------------------------------------
// Glass Card wrapper
// ---------------------------------------------------------------------------

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[0.875rem] border border-white/20 shadow-sm ${className}`} style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(16px)' }}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({ activeView, setActiveView, collapsed, setCollapsed, selectedRole, setSelectedRole }: {
  activeView: string
  setActiveView: (v: string) => void
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  selectedRole: Role
  setSelectedRole: (r: Role) => void
}) {
  const navItems = [
    { key: 'chat', label: 'Chat', icon: FiMessageSquare },
    { key: 'knowledge', label: 'Knowledge Base', icon: FiDatabase },
    { key: 'admin', label: 'Admin Dashboard', icon: FiSettings },
  ]

  return (
    <div className={`flex flex-col h-full border-r border-border transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`} style={{ background: 'hsl(210 40% 97%)' }}>
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <FiZap className="text-primary-foreground w-4 h-4" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">KKIA</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <FiZap className="text-primary-foreground w-4 h-4" />
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="p-1 rounded hover:bg-accent transition-colors">
          {collapsed ? <FiChevronRight className="w-4 h-4 text-muted-foreground" /> : <FiChevronLeft className="w-4 h-4 text-muted-foreground" />}
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeView === item.key
          return (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {!collapsed && (
        <div className="p-4 border-t border-border space-y-3">
          <Label className="text-xs text-muted-foreground font-medium">Your Role</Label>
          <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as Role)}>
            <SelectTrigger className="w-full h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>{role}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat View
// ---------------------------------------------------------------------------

function ChatView({ selectedRole, sampleMode, activeAgentId, setActiveAgentId }: {
  selectedRole: Role
  sampleMode: boolean
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => generateSessionId())
  const scrollRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sampleMode) {
      setMessages(SAMPLE_CHAT_MESSAGES)
    } else {
      setMessages([])
    }
  }, [sampleMode])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const quickChips = ['Recent SOPs', 'Known Issues', 'FAQs']

  const handleSend = async (text?: string) => {
    const msg = text ?? inputValue.trim()
    if (!msg) return
    setError(null)

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInputValue('')
    setLoading(true)
    setActiveAgentId(ROLE_KNOWLEDGE_AGENT_ID)

    try {
      const contextMessage = `[Role: ${selectedRole}] ${msg}`
      const result = await callAIAgent(contextMessage, ROLE_KNOWLEDGE_AGENT_ID, { session_id: sessionId })

      if (result.success) {
        const data = result?.response?.result as unknown as KnowledgeAgentResponse | undefined
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data?.answer ?? result?.response?.message ?? 'No response received.',
          timestamp: new Date().toISOString(),
          data: data ?? undefined,
        }
        setMessages((prev) => [...prev, assistantMsg])
      } else {
        setError(result?.error ?? 'Failed to get response from agent.')
        const errMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
          timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, errMsg])
      }
    } catch (err) {
      setError('Network error occurred.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }

  const lastAssistantData = [...messages].reverse().find((m) => m.role === 'assistant' && m.data)?.data

  return (
    <div className="flex h-full">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)' }}>
          <div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">Knowledge Assistant</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Ask questions tailored to your role</p>
          </div>
          <Badge variant="outline" className={`text-xs ${getRoleBadgeClasses(selectedRole)}`}>{selectedRole}</Badge>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
                <FiMessageSquare className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Start a conversation</h3>
              <p className="text-sm text-muted-foreground max-w-sm">Ask questions about SOPs, FAQs, known issues, or best practices. Responses are tailored to your {selectedRole} role.</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3' : ''}`}>
                {msg.role === 'user' ? (
                  <p className="text-sm">{msg.content}</p>
                ) : (
                  <GlassCard className="px-5 py-4">
                    {msg.data ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          {msg.data.confidence && (
                            <Badge variant="outline" className={`text-xs ${msg.data.confidence?.toLowerCase() === 'high' ? 'bg-green-50 text-green-700 border-green-200' : msg.data.confidence?.toLowerCase() === 'medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                              {msg.data.confidence} Confidence
                            </Badge>
                          )}
                          {msg.data.role_context && (
                            <span className="text-xs text-muted-foreground">{msg.data.role_context}</span>
                          )}
                        </div>
                        <div className="text-foreground">{renderMarkdown(msg.data.answer ?? msg.content)}</div>
                        {Array.isArray(msg.data?.related_topics) && msg.data.related_topics.length > 0 && (
                          <div className="pt-2 border-t border-border/50">
                            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Related Topics</p>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.data.related_topics.map((topic, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs cursor-pointer hover:bg-accent" onClick={() => handleSend(topic)}>{topic}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-foreground">{renderMarkdown(msg.content)}</div>
                    )}
                  </GlassCard>
                )}
                <p className="text-xs text-muted-foreground mt-1 px-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <GlassCard className="px-5 py-4 max-w-[80%]">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </GlassCard>
            </div>
          )}
        </div>

        {/* Follow-up suggestions */}
        {lastAssistantData && Array.isArray(lastAssistantData?.follow_up_suggestions) && lastAssistantData.follow_up_suggestions.length > 0 && !loading && (
          <div className="px-6 pb-2">
            <div className="flex flex-wrap gap-2">
              {lastAssistantData.follow_up_suggestions.map((sug, idx) => (
                <button key={idx} onClick={() => handleSend(sug)} className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:bg-accent transition-colors text-foreground">
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-6 pb-2">
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto"><FiX className="w-3 h-3" /></button>
            </div>
          </div>
        )}

        {/* Quick chips + input */}
        <div className="px-6 pb-4 pt-2 border-t border-border" style={{ background: 'rgba(255,255,255,0.6)' }}>
          <div className="flex gap-2 mb-3">
            {quickChips.map((chip) => (
              <button key={chip} onClick={() => handleSend(`Show me ${chip.toLowerCase()}`)} className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
                {chip}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Ask a question..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={() => handleSend()} disabled={loading || !inputValue.trim()} size="default" className="px-4">
              {loading ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSend className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Right panel: Sources */}
      <div className="w-80 border-l border-border hidden lg:flex flex-col" style={{ background: 'rgba(255,255,255,0.5)' }}>
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FiBookOpen className="w-4 h-4" /> Sources Used
          </h3>
        </div>
        <ScrollArea className="flex-1 p-4">
          {lastAssistantData && Array.isArray(lastAssistantData?.sources) && lastAssistantData.sources.length > 0 ? (
            <Accordion type="single" collapsible className="space-y-2">
              {lastAssistantData.sources.map((source, idx) => (
                <AccordionItem key={idx} value={`source-${idx}`} className="border rounded-lg px-3">
                  <AccordionTrigger className="text-sm py-2.5 hover:no-underline">
                    <div className="flex flex-col items-start gap-1 text-left">
                      <span className="font-medium text-foreground">{source?.title ?? 'Untitled'}</span>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs ${getTypeBadgeClasses(source?.type ?? '')}`}>{source?.type ?? 'Unknown'}</Badge>
                        <span className="text-xs text-muted-foreground">{((source?.relevance_score ?? 0) * 100).toFixed(0)}% match</span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-xs text-muted-foreground leading-relaxed">{source?.excerpt ?? ''}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FiBookOpen className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Sources will appear here when you ask a question</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Knowledge Base View
// ---------------------------------------------------------------------------

function KnowledgeBaseView({ sampleMode }: { sampleMode: boolean }) {
  const [documents, setDocuments] = useState<RAGDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<RAGDocument | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true)
    try {
      const result = await getDocuments(RAG_ID)
      if (result.success && Array.isArray(result.documents)) {
        setDocuments(result.documents)
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to load documents.' })
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    setStatusMessage(null)
    try {
      const file = files[0]
      const result = await uploadAndTrainDocument(RAG_ID, file)
      if (result.success) {
        setStatusMessage({ type: 'success', text: `${result.fileName ?? file.name} uploaded and training started.` })
        await loadDocuments()
      } else {
        setStatusMessage({ type: 'error', text: result.error ?? 'Upload failed.' })
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Upload error occurred.' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (docName: string) => {
    setStatusMessage(null)
    try {
      const result = await deleteDocuments(RAG_ID, [docName])
      if (result.success) {
        setStatusMessage({ type: 'success', text: `${docName} deleted.` })
        setDocuments((prev) => prev.filter((d) => d.fileName !== docName))
      } else {
        setStatusMessage({ type: 'error', text: result.error ?? 'Delete failed.' })
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Delete error occurred.' })
    }
  }

  const filteredDocs = documents.filter((d) =>
    d.fileName?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getFileIcon = (name: string) => {
    if (name?.endsWith('.pdf')) return <FiFile className="w-5 h-5 text-red-500" />
    if (name?.endsWith('.docx')) return <FiFile className="w-5 h-5 text-blue-500" />
    return <FiFile className="w-5 h-5 text-gray-500" />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)' }}>
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Knowledge Base</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Browse, upload, and manage knowledge documents</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>
            {viewMode === 'grid' ? <FiList className="w-4 h-4" /> : <FiGrid className="w-4 h-4" />}
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <FiRefreshCw className="w-4 h-4 animate-spin mr-2" /> : <FiUpload className="w-4 h-4 mr-2" />}
            Upload Document
          </Button>
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} className="hidden" />
        </div>
      </div>

      {statusMessage && (
        <div className={`mx-6 mt-4 flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg ${statusMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {statusMessage.type === 'success' ? <FiCheckCircle className="w-4 h-4" /> : <FiAlertCircle className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="ml-auto"><FiX className="w-3 h-3" /></button>
        </div>
      )}

      {/* Search */}
      <div className="px-6 pt-4">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Document list */}
      <ScrollArea className="flex-1 p-6">
        {loadingDocs ? (
          <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-3'}`}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <GlassCard key={i} className="p-4">
                <Skeleton className="h-5 w-3/4 mb-3" />
                <Skeleton className="h-3 w-1/2 mb-2" />
                <Skeleton className="h-3 w-1/3" />
              </GlassCard>
            ))}
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FiDatabase className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-base font-semibold text-foreground mb-1">{searchQuery ? 'No matching documents' : 'No documents yet'}</h3>
            <p className="text-sm text-muted-foreground max-w-sm">{searchQuery ? 'Try a different search term' : 'Upload PDF, DOCX, or TXT files to build your knowledge base.'}</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDocs.map((doc, idx) => (
              <GlassCard key={idx} className="p-4 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    {getFileIcon(doc.fileName)}
                    <div>
                      <p className="text-sm font-medium text-foreground truncate max-w-[180px]">{doc.fileName}</p>
                      <p className="text-xs text-muted-foreground">{doc.fileType?.toUpperCase()}</p>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(doc.fileName) }} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50">
                    <FiTrash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={`text-xs ${doc.status === 'active' ? 'bg-green-50 text-green-600 border-green-200' : doc.status === 'processing' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    {doc.status ?? 'unknown'}
                  </Badge>
                  {doc.uploadedAt && <span className="text-xs text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString()}</span>}
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDocs.map((doc, idx) => (
              <GlassCard key={idx} className="p-3 hover:shadow-md transition-shadow group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getFileIcon(doc.fileName)}
                    <div>
                      <p className="text-sm font-medium text-foreground">{doc.fileName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{doc.fileType?.toUpperCase()}</span>
                        {doc.uploadedAt && <span className="text-xs text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${doc.status === 'active' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                      {doc.status ?? 'unknown'}
                    </Badge>
                    <button onClick={() => handleDelete(doc.fileName)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50">
                      <FiTrash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Document detail dialog */}
      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedDoc?.fileName ?? 'Document'}</DialogTitle>
            <DialogDescription>Document details</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{selectedDoc?.fileType}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline">{selectedDoc?.status}</Badge></div>
            {selectedDoc?.uploadedAt && <div className="flex justify-between"><span className="text-muted-foreground">Uploaded</span><span>{new Date(selectedDoc.uploadedAt).toLocaleString()}</span></div>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Admin Dashboard View
// ---------------------------------------------------------------------------

function AdminDashboardView({ sampleMode, activeAgentId, setActiveAgentId }: {
  sampleMode: boolean
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
}) {
  const [pipelineData, setPipelineData] = useState<PipelineManagerResponse | null>(null)
  const [conflictData, setConflictData] = useState<ConflictDetectionResponse | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(false)
  const [conflictLoading, setConflictLoading] = useState(false)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [conflictError, setConflictError] = useState<string | null>(null)

  // Schedule state
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(false)
  const [scheduleLogs, setScheduleLogs] = useState<Record<string, ExecutionLog[]>>({})
  const [scheduleActionMsg, setScheduleActionMsg] = useState<string | null>(null)
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null)
  const [triggeringId, setTriggeringId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Admin tab
  const [adminTab, setAdminTab] = useState('overview')

  useEffect(() => {
    if (sampleMode) {
      setPipelineData(SAMPLE_PIPELINE_RESPONSE)
      setConflictData(SAMPLE_CONFLICT_RESPONSE)
    } else {
      setPipelineData(null)
      setConflictData(null)
    }
  }, [sampleMode])

  // Load schedules on mount
  const loadSchedules = useCallback(async () => {
    setSchedulesLoading(true)
    try {
      const result = await listSchedules()
      if (result.success) {
        setSchedules(result.schedules)
      }
    } catch {
      // silent
    } finally {
      setSchedulesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSchedules()
  }, [loadSchedules])

  const handleRunPipeline = async () => {
    setPipelineLoading(true)
    setPipelineError(null)
    setActiveAgentId(PIPELINE_MANAGER_AGENT_ID)
    try {
      const result = await callAIAgent('Run full ingestion pipeline', PIPELINE_MANAGER_AGENT_ID)
      if (result.success) {
        const data = result?.response?.result as unknown as PipelineManagerResponse | undefined
        if (data) setPipelineData(data)
      } else {
        setPipelineError(result?.error ?? 'Pipeline execution failed.')
      }
    } catch {
      setPipelineError('Network error.')
    } finally {
      setPipelineLoading(false)
      setActiveAgentId(null)
    }
  }

  const handleRunConflictScan = async () => {
    setConflictLoading(true)
    setConflictError(null)
    setActiveAgentId(CONFLICT_DETECTION_AGENT_ID)
    try {
      const result = await callAIAgent('Run knowledge base audit and conflict scan', CONFLICT_DETECTION_AGENT_ID)
      if (result.success) {
        const data = result?.response?.result as unknown as ConflictDetectionResponse | undefined
        if (data) setConflictData(data)
      } else {
        setConflictError(result?.error ?? 'Conflict scan failed.')
      }
    } catch {
      setConflictError('Network error.')
    } finally {
      setConflictLoading(false)
      setActiveAgentId(null)
    }
  }

  const handleToggleSchedule = async (schedule: Schedule) => {
    setTogglingId(schedule.id)
    setScheduleActionMsg(null)
    try {
      const result = schedule.is_active
        ? await pauseSchedule(schedule.id)
        : await resumeSchedule(schedule.id)
      if (result.success) {
        setScheduleActionMsg(`Schedule ${schedule.is_active ? 'paused' : 'activated'} successfully.`)
      } else {
        setScheduleActionMsg(`Failed: ${result.error ?? 'Unknown error'}`)
      }
      await loadSchedules()
    } catch {
      setScheduleActionMsg('Action failed.')
    } finally {
      setTogglingId(null)
    }
  }

  const handleTriggerNow = async (scheduleId: string) => {
    setTriggeringId(scheduleId)
    setScheduleActionMsg(null)
    try {
      const result = await triggerScheduleNow(scheduleId)
      if (result.success) {
        setScheduleActionMsg('Schedule triggered successfully. Execution started.')
      } else {
        setScheduleActionMsg(`Trigger failed: ${result.error ?? 'Unknown error'}`)
      }
    } catch {
      setScheduleActionMsg('Trigger failed.')
    } finally {
      setTriggeringId(null)
    }
  }

  const handleLoadLogs = async (scheduleId: string) => {
    if (expandedSchedule === scheduleId) {
      setExpandedSchedule(null)
      return
    }
    setExpandedSchedule(scheduleId)
    try {
      const result = await getScheduleLogs(scheduleId, { limit: 10 })
      if (result.success) {
        setScheduleLogs((prev) => ({ ...prev, [scheduleId]: result.executions }))
      }
    } catch {
      // silent
    }
  }

  const summary = pipelineData?.pipeline_summary
  const stages = pipelineData?.stage_results
  const scanSummary = conflictData?.scan_summary
  const findings = Array.isArray(conflictData?.findings) ? conflictData.findings : []

  // Metric tiles data
  const metricTiles = [
    { label: 'Total Artifacts', value: summary?.total_artifacts_created ?? '--', icon: FiLayers, color: 'text-teal-600' },
    { label: 'Items Fetched', value: summary?.total_items_fetched ?? '--', icon: FiDownload, color: 'text-blue-600' },
    { label: 'Pipeline Duration', value: summary?.pipeline_duration ?? '--', icon: FiClock, color: 'text-purple-600' },
    { label: 'Active Conflicts', value: scanSummary?.issues_found ?? '--', icon: FiAlertTriangle, color: 'text-orange-600' },
    { label: 'Errors', value: summary?.errors_encountered ?? '--', icon: FiAlertCircle, color: 'text-red-600' },
  ]

  const sourceBreakdown = stages?.communication_listener?.source_breakdown
  const sources = sourceBreakdown ? [
    { name: 'Gmail', count: sourceBreakdown.gmail ?? 0, color: 'bg-red-100 text-red-700' },
    { name: 'Outlook', count: sourceBreakdown.outlook ?? 0, color: 'bg-blue-100 text-blue-700' },
    { name: 'Slack', count: sourceBreakdown.slack ?? 0, color: 'bg-purple-100 text-purple-700' },
    { name: 'Teams', count: sourceBreakdown.teams ?? 0, color: 'bg-indigo-100 text-indigo-700' },
    { name: 'HubSpot', count: sourceBreakdown.hubspot ?? 0, color: 'bg-orange-100 text-orange-700' },
    { name: 'Notion', count: sourceBreakdown.notion ?? 0, color: 'bg-gray-200 text-gray-700' },
  ] : []

  const artifactTypes = stages?.knowledge_structuring?.artifacts_by_type
  const artifactBars = artifactTypes ? [
    { name: 'FAQs', count: artifactTypes.faqs ?? 0, color: 'bg-teal-500' },
    { name: 'SOPs', count: artifactTypes.sops ?? 0, color: 'bg-sky-600' },
    { name: 'Known Issues', count: artifactTypes.known_issues ?? 0, color: 'bg-red-400' },
    { name: 'Best Practices', count: artifactTypes.best_practices ?? 0, color: 'bg-amber-400' },
  ] : []

  const maxArtifactCount = Math.max(...artifactBars.map((a) => a.count), 1)

  // Role access config
  const rolePermissions = ROLES.map((role) => ({
    role,
    read: true,
    write: role === 'Leadership' || role === 'Ops',
    admin: role === 'Leadership',
  }))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)' }}>
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Admin Dashboard</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Pipeline management, conflict detection, and system health</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRunConflictScan} disabled={conflictLoading}>
            {conflictLoading ? <FiRefreshCw className="w-4 h-4 animate-spin mr-2" /> : <FiShield className="w-4 h-4 mr-2" />}
            Run Conflict Scan
          </Button>
          <Button size="sm" onClick={handleRunPipeline} disabled={pipelineLoading}>
            {pipelineLoading ? <FiRefreshCw className="w-4 h-4 animate-spin mr-2" /> : <FiPlay className="w-4 h-4 mr-2" />}
            Run Ingestion
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Error messages */}
          {pipelineError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg">
              <FiAlertCircle className="w-4 h-4" /><span>{pipelineError}</span>
              <button onClick={() => setPipelineError(null)} className="ml-auto"><FiX className="w-3 h-3" /></button>
            </div>
          )}
          {conflictError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg">
              <FiAlertCircle className="w-4 h-4" /><span>{conflictError}</span>
              <button onClick={() => setConflictError(null)} className="ml-auto"><FiX className="w-3 h-3" /></button>
            </div>
          )}

          {/* Metric tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {metricTiles.map((tile) => {
              const Icon = tile.icon
              return (
                <GlassCard key={tile.label} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-5 h-5 ${tile.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-foreground tracking-tight">{tile.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{tile.label}</p>
                </GlassCard>
              )
            })}
          </div>

          {/* Pipeline loading skeleton */}
          {pipelineLoading && (
            <GlassCard className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <FiRefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm font-medium text-foreground">Running ingestion pipeline...</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm text-muted-foreground">Communication Listener</span>
                  <Progress value={100} className="flex-1 h-2" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                  <span className="text-sm text-muted-foreground">Context Builder</span>
                  <Progress value={60} className="flex-1 h-2" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
                  <span className="text-sm text-muted-foreground">Knowledge Structuring</span>
                  <Progress value={20} className="flex-1 h-2" />
                </div>
              </div>
            </GlassCard>
          )}

          <Tabs value={adminTab} onValueChange={setAdminTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="conflicts">Conflicts {(scanSummary?.issues_found ?? 0) > 0 ? `(${scanSummary?.issues_found})` : ''}</TabsTrigger>
              <TabsTrigger value="schedules">Schedules</TabsTrigger>
              <TabsTrigger value="roles">Role Access</TabsTrigger>
            </TabsList>

            {/* === OVERVIEW TAB === */}
            <TabsContent value="overview" className="space-y-6">
              {/* Source breakdown */}
              {sources.length > 0 && (
                <GlassCard className="p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <FiActivity className="w-4 h-4" /> Source Breakdown
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {sources.map((src) => (
                      <div key={src.name} className={`rounded-lg p-3 text-center ${src.color}`}>
                        <p className="text-xl font-bold">{src.count}</p>
                        <p className="text-xs font-medium mt-0.5">{src.name}</p>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}

              {/* Stage results */}
              {stages && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <GlassCard className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2 h-2 rounded-full ${stages.communication_listener?.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <h4 className="text-sm font-semibold text-foreground">Communication Listener</h4>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stages.communication_listener?.items_fetched ?? 0}</p>
                    <p className="text-xs text-muted-foreground">items fetched</p>
                  </GlassCard>
                  <GlassCard className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2 h-2 rounded-full ${stages.context_builder?.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <h4 className="text-sm font-semibold text-foreground">Context Builder</h4>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stages.context_builder?.threads_created ?? 0}</p>
                    <p className="text-xs text-muted-foreground">threads created</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={(stages.context_builder?.avg_confidence ?? 0) * 100} className="flex-1 h-1.5" />
                      <span className="text-xs text-muted-foreground">{((stages.context_builder?.avg_confidence ?? 0) * 100).toFixed(0)}%</span>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2 h-2 rounded-full ${stages.knowledge_structuring?.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <h4 className="text-sm font-semibold text-foreground">Knowledge Structuring</h4>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stages.knowledge_structuring?.artifacts_created ?? 0}</p>
                    <p className="text-xs text-muted-foreground">artifacts created</p>
                  </GlassCard>
                </div>
              )}

              {/* Artifact type distribution */}
              {artifactBars.length > 0 && (
                <GlassCard className="p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <FiLayers className="w-4 h-4" /> Artifact Distribution
                  </h3>
                  <div className="space-y-3">
                    {artifactBars.map((a) => (
                      <div key={a.name} className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground w-28">{a.name}</span>
                        <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${a.color} rounded-full transition-all duration-500 flex items-center justify-end pr-2`} style={{ width: `${Math.max((a.count / maxArtifactCount) * 100, 8)}%` }}>
                            <span className="text-xs font-medium text-white">{a.count}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}

              {/* Empty state */}
              {!pipelineData && !pipelineLoading && (
                <GlassCard className="p-8">
                  <div className="text-center">
                    <FiActivity className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-foreground mb-1">No pipeline data</h3>
                    <p className="text-sm text-muted-foreground mb-4">Run the ingestion pipeline to see source breakdown and artifact metrics.</p>
                    <Button onClick={handleRunPipeline} disabled={pipelineLoading}>
                      <FiPlay className="w-4 h-4 mr-2" /> Run Ingestion Pipeline
                    </Button>
                  </div>
                </GlassCard>
              )}
            </TabsContent>

            {/* === CONFLICTS TAB === */}
            <TabsContent value="conflicts" className="space-y-4">
              {conflictLoading && (
                <GlassCard className="p-6">
                  <div className="flex items-center gap-3">
                    <FiRefreshCw className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-sm font-medium">Running conflict scan...</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
                  </div>
                </GlassCard>
              )}

              {/* Scan summary */}
              {scanSummary && (
                <GlassCard className="p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <FiShield className="w-4 h-4" /> Scan Summary
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    <div className="text-center p-2 rounded-lg bg-muted/50">
                      <p className="text-lg font-bold text-foreground">{scanSummary.total_artifacts_scanned ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Scanned</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/50">
                      <p className="text-lg font-bold text-foreground">{scanSummary.issues_found ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Issues Found</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-red-50">
                      <p className="text-lg font-bold text-red-600">{scanSummary.critical_count ?? 0}</p>
                      <p className="text-xs text-red-600">Critical</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-orange-50">
                      <p className="text-lg font-bold text-orange-600">{scanSummary.high_count ?? 0}</p>
                      <p className="text-xs text-orange-600">High</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-yellow-50">
                      <p className="text-lg font-bold text-yellow-600">{scanSummary.medium_count ?? 0}</p>
                      <p className="text-xs text-yellow-600">Medium</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-blue-50">
                      <p className="text-lg font-bold text-blue-600">{scanSummary.low_count ?? 0}</p>
                      <p className="text-xs text-blue-600">Low</p>
                    </div>
                  </div>
                </GlassCard>
              )}

              {/* Findings list */}
              {findings.length > 0 ? (
                <div className="space-y-3">
                  {findings.map((finding, idx) => (
                    <GlassCard key={idx} className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${getSeverityBadgeClasses(finding.severity)}`}>{finding.severity}</Badge>
                          <Badge variant="outline" className="text-xs">{finding.type}</Badge>
                        </div>
                        {finding.auto_resolvable && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">Auto-resolvable</Badge>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold text-foreground mb-2">{finding.title}</h4>
                      <p className="text-sm text-muted-foreground mb-3">{finding.description}</p>
                      {Array.isArray(finding.affected_artifacts) && finding.affected_artifacts.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-muted-foreground font-medium mb-1">Affected Artifacts</p>
                          <div className="flex flex-wrap gap-1.5">
                            {finding.affected_artifacts.map((art, artIdx) => (
                              <Badge key={artIdx} variant="secondary" className="text-xs">{art}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {finding.suggested_action && (
                        <div className="bg-accent/50 rounded-lg p-3 mt-2">
                          <p className="text-xs text-muted-foreground font-medium mb-1">Suggested Action</p>
                          <p className="text-sm text-foreground">{finding.suggested_action}</p>
                        </div>
                      )}
                    </GlassCard>
                  ))}
                </div>
              ) : !conflictLoading ? (
                <GlassCard className="p-8">
                  <div className="text-center">
                    <FiShield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-foreground mb-1">No conflict data</h3>
                    <p className="text-sm text-muted-foreground mb-4">Run a conflict scan to detect contradictions, outdated content, and missing coverage.</p>
                    <Button variant="outline" onClick={handleRunConflictScan} disabled={conflictLoading}>
                      <FiShield className="w-4 h-4 mr-2" /> Run Conflict Scan
                    </Button>
                  </div>
                </GlassCard>
              ) : null}
            </TabsContent>

            {/* === SCHEDULES TAB === */}
            <TabsContent value="schedules" className="space-y-4">
              {scheduleActionMsg && (
                <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg bg-blue-50 text-blue-700">
                  <FiInfo className="w-4 h-4" /><span>{scheduleActionMsg}</span>
                  <button onClick={() => setScheduleActionMsg(null)} className="ml-auto"><FiX className="w-3 h-3" /></button>
                </div>
              )}

              {schedulesLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
                </div>
              ) : schedules.length > 0 ? (
                <div className="space-y-4">
                  {schedules.map((schedule) => {
                    const isPipeline = schedule.agent_id === PIPELINE_MANAGER_AGENT_ID
                    const isConflict = schedule.agent_id === CONFLICT_DETECTION_AGENT_ID
                    const name = isPipeline ? 'Pipeline Manager' : isConflict ? 'Conflict Detection' : 'Agent Schedule'
                    const desc = isPipeline ? 'Ingests communications and structures knowledge' : isConflict ? 'Scans for conflicts, contradictions, and outdated content' : 'Scheduled agent execution'
                    const logs = Array.isArray(scheduleLogs[schedule.id]) ? scheduleLogs[schedule.id] : []

                    return (
                      <GlassCard key={schedule.id} className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-sm font-semibold text-foreground">{name}</h4>
                              <Badge variant={schedule.is_active ? 'default' : 'secondary'} className="text-xs">
                                {schedule.is_active ? 'Active' : 'Paused'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{desc}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleTriggerNow(schedule.id)} disabled={triggeringId === schedule.id}>
                              {triggeringId === schedule.id ? <FiRefreshCw className="w-3 h-3 animate-spin mr-1" /> : <FiPlay className="w-3 h-3 mr-1" />}
                              Run Now
                            </Button>
                            <Button
                              variant={schedule.is_active ? 'outline' : 'default'}
                              size="sm"
                              onClick={() => handleToggleSchedule(schedule)}
                              disabled={togglingId === schedule.id}
                            >
                              {togglingId === schedule.id ? (
                                <FiRefreshCw className="w-3 h-3 animate-spin mr-1" />
                              ) : schedule.is_active ? (
                                <FiPause className="w-3 h-3 mr-1" />
                              ) : (
                                <FiPlay className="w-3 h-3 mr-1" />
                              )}
                              {schedule.is_active ? 'Pause' : 'Activate'}
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                          <div>
                            <span className="text-muted-foreground">Schedule</span>
                            <p className="font-medium text-foreground mt-0.5">{schedule.cron_expression ? cronToHuman(schedule.cron_expression) : 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Timezone</span>
                            <p className="font-medium text-foreground mt-0.5">{schedule.timezone ?? 'UTC'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Next Run</span>
                            <p className="font-medium text-foreground mt-0.5">{schedule.next_run_time ? new Date(schedule.next_run_time).toLocaleString() : 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Last Run</span>
                            <p className="font-medium text-foreground mt-0.5">{schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleString() : 'Never'}</p>
                          </div>
                        </div>

                        {/* Logs toggle */}
                        <button onClick={() => handleLoadLogs(schedule.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          {expandedSchedule === schedule.id ? <FiChevronUp className="w-3 h-3" /> : <FiChevronDown className="w-3 h-3" />}
                          Execution History
                        </button>

                        {expandedSchedule === schedule.id && (
                          <div className="mt-3 border-t border-border pt-3">
                            {logs.length > 0 ? (
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {logs.map((log) => (
                                  <div key={log.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/30">
                                    <div className="flex items-center gap-2">
                                      {log.success ? <FiCheckCircle className="w-3 h-3 text-green-500" /> : <FiAlertCircle className="w-3 h-3 text-red-500" />}
                                      <span className="text-muted-foreground">{new Date(log.executed_at).toLocaleString()}</span>
                                    </div>
                                    <Badge variant={log.success ? 'secondary' : 'destructive'} className="text-xs">
                                      {log.success ? 'Success' : 'Failed'}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground py-2">No execution history yet.</p>
                            )}
                          </div>
                        )}
                      </GlassCard>
                    )
                  })}
                </div>
              ) : (
                <GlassCard className="p-8">
                  <div className="text-center">
                    <FiClock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-foreground mb-1">No schedules found</h3>
                    <p className="text-sm text-muted-foreground">Schedules will appear here once configured.</p>
                    <Button variant="outline" className="mt-4" onClick={loadSchedules}>
                      <FiRefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                  </div>
                </GlassCard>
              )}
            </TabsContent>

            {/* === ROLES TAB === */}
            <TabsContent value="roles" className="space-y-4">
              <GlassCard className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <FiUsers className="w-4 h-4" /> Role Access Configuration
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Role</th>
                        <th className="text-center py-2 px-3 font-medium text-muted-foreground">Read</th>
                        <th className="text-center py-2 px-3 font-medium text-muted-foreground">Write</th>
                        <th className="text-center py-2 px-3 font-medium text-muted-foreground">Admin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rolePermissions.map((rp) => (
                        <tr key={rp.role} className="border-b border-border/50">
                          <td className="py-2.5 px-3">
                            <Badge variant="outline" className={`text-xs ${getRoleBadgeClasses(rp.role)}`}>{rp.role}</Badge>
                          </td>
                          <td className="text-center py-2.5 px-3">
                            <Switch checked={rp.read} disabled className="mx-auto" />
                          </td>
                          <td className="text-center py-2.5 px-3">
                            <Switch checked={rp.write} disabled className="mx-auto" />
                          </td>
                          <td className="text-center py-2.5 px-3">
                            <Switch checked={rp.admin} disabled className="mx-auto" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent Status Bar
// ---------------------------------------------------------------------------

function AgentStatusBar({ activeAgentId }: { activeAgentId: string | null }) {
  const agents = [
    { id: PIPELINE_MANAGER_AGENT_ID, name: 'Pipeline Manager', purpose: 'Orchestrates ingestion pipeline' },
    { id: ROLE_KNOWLEDGE_AGENT_ID, name: 'Knowledge Agent', purpose: 'Answers role-based queries' },
    { id: CONFLICT_DETECTION_AGENT_ID, name: 'Conflict Detection', purpose: 'Scans for conflicts and outdated content' },
  ]

  return (
    <div className="border-t border-border px-4 py-2 flex items-center gap-4" style={{ background: 'hsl(210 40% 97%)' }}>
      <span className="text-xs text-muted-foreground font-medium">Agents:</span>
      <div className="flex items-center gap-3">
        {agents.map((agent) => (
          <div key={agent.id} className="flex items-center gap-1.5" title={agent.purpose}>
            <div className={`w-1.5 h-1.5 rounded-full ${activeAgentId === agent.id ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className={`text-xs ${activeAgentId === agent.id ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{agent.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Page() {
  const [activeView, setActiveView] = useState('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role>('Support Engineer')
  const [sampleMode, setSampleMode] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  return (
    <ErrorBoundary>
      <div style={THEME_VARS} className="h-screen flex flex-col bg-background text-foreground font-sans" >
        {/* Top bar with sample toggle */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border" style={{ background: 'linear-gradient(135deg, hsl(210 20% 97%) 0%, hsl(220 25% 95%) 35%, hsl(200 20% 96%) 70%, hsl(230 15% 97%) 100%)' }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <FiZap className="text-primary-foreground w-3 h-3" />
            </div>
            <span className="text-sm font-semibold text-foreground tracking-tight">Kambaa Knowledge Intelligence Agent</span>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground">Sample Data</Label>
            <Switch id="sample-toggle" checked={sampleMode} onCheckedChange={setSampleMode} />
          </div>
        </div>

        {/* Main layout */}
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            activeView={activeView}
            setActiveView={setActiveView}
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
            selectedRole={selectedRole}
            setSelectedRole={setSelectedRole}
          />
          <main className="flex-1 flex flex-col overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(210 20% 97%) 0%, hsl(220 25% 95%) 35%, hsl(200 20% 96%) 70%, hsl(230 15% 97%) 100%)' }}>
            {activeView === 'chat' && (
              <ChatView selectedRole={selectedRole} sampleMode={sampleMode} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />
            )}
            {activeView === 'knowledge' && (
              <KnowledgeBaseView sampleMode={sampleMode} />
            )}
            {activeView === 'admin' && (
              <AdminDashboardView sampleMode={sampleMode} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />
            )}
          </main>
        </div>

        {/* Agent status bar */}
        <AgentStatusBar activeAgentId={activeAgentId} />
      </div>
    </ErrorBoundary>
  )
}
