from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

try:
    from app.parser import extract_text
    from app.detector import detect_ai_content, detect_ai_content_advanced
    from app.rewriter import rewrite_text
except ImportError:
    try:
        from .parser import extract_text
        from .detector import detect_ai_content, detect_ai_content_advanced
        from .rewriter import rewrite_text
    except ImportError:
        from parser import extract_text
        from detector import detect_ai_content, detect_ai_content_advanced
        from rewriter import rewrite_text

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8417)
