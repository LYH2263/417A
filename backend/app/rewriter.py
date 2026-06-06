import os
import requests
import re
from dotenv import load_dotenv
import json
import asyncio
import time
from typing import AsyncGenerator, Callable, Optional, Generator

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
# 修正模型名称：Groq 的正确模型名是 llama-3.3-70b-versatile 或 llama3-8b-8192
MODEL_NAME = os.getenv("MODEL_NAME", "llama-3.3-70b-versatile")


def _simulated_rewrite(text: str) -> str:
    """
    降级方案：模拟人工改写功能
    通过同义词替换和句式调整模拟学术改写，用于 API 调用失败时的兜底。
    """
    # 学术同义词映射
    synonyms = {
        "However": "Nevertheless",
        "Therefore": "Consequently",
        "Furthermore": "Moreover",
        "Thus": "Hence",
        "Because": "Since",
        "Important": "Critical",
        "Significant": "Substantial",
        "Necessary": "Essential",
        "Show": "Demonstrate",
        "Use": "Utilize",
        "Improve": "Enhance",
        "Result": "Outcome",
        "Method": "Approach",
        "Data": "Information",
        "Small": "Marginal",
        "Large": "Extensive",
        "Find": "Discover",
        "Change": "Modify",
        "Start": "Initiate",
    }
    
    # 1. 常见短语替换
    phrases = {
        r"\bIn order to\b": "To",
        r"\bIt is important to note that\b": "Notably,",
        r"\bThe results show that\b": "The findings demonstrate that",
        r"\bDue to the fact that\b": "Because",
    }
    
    result = text
    for pattern, replacement in phrases.items():
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    
    # 2. 单词逐个替换
    words = result.split()
    rewritten_words = []
    
    for word in words:
        # 分离前缀、核心词、后缀标点
        match = re.match(r"^([^\w]*)([\w'-]+)([^\w]*)$", word)
        if match:
            prefix, clean_word, suffix = match.groups()
            
            replacement = None
            if clean_word in synonyms:
                replacement = synonyms[clean_word]
            elif clean_word.capitalize() in synonyms:
                replacement = synonyms[clean_word.capitalize()]
            elif clean_word.lower() in synonyms:
                replacement = synonyms[clean_word.lower()]
                
            if replacement:
                # 保持大小写
                if clean_word.istitle():
                    replacement = replacement.capitalize()
                elif clean_word.isupper():
                    replacement = replacement.upper()
                else:
                    replacement = replacement.lower()
                rewritten_words.append(f"{prefix}{replacement}{suffix}")
            else:
                rewritten_words.append(word)
        else:
            rewritten_words.append(word)
            
    return " ".join(rewritten_words)

