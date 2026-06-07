from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import uuid
import json
import psutil
import os
import time
import requests
from datetime import datetime

try:
    from app.parser import extract_text
    from app.detector import detect_ai_content, detect_ai_content_advanced, smart_split_sentences, recompute_overall_stats
    from app.rewriter import rewrite_text, rewrite_text_with_context, rewrite_text_stream, rewrite_text_with_context_stream, analyze_terminology_protection
    from app.structure_analyzer import analyze_and_score_sections, rewrite_section_content, adjust_section_indices
    from app.pdf_report import generate_pdf_report
    from app.database import (
        save_record,
        get_records,
        get_daily_usage,
        get_rewrite_level_distribution,
        get_ai_score_trend,
        list_terminology,
        get_terminology,
        create_terminology,
        update_terminology,
        delete_terminology,
        bulk_import_terminology,
        get_all_terminology_terms,
        TERMINOLOGY_CATEGORIES,
    )
except ImportError:
    try:
        from .parser import extract_text
        from .detector import detect_ai_content, detect_ai_content_advanced, smart_split_sentences, recompute_overall_stats
        from .rewriter import rewrite_text, rewrite_text_with_context, rewrite_text_stream, rewrite_text_with_context_stream, analyze_terminology_protection
        from .structure_analyzer import analyze_and_score_sections, rewrite_section_content, adjust_section_indices
        from .pdf_report import generate_pdf_report
        from .database import (
            save_record,
            get_records,
            get_daily_usage,
            get_rewrite_level_distribution,
            get_ai_score_trend,
            list_terminology,
            get_terminology,
            create_terminology,
            update_terminology,
            delete_terminology,
            bulk_import_terminology,
            get_all_terminology_terms,
            TERMINOLOGY_CATEGORIES,
        )
    except ImportError:
        from parser import extract_text
        from detector import detect_ai_content, detect_ai_content_advanced, smart_split_sentences, recompute_overall_stats
        from rewriter import rewrite_text, rewrite_text_with_context, rewrite_text_stream, rewrite_text_with_context_stream, analyze_terminology_protection
        from structure_analyzer import analyze_and_score_sections, rewrite_section_content, adjust_section_indices
        from pdf_report import generate_pdf_report
        from database import (
            save_record,
            get_records,
            get_daily_usage,
            get_rewrite_level_distribution,
            get_ai_score_trend,
            list_terminology,
            get_terminology,
            create_terminology,
            update_terminology,
            delete_terminology,
            bulk_import_terminology,
            get_all_terminology_terms,
            TERMINOLOGY_CATEGORIES,
        )

app = FastAPI(title="Academic AIGC Helper API")

# 全局的流式请求状态管理：stream_id -> {"aborted": bool, "original_text": str}
_stream_registry = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TextPayload(BaseModel):
    text: str

class AdvancedDetectPayload(BaseModel):
    text: str
    bootstrap_samples: int = Field(default=5, ge=1, le=50, description="Bootstrap 采样次数：快速模式3次，精确模式10次")

class RewritePayload(BaseModel):
    text: str
    level: str = "medium"

class TerminologyCreate(BaseModel):
    term: str
    category: str = "专有名词"
    description: Optional[str] = None

class TerminologyUpdate(BaseModel):
    term: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None

class TerminologyBulkImport(BaseModel):
    items: List[Dict[str, Any]]

class SelectiveParagraph(BaseModel):
    id: int
    text: str
    should_rewrite: bool = True
    locked: bool = False

class SelectiveRewritePayload(BaseModel):
    paragraphs: List[SelectiveParagraph]
    level: str = "medium"

class SectionInfo(BaseModel):
    id: str
    title: str
    level: int
    start_index: int
    end_index: int
    content: str
    ai_score: Optional[float] = None
    degraded: bool = False
    standard_type: Optional[str] = None

class AnalyzeStructurePayload(BaseModel):
    text: str

class RewriteChapterPayload(BaseModel):
    full_text: str
    section: dict
    level: str = "medium"


class RecomputeStatsPayload(BaseModel):
    details: List[Dict[str, Any]]


class PDFReportPayload(BaseModel):
    project_name: str = "学术论文检测"
    detection_time: Optional[str] = None
    overall_ai_score: float = 0.0
    details: List[Dict[str, Any]] = []
    original_text: str = ""
    rewritten_text: str = ""
    detection_model: str = "distilbert-base-uncased"
    rewrite_model: str = "llama-3.3-70b-versatile"
    rewrite_level: str = "medium"
    iterations: int = 1
    bootstrap_samples: int = 5
    degraded: bool = False


