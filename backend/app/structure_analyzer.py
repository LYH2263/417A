import re
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field


@dataclass
class PaperSection:
    id: str
    title: str
    level: int
    start_index: int
    end_index: int
    content: str
    ai_score: Optional[float] = None
    degraded: bool = False
    details: List[Dict] = field(default_factory=list)
    standard_type: Optional[str] = None


STANDARD_SECTION_PATTERNS = [
    ("abstract", [
        r"^(?P<num>\d*\.?\d*)\s*(?:abstract|摘要|提要)\s*[:：]?\s*$",
        r"^\s*(?:abstract|摘要|提要)\s*[:：]?\s*$",
    ]),
    ("introduction", [
        r"^(?P<num>\d+\.?\d*)\s*(?:introduction|引言|前言|绪论|介绍)\s*[:：]?\s*$",
        r"^\s*(?:1\s+)?(?:introduction|引言|前言|绪论|介绍)\s*[:：]?\s*$",
        r"^1\s+(?:introduction|引言|前言|绪论)\s*$",
    ]),
    ("background", [
        r"^(?P<num>\d+\.?\d*)\s*(?:background|related work|literature review|研究背景|相关工作|文献综述)\s*[:：]?\s*$",
        r"^\s*(?:background|related work|literature review|研究背景|相关工作|文献综述)\s*[:：]?\s*$",
    ]),
    ("methods", [
        r"^(?P<num>\d+\.?\d*)\s*(?:methods|methodology|materials and methods|materials & methods|方法|研究方法|材料与方法|实验方法)\s*[:：]?\s*$",
        r"^\s*(?:methods|methodology|materials and methods|materials & methods|方法|研究方法|材料与方法|实验方法)\s*[:：]?\s*$",
    ]),
    ("results", [
        r"^(?P<num>\d+\.?\d*)\s*(?:results|experimental results|结果|实验结果|研究结果)\s*[:：]?\s*$",
        r"^\s*(?:results|experimental results|结果|实验结果|研究结果)\s*[:：]?\s*$",
    ]),
    ("discussion", [
        r"^(?P<num>\d+\.?\d*)\s*(?:discussion|讨论|分析与讨论|结果讨论)\s*[:：]?\s*$",
        r"^\s*(?:discussion|讨论|分析与讨论|结果讨论)\s*[:：]?\s*$",
    ]),
    ("conclusion", [
        r"^(?P<num>\d+\.?\d*)\s*(?:conclusion|conclusions|总结|结论|结语)\s*[:：]?\s*$",
        r"^\s*(?:conclusion|conclusions|总结|结论|结语)\s*[:：]?\s*$",
    ]),
    ("acknowledgments", [
        r"^(?P<num>\d*\.?\d*)\s*(?:acknowledg?ments?|致谢|感谢)\s*[:：]?\s*$",
        r"^\s*(?:acknowledg?ments?|致谢|感谢)\s*[:：]?\s*$",
    ]),
    ("references", [
        r"^(?P<num>\d*\.?\d*)\s*(?:references?|bibliography|参考文献|参考资料)\s*[:：]?\s*$",
        r"^\s*(?:references?|bibliography|参考文献|参考资料)\s*[:：]?\s*$",
    ]),
    ("appendix", [
        r"^(?P<num>\d*\.?\d*)\s*(?:appendix|appendices|附录)\s*[:：]?\s*$",
        r"^\s*(?:appendix|appendices|附录)\s*[:：]?\s*$",
    ]),
]


GENERIC_HEADING_PATTERN = re.compile(
    r"^(?P<num>\d+(?:\.\d+)*)\s+(?P<title>[A-Z\u4e00-\u9fa5][A-Za-z\u4e00-\u9fa5\s\-_/&]+)\s*$"
)
SHORT_HEADING_PATTERN = re.compile(
    r"^(?P<title>[A-Z\u4e00-\u9fa5][A-Za-z\u4e00-\u9fa5\s\-_/&]{1,60})\s*[:：]?\s*$"
)


def _match_standard_section(line: str) -> Optional[str]:
    stripped = line.strip()
    for std_type, patterns in STANDARD_SECTION_PATTERNS:
        for pat in patterns:
            if re.match(pat, stripped, re.IGNORECASE):
                return std_type
    return None


def _is_generic_heading(line: str, next_lines: List[str] = None) -> Tuple[bool, Optional[int], Optional[str]]:
    stripped = line.strip()
    if not stripped or len(stripped) > 100:
        return False, None, None

    m = GENERIC_HEADING_PATTERN.match(stripped)
    if m:
        num_str = m.group("num")
        level = len(num_str.split("."))
        title = m.group("title").strip()
        return True, level, title

    std_type = _match_standard_section(stripped)
    if std_type:
        return True, 1, stripped

    if (
        len(stripped) <= 60
        and not stripped.endswith((".", "。", ",", "，", ";", "；"))
        and stripped == stripped.title() if stripped.isascii() else True
    ):
        if next_lines and len(next_lines) > 0:
            next_line = next_lines[0].strip()
            if len(next_line) > 60 or next_line.endswith((".", "。")):
                return True, 1, stripped

    return False, None, None