def rewrite_text_with_context(text: str, prev_context: str = "", next_context: str = "", level: str = "medium"):
    """
    Rewrites a single paragraph with adjacent paragraph context for cohesion.
    Only the target paragraph is rewritten; context is used for reference only.
    Levels: low, medium, high
    """
    if not GROQ_API_KEY:
        print("⚠️ 未配置 GROQ_API_KEY，切换到降级方案（模拟改写）")
        return _simulated_rewrite(text)

    prompts = {
        "low": "Perform slight synonym replacement and minor sentence restructuring to improve flow while maintaining the original tone.",
        "medium": "Restructure sentences and vary vocabulary significantly. Use diverse sentence lengths and improve transitional flow to sound more like a seasoned human academic writer.",
        "high": "Deeply transform the narrative structure. Combine or split sentences, use sophisticated academic vocabulary, and introduce human-like 'burstiness' (varying complexity). Ensure the meaning is identical but the linguistic fingerprint is entirely different."
    }

    instruction = prompts.get(level, prompts["medium"])

    context_parts = []
    if prev_context:
        context_parts.append(f"[Previous paragraph (for context only, do NOT rewrite or include in output)]:\n{prev_context}")
    if next_context:
        context_parts.append(f"[Next paragraph (for context only, do NOT rewrite or include in output)]:\n{next_context}")

    context_block = "\n\n".join(context_parts) if context_parts else ""

    system_prompt = f"""You are a professional academic editor specialized in reducing AIGC (AI-Generated Content) detection rates while maintaining extreme academic rigors.

Your Task: {instruction}

STRICT CONSTRAINTS:
1. DO NOT change any technical terms, domain-specific vocabulary, or proper nouns.
2. DO NOT change any mathematical formulas, LaTeX expressions, or chemical symbols.
3. DO NOT change any citations (e.g., [12], (Author, 2023)) or references.
4. DO NOT change experimental data, numbers, or specific results.
5. Maintain the original meaning and logical structure of the argument.
6. Improve the 'human-like' qualities: use varied sentence lengths, appropriate transitional phrases, and a natural academic style.
7. Pay attention to contextual cohesion with the provided adjacent paragraphs. Use transitions naturally so the rewritten paragraph flows well with its neighbors.
8. ONLY output the rewritten target paragraph. Do NOT include the context paragraphs, do NOT add any labels or markers.

{context_block}

OUTPUT: Provide ONLY the rewritten text of the target paragraph, no explanations, no preamble, and no 'Here is the rewritten text' message."""

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"[Target paragraph to rewrite]:\n{text}"}
        ],
        "temperature": 0.7 if level == "low" else (0.85 if level == "medium" else 1.0),
        "max_tokens": 2000
    }

    try:
        print(f"🔄 正在调用 Groq API（带上下文改写），模型: {MODEL_NAME}")
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=20)

        if response.status_code != 200:
            print(f"❌ Groq API 错误 ({response.status_code})，切换到降级方案")
            return _simulated_rewrite(text)

        result = response.json()
        rewritten = result['choices'][0]['message']['content'].strip()
        print(f"✅ Groq API 上下文改写成功")
        return rewritten

    except Exception as e:
        print(f"❌ Groq API 调用失败: {str(e)}，启动降级方案")
        return _simulated_rewrite(text)


def rewrite_text(text: str, level: str = "medium"):
    """
    Rewrites academic text using Groq API while preserving technical terms and structure.
    Levels: low, medium, high
    """
    
    if not GROQ_API_KEY:
        print("⚠️ 未配置 GROQ_API_KEY，切换到降级方案（模拟改写）")
        return _simulated_rewrite(text)
    
    prompts = {
        "low": "Perform slight synonym replacement and minor sentence restructuring to improve flow while maintaining the original tone.",
        "medium": "Restructure sentences and vary vocabulary significantly. Use diverse sentence lengths and improve transitional flow to sound more like a seasoned human academic writer.",
        "high": "Deeply transform the narrative structure. Combine or split sentences, use sophisticated academic vocabulary, and introduce human-like 'burstiness' (varying complexity). Ensure the meaning is identical but the linguistic fingerprint is entirely different."
    }
    
    instruction = prompts.get(level, prompts["medium"])
    
    system_prompt = f"""You are a professional academic editor specialized in reducing AIGC (AI-Generated Content) detection rates while maintaining extreme academic rigors.
    
    Your Task: {instruction}
    
    STRICT CONSTRAINTS:
    1. DO NOT change any technical terms, domain-specific vocabulary, or proper nouns.
    2. DO NOT change any mathematical formulas, LaTeX expressions, or chemical symbols.
    3. DO NOT change any citations (e.g., [12], (Author, 2023)) or references.
    4. DO NOT change experimental data, numbers, or specific results.
    5. Maintain the original meaning and logical structure of the argument.
    6. Improve the 'human-like' qualities: use varied sentence lengths, appropriate transitional phrases, and a natural academic style.
    
    OUTPUT: Provide ONLY the rewritten text, no explanations, no preamble, and no 'Here is the rewritten text' message."""

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text}
        ],
        "temperature": 0.7 if level == "low" else (0.85 if level == "medium" else 1.0),
        "max_tokens": 2000
    }

    try:
        print(f"🔄 正在调用 Groq API，模型: {MODEL_NAME}")
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=20)
        
        if response.status_code != 200:
            print(f"❌ Groq API 错误 ({response.status_code})，切换到降级方案")
            return _simulated_rewrite(text)
        
        result = response.json()
        rewritten = result['choices'][0]['message']['content'].strip()
        print(f"✅ Groq API 改写成功")
        return rewritten
        
    except Exception as e:
        print(f"❌ Groq API 调用失败: {str(e)}，启动降级方案")
        return _simulated_rewrite(text)


