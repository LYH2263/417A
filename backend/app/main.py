from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
import uuid
import json

try:
    from app.parser import extract_text
    from app.detector import detect_ai_content, detect_ai_content_advanced
    from app.rewriter import rewrite_text, rewrite_text_with_context, rewrite_text_stream, rewrite_text_with_context_stream
    from app.structure_analyzer import analyze_and_score_sections, rewrite_section_content, adjust_section_indices
except ImportError:
    try:
        from .parser import extract_text
        from .detector import detect_ai_content, detect_ai_content_advanced
        from .rewriter import rewrite_text, rewrite_text_with_context, rewrite_text_stream, rewrite_text_with_context_stream
        from .structure_analyzer import analyze_and_score_sections, rewrite_section_content, adjust_section_indices
    except ImportError:
        from parser import extract_text
        from detector import detect_ai_content, detect_ai_content_advanced
        from rewriter import rewrite_text, rewrite_text_with_context, rewrite_text_stream, rewrite_text_with_context_stream
        from structure_analyzer import analyze_and_score_sections, rewrite_section_content, adjust_section_indices

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
            level=payload.level
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
    
    try:
        detection_after = detect_ai_content(combined_text)
    except Exception:
        detection_after = None
    
    return {
        "paragraphs": results,
        "combined_text": combined_text,
        "detection_after": detection_after
    }

@app.post("/api/rewrite")
async def rewrite(payload: RewritePayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    
    current_text = payload.text
    max_retries = 3
    detection_after = None
    
    history = []
    history.append({
        "version": 0,
        "label": "原文",
        "text": payload.text,
        "detection": None
    })
    
    for i in range(max_retries):
        current_text = rewrite_text(current_text, payload.level)
        detection_after = detect_ai_content(current_text)
        
        history.append({
            "version": i + 1,
            "label": f"第{i + 1}轮改写",
            "text": current_text,
            "detection": detection_after
        })
        
        if detection_after["overall_ai_score"] < 10:
            break
            
    return {
        "original_text": payload.text,
        "rewritten_text": current_text,
        "detection_after": detection_after,
        "iterations": i + 1,
        "history": history
    }

@app.get("/")
async def root():
    return {"message": "Welcome to the Academic AIGC Helper API"}

@app.post("/api/detect-text")
async def detect_text(payload: TextPayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    result = detect_ai_content(payload.text)
    return result

@app.post("/api/detect-text-advanced")
async def detect_text_advanced(payload: AdvancedDetectPayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    result = detect_ai_content_advanced(payload.text, bootstrap_samples=payload.bootstrap_samples)
    return result

@app.post("/api/detect-file")
async def detect_file(file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = extract_text(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    result = detect_ai_content(text)
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
    SSE 流式改写接口：逐 token 推送改写结果
    """
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")

    stream_id = payload.stream_id or str(uuid.uuid4())
    original_text = payload.text
    estimated_total = _estimate_total_chars(original_text)

    # 注册流状态
    _stream_registry[stream_id] = {
        "aborted": False,
        "original_text": original_text,
    }

    async def event_generator():
        accumulated = ""
        try:
            # 先发送 start 事件，告知 stream_id 和预估字数
            yield _sse_event("start", {
                "stream_id": stream_id,
                "estimated_total_chars": estimated_total,
                "original_length": len(original_text),
            })

            is_aborted = lambda: _stream_registry.get(stream_id, {}).get("aborted", False)

            # 执行流式改写
            async for chunk in rewrite_text_stream(
                text=original_text,
                level=payload.level,
                is_aborted=is_aborted
            ):
                if await request.is_disconnected():
                    print(f"[SSE] 客户端已断开: {stream_id}")
                    break
                if is_aborted():
                    yield _sse_event("aborted", {
                        "stream_id": stream_id,
                        "partial_text": accumulated,
                    })
                    return
                accumulated += chunk
                yield _sse_event("token", {
                    "stream_id": stream_id,
                    "delta": chunk,
                    "text": accumulated,
                    "generated_chars": len(accumulated),
                    "estimated_total_chars": estimated_total,
                })

            # 如果是因为 abort 退出，不需要再发 done
            if is_aborted():
                return

            # 生成完成后做一次检测
            detection_after = None
            try:
                detection_after = detect_ai_content(accumulated)
            except Exception:
                detection_after = None

            yield _sse_event("done", {
                "stream_id": stream_id,
                "final_text": accumulated,
                "generated_chars": len(accumulated),
                "detection_after": detection_after,
            })

        except Exception as e:
            print(f"[SSE] 流式改写异常: {e}")
            yield _sse_event("error", {
                "stream_id": stream_id,
                "message": str(e),
                "partial_text": accumulated,
            })
        finally:
            # 清理注册
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

            detection_after = None
            try:
                detection_after = detect_ai_content(combined_text)
            except Exception:
                detection_after = None

            yield _sse_event("done", {
                "stream_id": stream_id,
                "paragraphs": results,
                "combined_text": combined_text,
                "detection_after": detection_after,
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8417)