def extract_paper_structure(text: str) -> List[PaperSection]:
    if not text or not text.strip():
        return []

    lines = text.split("\n")
    sections: List[PaperSection] = []
    current_section: Optional[PaperSection] = None
    section_counter = 0

    char_index = 0
    line_start_indices = [0]
    for ln in lines:
        char_index += len(ln) + 1
        line_start_indices.append(char_index)

    for i, line in enumerate(lines):
        stripped = line.strip()
        next_lines = lines[i + 1:i + 3] if i + 1 < len(lines) else []

        is_heading, level, title = _is_generic_heading(line, next_lines)

        if is_heading and title:
            if current_section is not None:
                current_section.end_index = line_start_indices[i]
                current_section.content = text[current_section.start_index:current_section.end_index].strip()
                sections.append(current_section)

            section_counter += 1
            std_type = _match_standard_section(stripped)
            content_start = line_start_indices[i] + len(line) + 1
            if content_start > len(text):
                content_start = len(text)
            current_section = PaperSection(
                id=f"sec_{section_counter}",
                title=title.strip(),
                level=level or 1,
                start_index=content_start,
                end_index=len(text),
                content="",
                standard_type=std_type
            )
        elif current_section is None and stripped:
            section_counter += 1
            current_section = PaperSection(
                id=f"sec_{section_counter}",
                title="Preliminaries / Title",
                level=1,
                start_index=line_start_indices[i],
                end_index=len(text),
                content="",
                standard_type=None
            )

    if current_section is not None:
        current_section.end_index = len(text)
        current_section.content = text[current_section.start_index:current_section.end_index].strip()
        sections.append(current_section)

    sections = [s for s in sections if s.content.strip()]

    return sections


def fallback_chunk_by_size(text: str, chunk_size: int = 2000) -> List[PaperSection]:
    if not text or not text.strip():
        return []

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    sections: List[PaperSection] = []
    current_chunk = []
    current_len = 0
    chunk_counter = 0

    for para in paragraphs:
        para_len = len(para)
        if current_len + para_len > chunk_size and current_chunk:
            chunk_counter += 1
            sections.append(PaperSection(
                id=f"sec_{chunk_counter}",
                title=f"Content Block {chunk_counter}",
                level=1,
                start_index=0,
                end_index=0,
                content="\n\n".join(current_chunk),
                standard_type=None
            ))
            current_chunk = [para]
            current_len = para_len
        else:
            current_chunk.append(para)
            current_len += para_len

    if current_chunk:
        chunk_counter += 1
        sections.append(PaperSection(
            id=f"sec_{chunk_counter}",
            title=f"Content Block {chunk_counter}",
            level=1,
            start_index=0,
            end_index=0,
            content="\n\n".join(current_chunk),
            standard_type=None
        ))

    return sections


def detect_short_format(text: str) -> str:
    text_lower = text.lower()

    letter_patterns = [
        r"dear\s+", r"yours\s+sincerely", r"sincerely\s*,",
        r"尊敬的", r"此致", r"敬礼", r"来信", r"回信"
    ]
    for pat in letter_patterns:
        if re.search(pat, text_lower) or re.search(pat, text):
            return "letter"

    word_count = len(re.findall(r"\w+", text)) + len(re.findall(r"[\u4e00-\u9fa5]", text))
    if word_count < 300:
        return "short_note"

    return "standard"


def analyze_and_score_sections(
    text: str,
    detect_fn
) -> Dict:
    sections = extract_paper_structure(text)

    if len(sections) <= 1 and len(sections) > 0 and len(sections[0].content) > 3000:
        sections = fallback_chunk_by_size(text)

    if len(sections) <= 1:
        sections = fallback_chunk_by_size(text, chunk_size=1500)

    format_type = detect_short_format(text)

    scored_sections = []
    for section in sections:
        if section.content and section.content.strip():
            try:
                result = detect_fn(section.content)
                section.ai_score = result.get("overall_ai_score")
                section.details = result.get("details", [])
                section.degraded = result.get("degraded", False)
            except Exception:
                section.ai_score = 50.0
                section.degraded = True
        scored_sections.append({
            "id": section.id,
            "title": section.title,
            "level": section.level,
            "start_index": section.start_index,
            "end_index": section.end_index,
            "content": section.content,
            "ai_score": section.ai_score,
            "degraded": section.degraded,
            "details": section.details,
            "standard_type": section.standard_type
        })

    overall_score = 0.0
    total_weight = 0
    for s in scored_sections:
        if s["ai_score"] is not None:
            w = max(1, len(s["content"]))
            overall_score += s["ai_score"] * w
            total_weight += w

    if total_weight > 0:
        overall_score = round(overall_score / total_weight, 2)

    return {
        "format_type": format_type,
        "overall_ai_score": overall_score if total_weight > 0 else None,
        "sections": scored_sections,
        "section_count": len(scored_sections),
        "fallback_used": len(sections) <= 1
    }


def rewrite_section_content(
    full_text: str,
    section: Dict,
    rewrite_fn,
    level: str = "medium"
) -> Tuple[str, Dict, int]:
    section_content = section.get("content", "")
    new_content = rewrite_fn(section_content, level)

    start = section.get("start_index", 0)
    end = section.get("end_index", len(full_text))

    new_full_text = full_text[:start] + new_content + full_text[end:]

    updated_section = {
        **section,
        "content": new_content,
        "original_content": section_content,
        "end_index": start + len(new_content)
    }

    offset = len(new_content) - (end - start)
    return new_full_text, updated_section, offset


def adjust_section_indices(sections: List[Dict], from_id: str, offset: int) -> List[Dict]:
    adjusted = []
    found = False
    for s in sections:
        new_s = dict(s)
        if s["id"] == from_id:
            found = True
        elif found:
            new_s["start_index"] = s["start_index"] + offset
            new_s["end_index"] = s["end_index"] + offset
        adjusted.append(new_s)
    return adjusted