def _build_system_prompt(level: str, prev_context: str = "", next_context: str = "") -> str:
    """构建 system prompt，供同步和流式调用共用"""
    prompts = {
        "low": "Perform slight synonym replacement and minor sentence restructuring to improve flow while maintaining the original tone.",
        "medium": "Restructure sentences and vary vocabulary significantly. Use diverse sentence lengths and improve transitional flow to sound more like a seasoned human academic writer.",
        "high": "Deeply transform the narrative structure. Combine or split sentences, use sophisticated academic vocabulary, and introduce human-like 'burstiness' (varying complexity). Ensure the meaning is identical but the linguistic fingerprint is entirely different."
    }
    instruction = prompts.get(level, prompts["medium"])

    context_parts = []
    if prev_context:
        context_parts.append(f"[Previous paragraph (for context only, do NOT rewrite or include in output)]:\n{prev_context}")
    if next_context:
        context_parts.append(f"[Next paragraph (for context only, do NOT rewrite or include in output)]:\n{next_context}")
    context_block = "\n\n".join(context_parts) if context_parts else ""

    context_note = ""
    if prev_context or next_context:
        context_note = "8. Pay attention to contextual cohesion with the provided adjacent paragraphs. Use transitions naturally so the rewritten paragraph flows well with its neighbors.\n9. ONLY output the rewritten target paragraph. Do NOT include the context paragraphs, do NOT add any labels or markers."
    else:
        context_note = "8. ONLY output the rewritten text, no explanations, no preamble, and no 'Here is the rewritten text' message."

    return f"""You are a professional academic editor specialized in reducing AIGC (AI-Generated Content) detection rates while maintaining extreme academic rigors.

Your Task: {instruction}

STRICT CONSTRAINTS:
1. DO NOT change any technical terms, domain-specific vocabulary, or proper nouns.
2. DO NOT change any mathematical formulas, LaTeX expressions, or chemical symbols.
3. DO NOT change any citations (e.g., [12], (Author, 2023)) or references.
4. DO NOT change experimental data, numbers, or specific results.
5. Maintain the original meaning and logical structure of the argument.
6. Improve the 'human-like' qualities: use varied sentence lengths, appropriate transitional phrases, and a natural academic style.
{context_note}

{context_block}"""


def _simulated_stream(text: str, chunk_size: int = 2) -> Generator[str, None, None]:
    """
    降级模式下模拟流式输出，按字符分片 yield，模拟打字机效果
    """
    rewritten = _simulated_rewrite(text)
    for i in range(0, len(rewritten), chunk_size):
        yield rewritten[i:i + chunk_size]


async def _simulated_async_stream(
    text: str,
    chunk_size: int = 2,
    delay: float = 0.015,
    is_aborted: Optional[Callable[[], bool]] = None
) -> AsyncGenerator[str, None]:
    """
    降级模式下异步模拟流式输出，按字符分片 yield，模拟打字机效果
    """
    rewritten = _simulated_rewrite(text)
    for i in range(0, len(rewritten), chunk_size):
        if is_aborted and is_aborted():
            return
        yield rewritten[i:i + chunk_size]
        await asyncio.sleep(delay)


