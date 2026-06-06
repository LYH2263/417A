from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List

try:
    from app.parser import extract_text
    from app.detector import detect_ai_content, detect_ai_content_advanced
    from app.rewriter import rewrite_text, rewrite_text_with_context
    from app.structure_analyzer import analyze_and_score_sections, rewrite_section_content, adjust_section_indices
except ImportError:
    try:
        from .parser import extract_text
        from .detector import detect_ai_content, detect_ai_content_advanced
        from .rewriter import rewrite_text, rewrite_text_with_context
        from .structure_analyzer import analyze_and_score_sections, rewrite_section_content, adjust_section_indices
    except ImportError:
        from parser import extract_text
        from detector import detect_ai_content, detect_ai_content_advanced
        from rewriter import rewrite_text, rewrite_text_with_context
        from structure_analyzer import analyze_and_score_sections, rewrite_section_content, adjust_section_indices

app = FastAPI(title="Academic AIGC Helper API")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8417)
