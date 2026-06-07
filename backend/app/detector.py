from transformers import pipeline
import torch
import os
import random
import math
import time

os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

_detector = None

def get_detector():
    global _detector
    if os.getenv("DISABLE_AI_DETECTION") == "true":
        return None

    if _detector is None:
        try:
            model_name = "distilbert-base-uncased"
            _detector = pipeline("text-classification", model=model_name)
            print(f"✅ AI 检测模型加载成功: {model_name}")
        except Exception as e:
            print(f"⚠️ 模型加载失败，使用备用方案: {e}")
            _detector = None
    return _detector

def is_model_degraded(detector):
    return detector is None

import re as _re

def smart_split_sentences(text: str):
    text = text.strip()
    if not text:
        return []

    sentences = []
    buffer = ""
    i = 0
    abbreviations = {
        "mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.", "vs.", "etc.",
        "e.g.", "i.e.", "cf.", "fig.", "eq.", "ref.", "st.", "ave.", "rd.",
        "u.s.", "u.k.", "a.m.", "p.m.", "ph.d.", "b.s.", "m.s.",
        "jan.", "feb.", "mar.", "apr.", "jun.", "jul.", "aug.", "sep.", "oct.", "nov.", "dec.",
        "vol.", "no.", "nos.", "pp.", "p.", "ed.", "eds.", "chap.", "ch.", "sec.",
        "sect.", "para.", "par.", "approx.", "app.", "def.", "eqn.", "resp.",
        "misc.", "max.", "min.", "cit.", "op.", "loc."
    }
    quote_chars = {'"', "'", "”", "’", "」", "』", "）", ")"}

    while i < len(text):
        ch = text[i]
        buffer += ch

        if ch in ".。!！?？":
            lookahead = text[i+1:i+6].lower() if i + 1 < len(text) else ""
            curr_tail = buffer.strip().lower()

            is_abbrev = False
            if ch == ".":
                last_token = curr_tail.split()[-1] if curr_tail.split() else ""
                clean_token = last_token.strip(",;:()[]{}<>")
                if clean_token in abbreviations:
                    is_abbrev = True
                bare = clean_token.replace(".", "")
                if 1 <= len(bare) <= 3 and bare.isalpha():
                    is_abbrev = True
                if bare and bare.isdigit():
                    is_abbrev = True

            if not is_abbrev:
                j = i + 1
                while j < len(text) and text[j] in quote_chars:
                    buffer += text[j]
                    j += 1
                while j < len(text) and text[j].isspace():
                    buffer += text[j]
                    j += 1

                stripped = buffer.strip()
                if len(stripped) > 0:
                    sentences.append(stripped)
                buffer = ""
                i = j
                continue

        i += 1

    if buffer.strip():
        sentences.append(buffer.strip())

    if len(sentences) <= 1 and len(text) > 200:
        fallback = _re.split(r'(?<=[。.!?！？])\s+', text)
        fallback = [s.strip() for s in fallback if s.strip()]
        if len(fallback) > len(sentences):
            return fallback

    if len(sentences) <= 1 and len(text) > 300:
        chunks = []
        chunk_size = max(80, len(text) // max(1, len(text) // 150))
        for k in range(0, len(text), chunk_size):
            piece = text[k:k+chunk_size].strip()
            if piece:
                chunks.append(piece)
        if len(chunks) > 1:
            return chunks

    if len(sentences) <= 1:
        return [text]

    return sentences

def recompute_overall_stats(details):
    if not details:
        return {
            "overall_ai_score": 0.0,
            "overall_mean": 0.0,
            "overall_std": 0.0,
            "overall_ci_lower": 0.0,
            "overall_ci_upper": 0.0,
            "overall_credibility": "high"
        }

    total_weight = 0
    weighted_mean = 0.0
    all_scores = []
    for d in details:
        w = max(1, len(d.get("text", "")))
        total_weight += w
        mean_val = d.get("mean", d.get("ai_score", 0.5))
        weighted_mean += mean_val * w
        if "samples" in d and isinstance(d["samples"], list):
            all_scores.extend(d["samples"])
        else:
            all_scores.append(mean_val)

    weighted_mean = weighted_mean / total_weight if total_weight > 0 else 0.0
    all_mean = sum(all_scores) / len(all_scores) if all_scores else 0.0
    if len(all_scores) > 1:
        overall_std = math.sqrt(sum((s - all_mean) ** 2 for s in all_scores) / (len(all_scores) - 1))
    else:
        overall_std = 0.0
    n_total = len(all_scores)
    z = 1.96
    margin = z * (overall_std / math.sqrt(n_total)) if n_total > 0 else 0.0
    overall_ci_lower = max(0.0, weighted_mean - margin)
    overall_ci_upper = min(1.0, weighted_mean + margin)

    if overall_std <= 0.05:
        cred = "high"
    elif overall_std <= 0.12:
        cred = "medium"
    else:
        cred = "low"

    return {
        "overall_ai_score": round(weighted_mean * 100, 2),
        "overall_mean": weighted_mean,
        "overall_std": overall_std,
        "overall_ci_lower": overall_ci_lower,
        "overall_ci_upper": overall_ci_upper,
        "overall_credibility": cred
    }

def _score_chunk(detector, chunk):
    try:
        res = detector(chunk)[0]
        return res['score'] if 'LABEL_1' in res.get('label', '') else (1 - res['score'])
    except Exception as e:
        print(f"检测出错: {e}")
        return 0.5

def _bootstrap_sample_scores(detector, paragraph, n_samples):
    scores = []
    text = paragraph.strip()
    if len(text) < 30:
        score = _score_chunk(detector, text)
        return [score] * n_samples

    min_len = max(30, min(100, len(text) // 2))
    max_len = max(min_len + 20, min(400, len(text)))

    for _ in range(n_samples):
        if max_len > min_len:
            seg_len = random.randint(min_len, max_len)
        else:
            seg_len = min_len
        seg_len = min(seg_len, len(text))
        if len(text) - seg_len > 0:
            start = random.randint(0, len(text) - seg_len)
        else:
            start = 0
        segment = text[start:start + seg_len]
        scores.append(_score_chunk(detector, segment))
    return scores

def _compute_stats(scores):
    n = len(scores)
    if n == 0:
        return {"mean": 0.5, "std": 0.0, "ci_lower": 0.5, "ci_upper": 0.5}
    mean = sum(scores) / n
    if n > 1:
        variance = sum((s - mean) ** 2 for s in scores) / (n - 1)
    else:
        variance = 0.0
    std = math.sqrt(variance)
    z = 1.96
    if n > 0:
        margin = z * (std / math.sqrt(n))
    else:
        margin = 0.0
    ci_lower = max(0.0, mean - margin)
    ci_upper = min(1.0, mean + margin)
    return {
        "mean": mean,
        "std": std,
        "ci_lower": ci_lower,
        "ci_upper": ci_upper,
        "samples": scores
    }

def _credibility_level(std):
    if std <= 0.05:
        return "high"
    elif std <= 0.12:
        return "medium"
    else:
        return "low"

def detect_ai_content(text: str, iteration_hint: int = 0):
    detector = get_detector()

    if is_model_degraded(detector):
        base_score = 50.0
        decay = min(iteration_hint * 12.5, 35.0)
        simulated_score = round(max(10.0, base_score - decay + random.uniform(-2, 2)), 2)
        return {
            "overall_ai_score": simulated_score,
            "details": [{
                "text": text[:500],
                "ai_score": simulated_score / 100.0
            }],
            "note": "模型加载中，当前为模拟数据",
            "degraded": True
        }

    max_length = 500
    chunks = [text[i:i+max_length] for i in range(0, len(text), max_length)]

    results = []
    for chunk in chunks:
        if len(chunk.strip()) < 10:
            continue
        ai_score = _score_chunk(detector, chunk)
        results.append({
            "text": chunk,
            "ai_score": ai_score
        })

    if not results:
        return {"overall_ai_score": 0, "details": [], "degraded": False}

    avg_score = sum(r['ai_score'] for r in results) / len(results)
    return {
        "overall_ai_score": round(avg_score * 100, 2),
        "details": results,
        "degraded": False
    }

def detect_ai_content_advanced(text: str, bootstrap_samples: int = 5):
    detector = get_detector()
    start_time = time.time()

    if is_model_degraded(detector):
        paragraphs = text.split('\n\n')
        if not paragraphs or all(p.strip() == '' for p in paragraphs):
            paragraphs = [text[:500]] if text else [""]
        details = []
        for p in paragraphs:
            p = p.strip()
            if not p:
                continue
            details.append({
                "text": p[:500],
                "ai_score": 0.5,
                "mean": 0.5,
                "std": 0.0,
                "ci_lower": 0.5,
                "ci_upper": 0.5,
                "credibility": "low",
                "samples": [0.5] * bootstrap_samples,
                "sample_count": bootstrap_samples
            })
        return {
            "overall_ai_score": 50.0,
            "overall_mean": 0.5,
            "overall_std": 0.0,
            "overall_ci_lower": 0.5,
            "overall_ci_upper": 0.5,
            "overall_credibility": "low",
            "details": details,
            "note": "模型加载中，当前为模拟数据",
            "degraded": True,
            "bootstrap_samples": bootstrap_samples,
            "elapsed_ms": round((time.time() - start_time) * 1000, 1)
        }

    paragraphs_raw = [p.strip() for p in text.split('\n\n') if p.strip()]
    if not paragraphs_raw:
        paragraphs_raw = [text]

    max_length = 450
    details = []
    for para in paragraphs_raw:
        if not para or len(para.strip()) < 10:
            continue
        if len(para) > max_length:
            sub_paras = [para[i:i+max_length] for i in range(0, len(para), max_length)]
        else:
            sub_paras = [para]
        for sp in sub_paras:
            if len(sp.strip()) < 10:
                continue
            scores = _bootstrap_sample_scores(detector, sp, bootstrap_samples)
            stats = _compute_stats(scores)
            details.append({
                "text": sp,
                "ai_score": stats["mean"],
                "mean": stats["mean"],
                "std": stats["std"],
                "ci_lower": stats["ci_lower"],
                "ci_upper": stats["ci_upper"],
                "credibility": _credibility_level(stats["std"]),
                "samples": stats["samples"],
                "sample_count": bootstrap_samples
            })

    if not details:
        return {
            "overall_ai_score": 0,
            "overall_mean": 0.0,
            "overall_std": 0.0,
            "overall_ci_lower": 0.0,
            "overall_ci_upper": 0.0,
            "overall_credibility": "high",
            "details": [],
            "degraded": False,
            "bootstrap_samples": bootstrap_samples,
            "elapsed_ms": round((time.time() - start_time) * 1000, 1)
        }

    total_weight = 0
    weighted_mean = 0.0
    weighted_var = 0.0
    all_scores = []
    for d in details:
        w = max(1, len(d["text"]))
        total_weight += w
        weighted_mean += d["mean"] * w
        all_scores.extend(d["samples"])

    weighted_mean = weighted_mean / total_weight if total_weight > 0 else 0.0
    all_mean = sum(all_scores) / len(all_scores) if all_scores else 0.0
    if len(all_scores) > 1:
        overall_std = math.sqrt(sum((s - all_mean) ** 2 for s in all_scores) / (len(all_scores) - 1))
    else:
        overall_std = 0.0
    n_total = len(all_scores)
    z = 1.96
    margin = z * (overall_std / math.sqrt(n_total)) if n_total > 0 else 0.0
    overall_ci_lower = max(0.0, weighted_mean - margin)
    overall_ci_upper = min(1.0, weighted_mean + margin)

    return {
        "overall_ai_score": round(weighted_mean * 100, 2),
        "overall_mean": weighted_mean,
        "overall_std": overall_std,
        "overall_ci_lower": overall_ci_lower,
        "overall_ci_upper": overall_ci_upper,
        "overall_credibility": _credibility_level(overall_std),
        "details": details,
        "degraded": False,
        "bootstrap_samples": bootstrap_samples,
        "elapsed_ms": round((time.time() - start_time) * 1000, 1)
    }
