import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Activity, ArrowUpRight, Check, ChevronDown, CircleHelp, Code2, FileCode2, FlaskConical, FolderKanban, History, Moon, Play, Plus, RefreshCw, Save, ShieldCheck, Sparkles, Sun, Terminal, WandSparkles } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
type Project = { id:number; name:string; source_code:string; test_code:string }
type Analysis = { valid:boolean; error?:string; functions:{name:string;line:number;parameters:string[]}[]; classes:{name:string;line:number}[]; branches:number; loops:number; exceptions:number }
type Run = { id:number; status:string; passed:number; failed:number; skipped:number; duration_seconds:number; output:string; created_at:string|null }
const sample = `def calculate_discount(price, percentage):
    if price < 0:
        raise ValueError("Price cannot be negative")
    if not 0 <= percentage <= 100:
        raise ValueError("Percentage must be between 0 and 100")
    return price * (1 - percentage / 100)


def normalize_name(name):
    return " ".join(name.strip().split()).title()
`
export default function App() {
  const [dark, setDark] = useState(true)
  const [authUser, setAuthUser] = useState<string>(() => localStorage.getItem('testpilot_user') || '')
  const [authMode, setAuthMode] = useState<'login'|'register'>('login')
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  async function submitAuth(e: FormEvent) {
    e.preventDefault(); setAuthError('')
    const email = authEmail.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAuthError('Please enter a valid email address.'); return }
    if (authPassword.length < 6) { setAuthError('Password must be at least 6 characters.'); return }
    const key = 'testpilot_accounts_v1'
    const accounts: Record<string,{name:string,passwordHash:string}> = JSON.parse(localStorage.getItem(key) || '{}')
    const passwordHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authPassword)))).map(b=>b.toString(16).padStart(2,'0')).join('')
    if (authMode === 'register') {
      if (!authName.trim()) { setAuthError('Please enter your name.'); return }
      if (accounts[email]) { setAuthError('An account with this email already exists. Please log in.'); return }
      accounts[email] = {name:authName.trim(), passwordHash}; localStorage.setItem(key, JSON.stringify(accounts))
    } else if (!accounts[email] || accounts[email].passwordHash !== passwordHash) { setAuthError('Email or password is incorrect. Register first if you are new.'); return }
    localStorage.setItem('testpilot_user', email); setAuthUser(email); setAuthPassword('')
  }
  function logout() { localStorage.removeItem('testpilot_user'); setAuthUser(''); setAuthMode('login') }
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project|null>(null)
  const [name, setName] = useState('Untitled Python Project')
  const [source, setSource] = useState(sample)
  const [tests, setTests] = useState('')
  const [analysis, setAnalysis] = useState<Analysis|null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [activeTab, setActiveTab] = useState<'source'|'tests'>('source')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('Connect to the local API to save projects and run analysis.')
  const [apiOk, setApiOk] = useState(false)
  const [selectedRun, setSelectedRun] = useState<Run|null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState('')
  async function request(path:string, init?:RequestInit) {
    const res = await fetch(API+path, { ...init, headers:{'Content-Type':'application/json', ...(init?.headers||{})} })
    const body = await res.json().catch(()=>({detail:res.statusText}))
    if (!res.ok) throw new Error(body.detail || 'Request failed')
    return body
  }
  async function refreshProjects() {
    try { const data = await request('/api/projects'); setProjects(data); setApiOk(true); setError('') }
    catch(e) { setApiOk(false); setError(e instanceof Error ? e.message : 'API unavailable') }
  }
  useEffect(()=>{ refreshProjects() },[])
  async function createProject() {
    setBusy(true); setError('')
    try {
      const p = await request('/api/projects',{method:'POST',body:JSON.stringify({name,source_code:source,test_code:tests})})
      setProject(p); setProjects((old)=>[p,...old]); setNotice('Project created and saved.'); await refreshRuns(p.id)
    } catch(e) { setError(e instanceof Error?e.message:'Could not create project') } finally {setBusy(false)}
  }
  async function saveProject() {
    if (!project) { await createProject(); return }
    setBusy(true); setError('')
    try {
      const p = await request(`/api/projects/${project.id}`,{method:'PUT',body:JSON.stringify({name,source_code:source,test_code:tests})})
      setProject(p); setProjects(old=>old.map(x=>x.id===p.id?p:x)); setNotice('All changes saved.')
    } catch(e) {setError(e instanceof Error?e.message:'Could not save')} finally {setBusy(false)}
  }
  async function loadProject(p:Project) {
    setProject(p);setName(p.name);setSource(p.source_code);setTests(p.test_code);setAnalysis(null);setSelectedRun(null);await refreshRuns(p.id);setNotice(`Opened ${p.name}`)
  }
  async function analyze() {
    setBusy(true);setError('')
    try {
      if(!project) { const p = await request('/api/projects',{method:'POST',body:JSON.stringify({name,source_code:source,test_code:tests})});setProject(p);setProjects(old=>[p,...old]) }
      const p = project || await request('/api/projects').then((xs:Project[])=>xs[0])
      const data = await request(`/api/projects/${p.id}/analyze`,{method:'POST'});setAnalysis(data);setNotice(data.valid?'Source analysis completed.':'Source has syntax errors.')
    } catch(e) {setError(e instanceof Error?e.message:'Analysis failed')} finally{setBusy(false)}
  }
  async function generate() {
    setBusy(true);setError('')
    try {
      let p=project
      if(!p) {p=await request('/api/projects',{method:'POST',body:JSON.stringify({name,source_code:source,test_code:tests})});setProject(p);setProjects(old=>[p!,...old])}
      else await request(`/api/projects/${p.id}`,{method:'PUT',body:JSON.stringify({name,source_code:source,test_code:tests})})
      const data=await request(`/api/projects/${p.id}/generate`,{method:'POST'});setTests(data.code);setActiveTab('tests');setNotice(`Generated ${data.tests?.length||0} reviewable test suggestions.`)
      await refreshProjects()
    }catch(e){setError(e instanceof Error?e.message:'Generation failed')}finally{setBusy(false)}
  }
  async function validate() {
    setBusy(true);setError('')
    try {const data=await request(`/api/projects/${project?.id}/validate`,{method:'POST',body:JSON.stringify({source_code:source,test_code:tests})});setNotice(data.source_valid&&data.tests_valid?'Both files have valid Python syntax.':`Validation: source ${data.source_valid?'valid':data.source_error}; tests ${data.tests_valid?'valid':data.tests_error}`)}
    catch(e){setError(e instanceof Error?e.message:'Validation failed')}finally{setBusy(false)}
  }
  async function refreshRuns(id:number) {try{setRuns(await request(`/api/projects/${id}/runs`))}catch{setRuns([])}}
  async function runTests() {
    if(!project) {setError('Save a project before running tests.');return}
    await saveProject();setBusy(true);setError('')
    try {const r=await request(`/api/projects/${project.id}/runs`,{method:'POST'});setRuns(old=>[r,...old]);setSelectedRun(r);setShowHistory(true);setNotice('Test run completed with real runner output.')}
    catch(e){setError(e instanceof Error?e.message:'Test runner unavailable')}finally{setBusy(false)}
  }
  const totalRuns = runs.length
  const passed = runs.reduce((n,r)=>n+r.passed,0)
  const failed = runs.reduce((n,r)=>n+r.failed,0)
  const activeStats = useMemo(()=>analysis?[
    {label:'Functions',value:analysis.functions.length,icon:<Code2 size={18}/>},
    {label:'Branches',value:analysis.branches,icon:<Activity size={18}/>},
    {label:'Loops',value:analysis.loops,icon:<RefreshCw size={18}/>},
    {label:'Exception paths',value:analysis.exceptions,icon:<ShieldCheck size={18}/>}
  ]:[],[analysis])
  if (!authUser) return <div className={'auth-shell '+(dark?'auth-dark':'auth-light')}><div className='auth-brand'><div className='auth-logo'>✦</div><div><b>TestPilot <span>AI</span></b><small>INTELLIGENT TEST ENGINEERING</small></div></div><div className='auth-card'><div className='auth-kicker'>YOUR TESTING WORKSPACE</div><h1>{authMode==='login'?'Welcome back':'Create your account'}<span>.</span></h1><p>{authMode==='login'?'Sign in to continue to your workspace.':'Start organizing code analysis and test generation.'}</p><form onSubmit={submitAuth}>{authMode==='register'&&<label>Full name<input value={authName} onChange={e=>setAuthName(e.target.value)} placeholder='Your name' autoComplete='name'/></label>}<label>Email address<input type='email' value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder='you@example.com' autoComplete='email'/></label><label>Password<input type='password' value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder='At least 6 characters' autoComplete={authMode==='login'?'current-password':'new-password'}/></label>{authError&&<div className='auth-error'>{authError}</div>}<button className='auth-submit' type='submit'>{authMode==='login'?'Sign in to workspace':'Create account'} <span>→</span></button></form><div className='auth-switch'>{authMode==='login'?"Don't have an account?":"Already registered?"} <button onClick={()=>{setAuthMode(authMode==='login'?'register':'login');setAuthError('')}}>{authMode==='login'?'Create account':'Sign in'}</button></div><div className='auth-local-note'>Demo authentication · account is stored in this browser only</div></div><div className='auth-bottom'>Analyze code · Generate tests · Validate syntax</div></div>
  return <div className={dark?'app dark':'app light'}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><FlaskConical size={21}/></div><div><b>TestPilot <span>AI</span></b><small>QUALITY ENGINEERING</small></div></div>
      <div className="workspace-label">WORKSPACE <ChevronDown size={13}/></div>
      <button className="nav-item active"><FolderKanban size={17}/> Test workspace</button>
      <button className="nav-item" onClick={()=>setShowHistory(!showHistory)}><History size={17}/> Test history <span className="nav-count">{totalRuns}</span></button>
      <div className="side-section">YOUR PROJECTS <button title="New project" onClick={()=>{setProject(null);setName('Untitled Python Project');setSource('');setTests('');setAnalysis(null)}}><Plus size={15}/></button></div>
      <div className="project-list">{projects.map(p=><button key={p.id} className={'project-link '+(project?.id===p.id?'chosen':'')} onClick={()=>loadProject(p)}><FileCode2 size={15}/><span>{p.name}</span></button>)}
      {!projects.length&&<p className="muted tiny">Saved projects appear here.</p>}</div>
      <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={17}/><div><b>Sandbox-first</b><small>Execution disabled by default</small></div></div><div className="user-row"><div className="avatar">TP</div><div><b>Local workspace</b><small>Developer mode</small></div><CircleHelp size={17}/></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <b>{project?.name||'New project'}</b></div><div className="top-actions"><span className={'connection '+(apiOk?'online':'offline')}><i/>{apiOk?'API connected':'API disconnected'}</span><button className="btn secondary" onClick={logout}>Sign out</button><button className="icon-btn" onClick={()=>setDark(!dark)} title="Toggle theme">{dark?<Sun size={17}/>:<Moon size={17}/>}</button><button className="btn secondary" onClick={saveProject} disabled={busy}><Save size={15}/> Save project</button></div></header>
      <section className="content">
        <div className="page-intro"><div><div className="eyebrow"><Sparkles size={14}/> AI-ASSISTED TEST ENGINEERING</div><h1>Test workspace<span>.</span></h1><p>Analyze your Python code, generate test ideas, and validate behavior with confidence.</p></div><div className="intro-mark"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="mark-core"><FlaskConical size={29}/></div></div></div>
        {error&&<div className="alert error"><CircleHelp size={17}/><span>{error}</span><button onClick={()=>setError('')}>Dismiss</button></div>}
        <div className="notice"><Activity size={16}/><span>{notice}</span><button onClick={refreshProjects}><RefreshCw size={14}/></button></div>
        <div className="metrics">
          <div className="metric"><div className="metric-top"><span>Test runs</span><span className="metric-icon"><History size={17}/></span></div><strong>{totalRuns}</strong><small>Recorded runs for this project</small></div>
          <div className="metric"><div className="metric-top"><span>Passed tests</span><span className="metric-icon green"><Check size={17}/></span></div><strong>{passed}</strong><small>From actual runner summaries</small></div>
          <div className="metric"><div className="metric-top"><span>Failed tests</span><span className="metric-icon red"><Activity size={17}/></span></div><strong>{failed}</strong><small>Needs investigation</small></div>
          <div className="metric"><div className="metric-top"><span>Coverage</span><span className="metric-icon violet"><Activity size={17}/></span></div><strong>—</strong><small>Shown after coverage parsing is configured</small></div>
        </div>
        <div className="work-grid">
          <section className="panel editor-panel">
            <div className="panel-head"><div className="panel-title"><span className="panel-icon"><Code2 size={17}/></span><div><b>Code workspace</b><small>Python source & generated tests</small></div></div><div className="head-actions"><button className="icon-btn" onClick={()=>setActiveTab('source')} title="Source code"><Code2 size={16}/></button><button className="icon-btn" onClick={()=>setActiveTab('tests')} title="Tests"><FlaskConical size={16}/></button></div></div>
            <div className="project-name"><label>PROJECT NAME</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Billing service"/></div>
            <div className="editor-tabs"><button className={activeTab==='source'?'selected':''} onClick={()=>setActiveTab('source')}><Code2 size={15}/> source_module.py</button><button className={activeTab==='tests'?'selected':''} onClick={()=>setActiveTab('tests')}><FlaskConical size={15}/> test_generated.py {tests&&<span className="dot"/>}</button><span className="language-pill">PYTHON</span></div>
            <div className="code-wrap"><div className="line-numbers">{(activeTab==='source'?source:tests).split('\n').map((_,i)=><span key={i}>{i+1}</span>)}</div><textarea spellCheck={false} aria-label={activeTab==='source'?'Python source editor':'Generated test editor'} value={activeTab==='source'?source:tests} onChange={e=>activeTab==='source'?setSource(e.target.value):setTests(e.target.value)} placeholder={activeTab==='source'?'Paste Python source code here…':'Generate tests or write pytest code here…'}/></div>
            <div className="editor-foot"><span><span className="status-dot"/> {activeTab==='source'?'Python source':'Pytest suite'} · editable</span><span>{(activeTab==='source'?source:tests).length.toLocaleString()} chars</span></div>
            <div className="editor-actions"><button className="btn secondary" onClick={analyze} disabled={busy}><Activity size={15}/> Analyze source</button><button className="btn primary" onClick={generate} disabled={busy}><WandSparkles size={15}/>{busy?'Working…':'Generate tests'} <ArrowUpRight size={15}/></button></div>
          </section>
          <section className="panel insight-panel">
            <div className="panel-head"><div className="panel-title"><span className="panel-icon purple"><Sparkles size={17}/></span><div><b>Code insights</b><small>Static analysis · Python AST</small></div></div><span className="live-label"><i/> LIVE</span></div>
            {!analysis?<div className="empty-insights"><div className="empty-illustration"><Code2 size={26}/><span>↗</span></div><b>Understand your code first</b><p>Run source analysis to identify functions, branches, loops, and exception paths.</p><button className="btn secondary" onClick={analyze} disabled={busy}><Activity size={15}/> Analyze code</button></div>:<>
              <div className={'analysis-status '+(analysis.valid?'good':'bad')}>{analysis.valid?<Check size={16}/>:<CircleHelp size={16}/>} {analysis.valid?'Syntax looks valid':analysis.error}</div>
              <div className="insight-stats">{activeStats.map(s=><div key={s.label} className="insight-stat"><span>{s.icon}</span><div><strong>{s.value}</strong><small>{s.label}</small></div></div>)}</div>
              <div className="symbol-list"><div className="subhead">DISCOVERED FUNCTIONS <span>{analysis.functions.length}</span></div>{analysis.functions.map(f=><div className="symbol" key={f.name}><Code2 size={14}/><div><b>{f.name}()</b><small>{f.parameters.length?f.parameters.join(', '):'No parameters'}</small></div><em>L{f.line}</em></div>)}{!analysis.functions.length&&<p className="muted tiny">No functions discovered.</p>}</div>
              <div className="symbol-list"><div className="subhead">CLASSES <span>{analysis.classes.length}</span></div>{analysis.classes.map(c=><div className="symbol" key={c.name}><FolderKanban size={14}/><b>{c.name}</b><em>L{c.line}</em></div>)}{!analysis.classes.length&&<p className="muted tiny">No classes discovered.</p>}</div>
            </>}
            <div className="insight-footer"><ShieldCheck size={15}/> Static analysis is advisory, not exhaustive.</div>
          </section>
        </div>
        <section className="panel run-panel">
          <div className="panel-head"><div className="panel-title"><span className="panel-icon amber"><Terminal size={17}/></span><div><b>Validation & execution</b><small>Review first, run in isolation</small></div></div><span className="safe-pill"><ShieldCheck size={13}/> SANDBOX REQUIRED</span></div>
          <div className="run-content"><div className="run-copy"><h3>Ready to verify your test suite?</h3><p>Validate Python syntax before running. Test execution is intentionally blocked until the isolated Docker runner is configured.</p><div className="run-actions"><button className="btn secondary" onClick={validate} disabled={busy}><Check size={15}/> Validate syntax</button><button className="btn primary" onClick={runTests} disabled={busy}><Play size={15} fill="currentColor"/> Run tests</button></div></div><div className="run-terminal"><div className="terminal-bar"><span/><span/><span/><small>runner / status</small></div><div className="terminal-body"><p><i>$</i> testpilot validate --syntax</p><p className="terminal-muted">Awaiting validation request…</p><p><i>$</i> pytest --cov</p><p className="terminal-muted">Execution requires isolated runner.</p></div></div></div>
        </section>
        {showHistory&&<section className="panel history-panel"><div className="panel-head"><div className="panel-title"><span className="panel-icon"><History size={17}/></span><div><b>Test run history</b><small>Persisted results only — no fabricated metrics</small></div></div><button className="icon-btn" onClick={()=>project&&refreshRuns(project.id)} title="Refresh history"><RefreshCw size={16}/></button></div>{!runs.length?<div className="history-empty">No test runs recorded for this project yet.</div>:<><div className="history-table"><div className="history-row history-header"><span>RUN</span><span>STATUS</span><span>PASSED</span><span>FAILED</span><span>DURATION</span><span>DETAILS</span></div>{runs.map(r=><div className="history-row" key={r.id}><span>#{r.id}</span><span><em className={'run-status '+r.status}>{r.status}</em></span><span>{r.passed}</span><span>{r.failed}</span><span>{r.duration_seconds.toFixed(2)}s</span><span><button className="text-btn" onClick={()=>setSelectedRun(r)}>View output</button></span></div>)}</div>{selectedRun&&<div className="run-output"><div><b>Run #{selectedRun.id} · {selectedRun.status}</b><button className="text-btn" onClick={()=>setSelectedRun(null)}>Close</button></div><pre>{selectedRun.output}</pre><div className="export-actions"><button className="btn secondary small" onClick={()=>window.open(`${API}/api/runs/${selectedRun.id}/report?format=markdown`,'_blank')}>Export Markdown</button><button className="btn secondary small" onClick={()=>window.open(`${API}/api/runs/${selectedRun.id}/report?format=json`,'_blank')}>Export JSON</button></div></div>}</>}</section>}
        <footer><span>TestPilot AI <span className="footer-dot">•</span> Test Smarter. Ship With Confidence.</span><span><ShieldCheck size={13}/> Built for careful testing</span></footer>
      </section>
    </main>
  </div>
}
