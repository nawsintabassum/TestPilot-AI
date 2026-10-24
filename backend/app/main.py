import json, os, subprocess, tempfile, time
from pathlib import Path
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy.orm import Session
from .db import Base, engine, get_db
from .models import Project, TestRun
from .schemas import ProjectCreate, ProjectUpdate, ProjectOut, ValidateRequest
from .analyzer import analyze_source, generate_tests

Base.metadata.create_all(bind=engine)
app = FastAPI(title="TestPilot AI API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

@app.get("/api/health")
def health():
    return {"status": "ok", "execution_enabled": os.getenv("RUNNER_ENABLED", "false").lower() == "true"}

@app.get("/api/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.updated_at.desc()).all()

@app.post("/api/projects", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    p = Project(name=payload.name.strip(), source_code=payload.source_code, test_code=payload.test_code)
    if not p.name:
        raise HTTPException(422, "Project name cannot be empty")
    db.add(p); db.commit(); db.refresh(p)
    return p

@app.get("/api/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    p = db.get(Project, project_id)
    if not p: raise HTTPException(404, "Project not found")
    return p

@app.put("/api/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)):
    p = db.get(Project, project_id)
    if not p: raise HTTPException(404, "Project not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None: setattr(p, key, value)
    db.commit(); db.refresh(p)
    return p

@app.post("/api/projects/{project_id}/analyze")
def analyze_project(project_id: int, db: Session = Depends(get_db)):
    p = db.get(Project, project_id)
    if not p: raise HTTPException(404, "Project not found")
    return analyze_source(p.source_code)

@app.post("/api/projects/{project_id}/generate")
def generate_project_tests(project_id: int, db: Session = Depends(get_db)):
    p = db.get(Project, project_id)
    if not p: raise HTTPException(404, "Project not found")
    result = generate_tests(p.source_code)
    p.test_code = result["code"]
    db.commit()
    return result

@app.post("/api/projects/{project_id}/validate")
def validate_project(project_id: int, payload: ValidateRequest, db: Session = Depends(get_db)):
    p = db.get(Project, project_id)
    if not p: raise HTTPException(404, "Project not found")
    source_error = syntax_check(payload.source_code)
    test_error = syntax_check(payload.test_code)
    return {"source_valid": source_error is None, "source_error": source_error,
            "tests_valid": test_error is None, "tests_error": test_error}

def syntax_check(code):
    import ast
    try: ast.parse(code or "")
    except SyntaxError as exc: return f"Line {exc.lineno}: {exc.msg}"
    return None

@app.post("/api/projects/{project_id}/runs")
def run_project_tests(project_id: int, db: Session = Depends(get_db)):
    p = db.get(Project, project_id)
    if not p: raise HTTPException(404, "Project not found")
    if os.getenv("RUNNER_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "Test execution is disabled. Configure and review the isolated Docker runner, then set RUNNER_ENABLED=true.")
    image = os.getenv("RUNNER_IMAGE", "testpilot-runner:local")
    timeout = int(os.getenv("RUN_TIMEOUT_SECONDS", "8"))
    with tempfile.TemporaryDirectory(prefix="testpilot-") as td:
        work = Path(td)
        (work / "source_module.py").write_text(p.source_code, encoding="utf-8")
        (work / "test_generated.py").write_text(p.test_code, encoding="utf-8")
        cmd = ["docker", "run", "--rm", "--network", "none", "--read-only",
               "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
               "--memory", "256m", "--cpus", "0.5", "--pids-limit", "64",
               "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m", "-v", f"{work}:/work:ro",
               "-w", "/work", image, "pytest", "-q", "--disable-warnings", "--maxfail=10",
               "--cov=source_module", "--cov-report=json:/tmp/coverage.json", "/work/test_generated.py"]
        started = time.monotonic()
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            output = (proc.stdout + "\n" + proc.stderr)[-12000:]
            status = "passed" if proc.returncode == 0 else "failed"
        except subprocess.TimeoutExpired as exc:
            output = "Execution timed out. " + str(exc)[:1000]; status = "timeout"
        except OSError as exc:
            output = f"Runner infrastructure error: {exc}"; status = "infrastructure_error"
        duration = time.monotonic() - started
    import re
    match = re.search(r"(\d+) passed", output); passed = int(match.group(1)) if match else 0
    match = re.search(r"(\d+) failed", output); failed = int(match.group(1)) if match else 0
    match = re.search(r"(\d+) skipped", output); skipped = int(match.group(1)) if match else 0
    run = TestRun(project_id=p.id, status=status, passed=passed, failed=failed, skipped=skipped,
                  duration_seconds=duration, output=output)
    db.add(run); db.commit(); db.refresh(run)
    return run_to_dict(run)

def run_to_dict(r):
    return {"id": r.id, "project_id": r.project_id, "status": r.status, "passed": r.passed,
            "failed": r.failed, "skipped": r.skipped, "duration_seconds": r.duration_seconds,
            "output": r.output, "created_at": r.created_at.isoformat() if r.created_at else None}

@app.get("/api/projects/{project_id}/runs")
def project_runs(project_id: int, db: Session = Depends(get_db)):
    if not db.get(Project, project_id): raise HTTPException(404, "Project not found")
    return [run_to_dict(r) for r in db.query(TestRun).filter_by(project_id=project_id).order_by(TestRun.id.desc()).all()]

@app.get("/api/runs/{run_id}/report")
def export_report(run_id: int, format: str = "markdown", db: Session = Depends(get_db)):
    r = db.get(TestRun, run_id)
    if not r: raise HTTPException(404, "Run not found")
    data = run_to_dict(r)
    if format == "json":
        return Response(json.dumps(data, indent=2), media_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="testpilot-run-{run_id}.json"'})
    if format != "markdown": raise HTTPException(422, "format must be markdown or json")
    md = f"# TestPilot AI Run #{r.id}\n\n- Status: {r.status}\n- Passed: {r.passed}\n- Failed: {r.failed}\n- Skipped: {r.skipped}\n- Duration: {r.duration_seconds:.2f}s\n\n## Output\n\n```text\n{r.output}\n```\n"
    return Response(md, media_type="text/markdown",
                    headers={"Content-Disposition": f'attachment; filename="testpilot-run-{run_id}.md"'})