def _build_chat_payload(text: str, level: str, prev_context: str = "", next_context: str = "") -> dict:
    """构建 Groq API 请求 payload，同步/流式共用"""
    system_prompt = _build_system_prompt(level, prev_context, next_context)
    user_content = f"[Target paragraph to rewrite]:\n{text}" if (prev_context or next_context) else text
    return {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        "temperature": 0.7 if level == "low" else (0.85 if level == "medium" else 1.0),
        "max_tokens": 2000,
        "stream": True
    }


async def rewrite_text_stream(
    text: str,
    level: str = "medium",
    is_aborted: Optional[Callable[[], bool]] = None
) -> AsyncGenerator[str, None]:
    """
    流式改写学术文本，逐 token yield 改写结果
    支持降级模式和中止信号
    """
    if not GROQ_API_KEY:
        print("⚠️ 未配置 GROQ_API_KEY，切换到降级方案（模拟流式改写）")
        async for chunk in _simulated_async_stream(text, is_aborted=is_aborted):
            yield chunk
        return

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
    }
    payload = _build_chat_payload(text, level)

    try:
        print(f"🔄 正在调用 Groq API（流式改写），模型: {MODEL_NAME}")
        loop = asyncio.get_event_loop()

        def _do_request():
            return requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
                stream=True,
                timeout=(5, 120)
            )

        response = await loop.run_in_executor(None, _do_request)

        if response.status_code != 200:
            print(f"❌ Groq API 错误 ({response.status_code})，切换到降级方案")
            async for chunk in _simulated_async_stream(text, is_aborted=is_aborted):
                yield chunk
            return

        buffer = ""
        for line in response.iter_lines():
            if is_aborted and is_aborted():
                print("⏹️ 流式改写已中止")
                response.close()
                return
            if not line:
                continue
            line_str = line.decode('utf-8') if isinstance(line, bytes) else line
            if line_str.startswith("data: "):
                data_str = line_str[6:]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    data = json.loads(data_str)
                    delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if delta:
                        yield delta
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
        print(f"✅ Groq API 流式改写成功")

    except Exception as e:
        print(f"❌ Groq API 流式调用失败: {str(e)}，启动降级方案")
        async for chunk in _simulated_async_stream(text, is_aborted=is_aborted):
            yield chunk


async def rewrite_text_with_context_stream(
    text: str,
    prev_context: str = "",
    next_context: str = "",
    level: str = "medium",
    is_aborted: Optional[Callable[[], bool]] = None
) -> AsyncGenerator[str, None]:
    """
    带上下文的流式改写，逐 token yield
    """
    if not GROQ_API_KEY:
        print("⚠️ 未配置 GROQ_API_KEY，切换到降级方案（模拟流式改写）")
        async for chunk in _simulated_async_stream(text, is_aborted=is_aborted):
            yield chunk
        return

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
    }
    payload = _build_chat_payload(text, level, prev_context, next_context)

    try:
        print(f"🔄 正在调用 Groq API（上下文流式改写），模型: {MODEL_NAME}")
        loop = asyncio.get_event_loop()

        def _do_request():
            return requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
                stream=True,
                timeout=(5, 120)
            )

        response = await loop.run_in_executor(None, _do_request)

        if response.status_code != 200:
            print(f"❌ Groq API 错误 ({response.status_code})，切换到降级方案")
            async for chunk in _simulated_async_stream(text, is_aborted=is_aborted):
                yield chunk
            return

        for line in response.iter_lines():
            if is_aborted and is_aborted():
                print("⏹️ 流式改写已中止")
                response.close()
                return
            if not line:
                continue
            line_str = line.decode('utf-8') if isinstance(line, bytes) else line
            if line_str.startswith("data: "):
                data_str = line_str[6:]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    data = json.loads(data_str)
                    delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if delta:
                        yield delta
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
        print(f"✅ Groq API 上下文流式改写成功")

    except Exception as e:
        print(f"❌ Groq API 流式调用失败: {str(e)}，启动降级方案")
        async for chunk in _simulated_async_stream(text, is_aborted=is_aborted):
            yield chunk