def smart_split_paragraphs(text: str) -> List[str]:
    """
    Smart paragraph splitting: merges consecutive short lines to avoid
    treating each line as a separate paragraph.
    """
    if not text:
        return []
    
    raw_lines = text.split('\n')
    SHORT_LINE_THRESHOLD = 40
    
    paragraphs = []
    current_buffer = []
    
    for line in raw_lines:
        stripped = line.strip()
        
        if not stripped:
            if current_buffer:
                paragraphs.append('\n'.join(current_buffer).strip())
                current_buffer = []
            continue
        
        is_short = len(stripped) < SHORT_LINE_THRESHOLD
        
        if not current_buffer:
            current_buffer.append(stripped)
        else:
            last_in_buffer = current_buffer[-1]
            last_is_short = len(last_in_buffer) < SHORT_LINE_THRESHOLD
            
            if is_short or last_is_short:
                current_buffer.append(stripped)
            else:
                paragraphs.append('\n'.join(current_buffer).strip())
                current_buffer = [stripped]
    
    if current_buffer:
        paragraphs.append('\n'.join(current_buffer).strip())
    
    result = []
    for p in paragraphs:
        if p and p.strip():
            result.append(p.strip())
    return result


@app.post("/api/split-paragraphs")
async def split_paragraphs(payload: TextPayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    paragraphs = smart_split_paragraphs(payload.text)
    return {
        "paragraphs": [
            {"id": idx, "text": p}
            for idx, p in enumerate(paragraphs)
        ]
    }


@app.post("/api/rewrite-selective")
async def rewrite_selective(payload: SelectiveRewritePayload):
    if not payload.paragraphs:
        raise HTTPException(status_code=400, detail="No paragraphs provided")
    
    sorted_paras = sorted(payload.paragraphs, key=lambda p: p.id)
    all_texts = [p.text for p in sorted_paras]
    results = []

    try:
        protected_terms = get_all_terminology_terms()
    except Exception:
        protected_terms = []
    
    for idx, para in enumerate(sorted_paras):
        original_text = para.text
        
        if para.locked or not para.should_rewrite:
            results.append({
                "id": para.id,
                "original_text": original_text,
                "rewritten_text": original_text,
                "rewritten": False,
                "locked": para.locked
            })
            continue
        
        prev_ctx = all_texts[idx - 1] if idx > 0 else ""
        next_ctx = all_texts[idx + 1] if idx < len(all_texts) - 1 else ""
        
        rewritten = rewrite_text_with_context(
            text=original_text,
            prev_context=prev_ctx,
            next_context=next_ctx,
            level=payload.level,
            protected_terms=protected_terms
        )
        
        results.append({
            "id": para.id,
            "original_text": original_text,
            "rewritten_text": rewritten,
            "rewritten": True,
            "locked": False
        })
    
    rewritten_para_texts = [r["rewritten_text"] for r in sorted(results, key=lambda x: x["id"])]
    combined_text = "\n\n".join(rewritten_para_texts)
    original_combined = "\n\n".join(all_texts)
    
    try:
        detection_before = detect_ai_content(original_combined)
    except Exception:
        detection_before = None
    
    try:
        detection_after = detect_ai_content(combined_text)
    except Exception:
        detection_after = None

    try:
        terminology_analysis = analyze_terminology_protection(original_combined, combined_text, protected_terms)
    except Exception:
        terminology_analysis = {"protected_terms": [], "preserved": [], "modified": [], "has_modified_terms": False}
    
    try:
        save_record(
            operation_type="rewrite",
            original_ai_score=detection_before.get("overall_ai_score") if detection_before else None,
            rewritten_ai_score=detection_after.get("overall_ai_score") if detection_after else None,
            rewrite_level=payload.level,
        )
    except Exception:
        pass
    
    return {
        "paragraphs": results,
        "combined_text": combined_text,
        "detection_after": detection_after,
        "detection_before": detection_before,
        "terminology_analysis": terminology_analysis
    }

@app.post("/api/rewrite")
async def rewrite(payload: RewritePayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    
    current_text = payload.text
    max_retries = 3
    detection_after = None
    detection_before = None

    try:
        protected_terms = get_all_terminology_terms()
    except Exception:
        protected_terms = []
    
    try:
        detection_before = detect_ai_content(payload.text, iteration_hint=0)
    except Exception:
        detection_before = None
    
    history = []
    history.append({
        "version": 0,
        "label": "原文",
        "text": payload.text,
        "detection": detection_before
    })
    
    for i in range(max_retries):
        current_text = rewrite_text(current_text, payload.level, protected_terms=protected_terms, iteration=i)
        detection_after = detect_ai_content(current_text, iteration_hint=i + 1)
        
        history.append({
            "version": i + 1,
            "label": f"第{i + 1}轮改写",
            "text": current_text,
            "detection": detection_after
        })
        # 注：始终执行完整 3 轮迭代，确保前端时间轴展示完整历史
        # if detection_after["overall_ai_score"] < 10:
        #     break

    try:
        terminology_analysis = analyze_terminology_protection(payload.text, current_text, protected_terms)
    except Exception:
        terminology_analysis = {"protected_terms": [], "preserved": [], "modified": [], "has_modified_terms": False}
    
    try:
        save_record(
            operation_type="rewrite",
            original_ai_score=detection_before.get("overall_ai_score") if detection_before else None,
            rewritten_ai_score=detection_after.get("overall_ai_score") if detection_after else None,
            rewrite_level=payload.level,
        )
    except Exception:
        pass
    
    return {
        "original_text": payload.text,
        "rewritten_text": current_text,
        "detection_after": detection_after,
        "detection_before": detection_before,
        "iterations": i + 1,
        "history": history,
        "terminology_analysis": terminology_analysis
    }

@app.get("/")
async def root():
    return {"message": "Welcome to the Academic AIGC Helper API"}


def _classify_status(healthy: bool, degraded_condition: bool = False) -> str:
    if not healthy:
        return "down"
    if degraded_condition:
        return "degraded"
    return "healthy"


def _check_disk_space() -> Dict[str, Any]:
    try:
        usage = psutil.disk_usage(os.getcwd())
        free_pct = 100 - usage.percent
        if free_pct < 5:
            status = "down"
        elif free_pct < 15:
            status = "degraded"
        else:
            status = "healthy"
        return {
            "status": status,
            "details": {
                "total_gb": round(usage.total / (1024 ** 3), 2),
                "used_gb": round(usage.used / (1024 ** 3), 2),
                "free_gb": round(usage.free / (1024 ** 3), 2),
                "used_percent": usage.percent,
                "free_percent": round(free_pct, 2)
            }
        }
    except Exception as e:
        return {"status": "down", "details": {"error": str(e)}}


def _check_memory() -> Dict[str, Any]:
    try:
        mem = psutil.virtual_memory()
        used_pct = mem.percent
        if used_pct > 95:
            status = "down"
        elif used_pct > 85:
            status = "degraded"
        else:
            status = "healthy"
        return {
            "status": status,
            "details": {
                "total_gb": round(mem.total / (1024 ** 3), 2),
                "available_gb": round(mem.available / (1024 ** 3), 2),
                "used_gb": round(mem.used / (1024 ** 3), 2),
                "used_percent": used_pct
            }
        }
    except Exception as e:
        return {"status": "down", "details": {"error": str(e)}}


def _check_ai_model() -> Dict[str, Any]:
    try:
        from app.detector import get_detector, is_model_degraded
    except ImportError:
        try:
            from detector import get_detector, is_model_degraded
        except ImportError:
            return {"status": "down", "details": {"error": "无法加载 detector 模块"}}

    try:
        detector = get_detector()
        if detector is None:
            return {
                "status": "degraded",
                "details": {
                    "loaded": False,
                    "note": "模型未加载或加载失败，当前使用降级模拟模式"
                }
            }
        degraded = is_model_degraded(detector)
        if degraded:
            return {
                "status": "degraded",
                "details": {
                    "loaded": True,
                    "degraded": True,
                    "note": "模型已加载但处于降级状态"
                }
            }
        try:
            test_result = detector("test")
            if test_result and len(test_result) > 0:
                return {
                    "status": "healthy",
                    "details": {
                        "loaded": True,
                        "degraded": False,
                        "model_type": type(detector).__name__,
                        "inference_ok": True
                    }
                }
        except Exception as infer_err:
            return {
                "status": "degraded",
                "details": {
                    "loaded": True,
                    "inference_ok": False,
                    "error": str(infer_err)
                }
            }
        return {
            "status": "healthy",
            "details": {
                "loaded": True,
                "degraded": False
            }
        }
    except Exception as e:
        return {"status": "down", "details": {"error": str(e)}}


def _check_groq_api() -> Dict[str, Any]:
    try:
        from app.rewriter import GROQ_API_KEY, MODEL_NAME
    except ImportError:
        try:
            from rewriter import GROQ_API_KEY, MODEL_NAME
        except ImportError:
            return {"status": "down", "details": {"error": "无法加载 rewriter 模块"}}

    if not GROQ_API_KEY:
        return {
            "status": "degraded",
            "details": {
                "configured": False,
                "note": "未配置 GROQ_API_KEY，当前使用降级模拟改写"
            }
        }

    try:
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        start = time.time()
        response = requests.get(
            "https://api.groq.com/openai/v1/models",
            headers=headers,
            timeout=8
        )
        elapsed_ms = round((time.time() - start) * 1000, 1)

        if response.status_code == 200:
            data = response.json()
            model_available = any(
                m.get("id") == MODEL_NAME for m in data.get("data", [])
            ) if isinstance(data, dict) else False
            if model_available:
                return {
                    "status": "healthy",
                    "details": {
                        "configured": True,
                        "model": MODEL_NAME,
                        "latency_ms": elapsed_ms,
                        "reachable": True
                    }
                }
            else:
                return {
                    "status": "degraded",
                    "details": {
                        "configured": True,
                        "model": MODEL_NAME,
                        "latency_ms": elapsed_ms,
                        "reachable": True,
                        "note": f"模型 {MODEL_NAME} 未在可用模型列表中"
                    }
                }
        elif response.status_code == 401:
            return {
                "status": "down",
                "details": {
                    "configured": True,
                    "reachable": True,
                    "error": "API Key 无效 (401 Unauthorized)"
                }
            }
        elif response.status_code == 429:
            return {
                "status": "degraded",
                "details": {
                    "configured": True,
                    "reachable": True,
                    "error": "请求频率超限 (429 Too Many Requests)"
                }
            }
        else:
            return {
                "status": "degraded",
                "details": {
                    "configured": True,
                    "reachable": True,
                    "status_code": response.status_code,
                    "error": f"HTTP {response.status_code}"
                }
            }
    except requests.exceptions.Timeout:
        return {
            "status": "degraded",
            "details": {
                "configured": True,
                "reachable": False,
                "error": "请求超时"
            }
        }
    except requests.exceptions.ConnectionError:
        return {
            "status": "down",
            "details": {
                "configured": True,
                "reachable": False,
                "error": "无法连接到 Groq API"
            }
        }
    except Exception as e:
        return {
            "status": "down",
            "details": {
                "configured": True,
                "error": str(e)
            }
        }


def _check_api_connectivity() -> Dict[str, Any]:
    return {
        "status": "healthy",
        "details": {
            "uptime_seconds": round(time.time() - _start_time, 1),
            "version": "1.0.0"
        }
    }


_start_time = time.time()


@app.get("/api/health")
async def health_check():
    api_status = _check_api_connectivity()
    ai_model_status = _check_ai_model()
    groq_status = _check_groq_api()
    disk_status = _check_disk_space()
    memory_status = _check_memory()

    all_statuses = [
        api_status["status"],
        ai_model_status["status"],
        groq_status["status"],
        disk_status["status"],
        memory_status["status"]
    ]

    if "down" in all_statuses:
        overall = "down"
    elif "degraded" in all_statuses:
        overall = "degraded"
    else:
        overall = "healthy"

    return {
        "overall_status": overall,
        "timestamp": time.time(),
        "services": {
            "api_connectivity": api_status,
            "ai_model": ai_model_status,
            "groq_api": groq_status,
            "disk_space": disk_status,
            "memory": memory_status
        }
    }


@app.post("/api/detect-text")
async def detect_text(payload: TextPayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    result = detect_ai_content(payload.text)
    try:
        save_record(
            operation_type="detect",
            original_ai_score=result.get("overall_ai_score"),
        )
    except Exception:
        pass
    return result

@app.post("/api/detect-text-advanced")
async def detect_text_advanced(payload: AdvancedDetectPayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    result = detect_ai_content_advanced(payload.text, bootstrap_samples=payload.bootstrap_samples)
    try:
        save_record(
            operation_type="detect",
            original_ai_score=result.get("overall_ai_score"),
        )
    except Exception:
        pass
    return result


@app.post("/api/split-sentences")
async def split_sentences(payload: TextPayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    sentences = smart_split_sentences(payload.text)
    return {
        "sentences": sentences,
        "count": len(sentences),
        "can_split": len(sentences) >= 2
    }


@app.post("/api/recompute-stats")
async def recompute_stats(payload: RecomputeStatsPayload):
    if not payload.details:
        raise HTTPException(status_code=400, detail="No details provided")
    stats = recompute_overall_stats(payload.details)
    return stats


@app.post("/api/detect-file")
async def detect_file(file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = extract_text(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    result = detect_ai_content(text)
    try:
        save_record(
            operation_type="detect",
            original_ai_score=result.get("overall_ai_score"),
        )
    except Exception:
        pass
    return {
        "filename": file.filename,
        "text": text,
        **result
    }

@app.post("/api/analyze-structure")
async def analyze_structure(payload: AnalyzeStructurePayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    result = analyze_and_score_sections(payload.text, detect_ai_content)
    return result

@app.post("/api/analyze-file-structure")
async def analyze_file_structure(file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = extract_text(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    structure_result = analyze_and_score_sections(text, detect_ai_content)
    try:
        overall_result = detect_ai_content(text)
    except Exception:
        overall_result = None
    
    return {
        "filename": file.filename,
        "text": text,
        "structure": structure_result,
        "overall_detection": overall_result
    }

@app.post("/api/rewrite-chapter")
async def rewrite_chapter(payload: RewriteChapterPayload):
    if not payload.full_text or not payload.section:
        raise HTTPException(status_code=400, detail="Full text and section are required")
    
    new_full_text, updated_section, offset = rewrite_section_content(
        payload.full_text,
        payload.section,
        rewrite_text,
        payload.level
    )
    
    try:
        detection_after = detect_ai_content(updated_section["content"])
    except Exception:
        detection_after = None
    
    return {
        "new_full_text": new_full_text,
        "updated_section": updated_section,
        "index_offset": offset,
        "section_detection_after": detection_after
    }


# ============== 流式改写相关接口 ==============

class StreamRewritePayload(BaseModel):
    text: str
    level: str = "medium"
    stream_id: Optional[str] = None

class StreamAbortPayload(BaseModel):
    stream_id: str


def _sse_event(event: str, data: dict) -> str:
    """格式化 SSE 事件"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _estimate_total_chars(original_text: str) -> int:
    """
    根据原文长度预估改写后的总字数
    改写后通常与原文长度接近，略微浮动 ±20%
    """
    base = len(original_text)
    return max(int(base * 1.05), 1)


@app.post("/api/rewrite-stream")
async def rewrite_stream(payload: StreamRewritePayload, request: Request):
    """
    SSE 流式改写接口：逐 token 推送改写结果，支持最多 3 轮迭代
    SSE 事件：
      - start: 开始，返回 stream_id、预估字数、总轮数
      - round_start: 某一轮迭代开始
      - token: 某一轮的增量 token
      - round_done: 某一轮迭代完成，带回该轮文本和检测结果
      - done: 全部轮次完成，带回完整 history
      - error: 错误
      - aborted: 已中止
    """
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")

    stream_id = payload.stream_id or str(uuid.uuid4())
    original_text = payload.text
    max_rounds = 3

    try:
        protected_terms = get_all_terminology_terms()
    except Exception:
        protected_terms = []

    _stream_registry[stream_id] = {
        "aborted": False,
        "original_text": original_text,
    }

    async def event_generator():
        try:
            is_aborted = lambda: _stream_registry.get(stream_id, {}).get("aborted", False)

            detection_before = None
            try:
                detection_before = detect_ai_content(original_text, iteration_hint=0)
            except Exception:
                detection_before = None

            history = [{
                "version": 0,
                "label": "原文",
                "text": original_text,
                "detection": detection_before
            }]

            yield _sse_event("start", {
                "stream_id": stream_id,
                "estimated_total_chars": _estimate_total_chars(original_text) * max_rounds,
                "original_length": len(original_text),
                "total_rounds": max_rounds,
                "history": history,
            })

            current_text = original_text
            detection_after = None

            for round_idx in range(max_rounds):
                if await request.is_disconnected():
                    print(f"[SSE] 客户端已断开: {stream_id}")
                    break
                if is_aborted():
                    yield _sse_event("aborted", {
                        "stream_id": stream_id,
                        "history": history,
                        "partial_text": current_text,
                    })
                    return

                round_num = round_idx + 1
                round_estimated = _estimate_total_chars(current_text)
                yield _sse_event("round_start", {
                    "stream_id": stream_id,
                    "round": round_num,
                    "total_rounds": max_rounds,
                    "label": f"第{round_num}轮改写",
                    "estimated_chars": round_estimated,
                })

                round_accumulated = ""
                async for chunk in rewrite_text_stream(
                    text=current_text,
                    level=payload.level,
                    is_aborted=is_aborted,
                    protected_terms=protected_terms,
                    iteration=round_idx,
                ):
                    if await request.is_disconnected():
                        print(f"[SSE] 客户端已断开: {stream_id}")
                        break
                    if is_aborted():
                        yield _sse_event("aborted", {
                            "stream_id": stream_id,
                            "history": history,
                            "partial_text": round_accumulated,
                        })
                        return
                    round_accumulated += chunk
                    yield _sse_event("token", {
                        "stream_id": stream_id,
                        "round": round_num,
                        "total_rounds": max_rounds,
                        "delta": chunk,
                        "text": round_accumulated,
                        "generated_chars": len(round_accumulated),
                        "estimated_chars": round_estimated,
                    })

                if is_aborted():
                    return

                current_text = round_accumulated
                detection_after = None
                try:
                    detection_after = detect_ai_content(current_text, iteration_hint=round_num)
                except Exception:
                    detection_after = None

                history.append({
                    "version": round_num,
                    "label": f"第{round_num}轮改写",
                    "text": current_text,
                    "detection": detection_after,
                })

                yield _sse_event("round_done", {
                    "stream_id": stream_id,
                    "round": round_num,
                    "total_rounds": max_rounds,
                    "label": f"第{round_num}轮改写",
                    "rewritten_text": current_text,
                    "generated_chars": len(current_text),
                    "detection": detection_after,
                    "history": history,
                })

            if is_aborted():
                return

            try:
                terminology_analysis = analyze_terminology_protection(original_text, current_text, protected_terms)
            except Exception:
                terminology_analysis = {"protected_terms": [], "preserved": [], "modified": [], "has_modified_terms": False}

            try:
                save_record(
                    operation_type="rewrite",
                    original_ai_score=detection_before.get("overall_ai_score") if detection_before else None,
                    rewritten_ai_score=detection_after.get("overall_ai_score") if detection_after else None,
                    rewrite_level=payload.level,
                )
            except Exception:
                pass

            yield _sse_event("done", {
                "stream_id": stream_id,
                "final_text": current_text,
                "original_text": original_text,
                "generated_chars": len(current_text),
                "total_rounds": max_rounds,
                "iterations": max_rounds,
                "detection_after": detection_after,
                "detection_before": detection_before,
                "terminology_analysis": terminology_analysis,
                "history": history,
            })

        except Exception as e:
            print(f"[SSE] 流式改写异常: {e}")
            import traceback
            traceback.print_exc()
            yield _sse_event("error", {
                "stream_id": stream_id,
                "message": str(e),
            })
        finally:
            _stream_registry.pop(stream_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/rewrite-abort")
async def rewrite_abort(payload: StreamAbortPayload):
    """
    中止指定 stream_id 的流式改写
    """
    if not payload.stream_id:
        raise HTTPException(status_code=400, detail="stream_id is required")
    if payload.stream_id in _stream_registry:
        _stream_registry[payload.stream_id]["aborted"] = True
        return {"success": True, "stream_id": payload.stream_id, "message": "已标记中止"}
    return {"success": False, "stream_id": payload.stream_id, "message": "stream_id 不存在或已完成"}


@app.post("/api/rewrite-selective-stream")
async def rewrite_selective_stream(payload: SelectiveRewritePayload, request: Request):
    """
    逐段选择性流式改写接口
    SSE 事件：
      - start: 开始，返回段落总数
      - paragraph_start: 开始处理某段
      - token: 某段的增量 token
      - paragraph_done: 某段处理完成
      - done: 全部完成
      - error: 错误
      - aborted: 已中止
    """
    if not payload.paragraphs:
        raise HTTPException(status_code=400, detail="No paragraphs provided")

    stream_id = str(uuid.uuid4())
    sorted_paras = sorted(payload.paragraphs, key=lambda p: p.id)
    all_texts = [p.text for p in sorted_paras]
    total_paragraphs = len(sorted_paras)

    try:
        protected_terms = get_all_terminology_terms()
    except Exception:
        protected_terms = []

    _stream_registry[stream_id] = {
        "aborted": False,
        "original_text": "\n\n".join(all_texts),
    }

    async def event_generator():
        results = []
        accumulated_full = ""

        def is_aborted():
            return _stream_registry.get(stream_id, {}).get("aborted", False)

        try:
            yield _sse_event("start", {
                "stream_id": stream_id,
                "total_paragraphs": total_paragraphs,
                "estimated_total_chars": _estimate_total_chars("\n\n".join(all_texts)),
            })

            for idx, para in enumerate(sorted_paras):
                if await request.is_disconnected() or is_aborted():
                    break

                original_text = para.text

                if para.locked or not para.should_rewrite:
                    results.append({
                        "id": para.id,
                        "original_text": original_text,
                        "rewritten_text": original_text,
                        "rewritten": False,
                        "locked": para.locked,
                    })
                    accumulated_full = (accumulated_full + "\n\n" + original_text).strip()
                    yield _sse_event("paragraph_done", {
                        "stream_id": stream_id,
                        "paragraph_index": idx,
                        "paragraph_id": para.id,
                        "rewritten": False,
                        "locked": para.locked,
                        "rewritten_text": original_text,
                        "generated_chars_total": len(accumulated_full),
                    })
                    continue

                yield _sse_event("paragraph_start", {
                    "stream_id": stream_id,
                    "paragraph_index": idx,
                    "paragraph_id": para.id,
                    "total_paragraphs": total_paragraphs,
                })

                prev_ctx = all_texts[idx - 1] if idx > 0 else ""
                next_ctx = all_texts[idx + 1] if idx < len(all_texts) - 1 else ""

                para_accumulated = ""
                async for chunk in rewrite_text_with_context_stream(
                    text=original_text,
                    prev_context=prev_ctx,
                    next_context=next_ctx,
                    level=payload.level,
                    is_aborted=is_aborted,
                    protected_terms=protected_terms,
                ):
                    if await request.is_disconnected() or is_aborted():
                        break
                    para_accumulated += chunk
                    accumulated_full = (accumulated_full + ("\n\n" if idx > 0 or accumulated_full else "") + chunk) if not para_accumulated or len(para_accumulated) == len(chunk) else accumulated_full
                    yield _sse_event("token", {
                        "stream_id": stream_id,
                        "paragraph_index": idx,
                        "paragraph_id": para.id,
                        "delta": chunk,
                        "paragraph_text": para_accumulated,
                        "generated_chars": len(para_accumulated),
                        "estimated_paragraph_chars": _estimate_total_chars(original_text),
                    })

                if await request.is_disconnected() or is_aborted():
                    break

                results.append({
                    "id": para.id,
                    "original_text": original_text,
                    "rewritten_text": para_accumulated,
                    "rewritten": True,
                    "locked": False,
                })
                yield _sse_event("paragraph_done", {
                    "stream_id": stream_id,
                    "paragraph_index": idx,
                    "paragraph_id": para.id,
                    "rewritten": True,
                    "locked": False,
                    "rewritten_text": para_accumulated,
                    "generated_chars": len(para_accumulated),
                })

            if is_aborted():
                rewritten_para_texts = []
                for r in sorted(results, key=lambda x: x["id"]):
                    rewritten_para_texts.append(r["rewritten_text"])
                # 补充未处理的段落用原文
                handled_ids = {r["id"] for r in results}
                for p in sorted_paras:
                    if p.id not in handled_ids:
                        rewritten_para_texts.insert(p.id, p.text)
                combined_text = "\n\n".join([t for t in rewritten_para_texts if t])
                yield _sse_event("aborted", {
                    "stream_id": stream_id,
                    "partial_results": results,
                    "combined_text": combined_text,
                })
                return

            rewritten_para_texts = [r["rewritten_text"] for r in sorted(results, key=lambda x: x["id"])]
            combined_text = "\n\n".join(rewritten_para_texts)
            original_combined = "\n\n".join(all_texts)

            detection_after = None
            detection_before = None
            try:
                detection_before = detect_ai_content(original_combined)
            except Exception:
                detection_before = None
            try:
                detection_after = detect_ai_content(combined_text)
            except Exception:
                detection_after = None

            try:
                terminology_analysis = analyze_terminology_protection(original_combined, combined_text, protected_terms)
            except Exception:
                terminology_analysis = {"protected_terms": [], "preserved": [], "modified": [], "has_modified_terms": False}

            try:
                save_record(
                    operation_type="rewrite",
                    original_ai_score=detection_before.get("overall_ai_score") if detection_before else None,
                    rewritten_ai_score=detection_after.get("overall_ai_score") if detection_after else None,
                    rewrite_level=payload.level,
                )
            except Exception:
                pass

            yield _sse_event("done", {
                "stream_id": stream_id,
                "paragraphs": results,
                "combined_text": combined_text,
                "detection_after": detection_after,
                "detection_before": detection_before,
                "terminology_analysis": terminology_analysis,
            })

        except Exception as e:
            print(f"[SSE] 选择性流式改写异常: {e}")
            yield _sse_event("error", {
                "stream_id": stream_id,
                "message": str(e),
                "partial_results": results,
            })
        finally:
            _stream_registry.pop(stream_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/generate-report")
async def generate_report(payload: PDFReportPayload):
    try:
        report_data = payload.dict()

        if not report_data.get("detection_time"):
            report_data["detection_time"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        details = report_data.get("details", [])
        for d in details:
            ai_score = d.get("ai_score", 0)
            if isinstance(ai_score, float) and ai_score <= 1:
                d["ai_score"] = ai_score * 100

        if not report_data.get("overall_ai_score") and details:
            total_weight = 0
            weighted_sum = 0.0
            for d in details:
                w = max(1, len(d.get("text", "")))
                total_weight += w
                weighted_sum += d.get("ai_score", 0) * w
            report_data["overall_ai_score"] = weighted_sum / total_weight if total_weight > 0 else 0

        pdf_bytes = generate_pdf_report(report_data)

        filename = f"PaperWise_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
                "X-Suggested-Filename": filename,
            },
        )
    except Exception as e:
        import traceback
        print(f"[PDF] 生成报告异常: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PDF 生成失败: {str(e)}")


class SaveHistoryPayload(BaseModel):
    operation_type: str
    original_ai_score: Optional[float] = None
    rewritten_ai_score: Optional[float] = None
    rewrite_level: Optional[str] = None


@app.post("/api/history")
async def save_history_record(payload: SaveHistoryPayload):
    try:
        record_id = save_record(
            operation_type=payload.operation_type,
            original_ai_score=payload.original_ai_score,
            rewritten_ai_score=payload.rewritten_ai_score,
            rewrite_level=payload.rewrite_level,
        )
        return {"success": True, "id": record_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history")
async def get_history(days: Optional[int] = None):
    try:
        records = get_records(days=days)
        return {"records": records, "count": len(records)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history/stats")
async def get_history_stats(days: Optional[int] = None):
    try:
        trend = get_ai_score_trend(days=days)
        distribution = get_rewrite_level_distribution(days=days)
        daily = get_daily_usage(days=days)
        return {
            "trend": trend,
            "distribution": distribution,
            "daily_usage": daily,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/terminology/categories")
async def get_terminology_categories():
    return {"categories": TERMINOLOGY_CATEGORIES}


@app.get("/api/terminology")
async def api_list_terminology(category: Optional[str] = None, search: Optional[str] = None):
    try:
        items = list_terminology(category=category, search=search)
        return {"items": items, "count": len(items)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/terminology/{term_id}")
async def api_get_terminology(term_id: int):
    try:
        item = get_terminology(term_id)
        if not item:
            raise HTTPException(status_code=404, detail="术语不存在")
        return item
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/terminology")
async def api_create_terminology(payload: TerminologyCreate):
    if not payload.term or not payload.term.strip():
        raise HTTPException(status_code=400, detail="术语内容不能为空")
    try:
        term_id = create_terminology(
            term=payload.term.strip(),
            category=payload.category or "专有名词",
            description=payload.description
        )
        return {"success": True, "id": term_id}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/terminology/{term_id}")
async def api_update_terminology(term_id: int, payload: TerminologyUpdate):
    try:
        term = payload.term.strip() if payload.term else None
        if term == "":
            raise HTTPException(status_code=400, detail="术语内容不能为空")
        success = update_terminology(
            term_id=term_id,
            term=term,
            category=payload.category,
            description=payload.description
        )
        if not success:
            raise HTTPException(status_code=404, detail="术语不存在")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/terminology/{term_id}")
async def api_delete_terminology(term_id: int):
    try:
        success = delete_terminology(term_id)
        if not success:
            raise HTTPException(status_code=404, detail="术语不存在")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/terminology/bulk-import")
async def api_bulk_import_terminology(payload: TerminologyBulkImport):
    try:
        result = bulk_import_terminology(payload.items)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/terminology/analyze")
async def api_analyze_terminology(original_text: str, rewritten_text: str):
    try:
        terms = get_all_terminology_terms()
        result = analyze_terminology_protection(original_text, rewritten_text, terms)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8417)
