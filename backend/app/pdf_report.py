import io
import os
import platform
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, black, white, red, green, grey
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
    TableStyle, PageBreak, KeepTogether, NextPageTemplate
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


_CJK_FONT_NAMES = []


def _register_cjk_fonts():
    global _CJK_FONT_NAMES
    if _CJK_FONT_NAMES:
        return _CJK_FONT_NAMES

    cjk_candidates = []

    system = platform.system()
    if system == "Windows":
        windir = os.environ.get("WINDIR", r"C:\Windows")
        font_dir = os.path.join(windir, "Fonts")
        cjk_candidates = [
            ("MSYH", os.path.join(font_dir, "msyh.ttc")),
            ("MSYHBD", os.path.join(font_dir, "msyhbd.ttc")),
            ("SIMSUN", os.path.join(font_dir, "simsun.ttc")),
            ("SIMHEI", os.path.join(font_dir, "simhei.ttf")),
        ]
    elif system == "Darwin":
        font_dirs = ["/System/Library/Fonts", "/Library/Fonts", os.path.expanduser("~/Library/Fonts")]
        for fd in font_dirs:
            cjk_candidates.extend([
                ("PingFang", os.path.join(fd, "PingFang.ttc")),
                ("STHeiti", os.path.join(fd, "STHeiti Medium.ttc")),
                ("HeitiSC", os.path.join(fd, "Heiti SC.ttc")),
                ("SongtiSC", os.path.join(fd, "Songti SC.ttc")),
                ("ArialUnicode", os.path.join(fd, "Arial Unicode.ttf")),
                ("ArialUnicodeMS", os.path.join(fd, "Arial Unicode MS.ttf")),
            ])
    else:
        font_dirs = ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.fonts")]
        for fd in font_dirs:
            cjk_candidates.extend([
                ("NotoSansCJK", os.path.join(fd, "truetype/noto/NotoSansCJK-Regular.ttc")),
                ("NotoSerifCJK", os.path.join(fd, "truetype/noto/NotoSerifCJK-Regular.ttc")),
                ("WenQuanYi", os.path.join(fd, "truetype/wqy/wqy-microhei.ttc")),
                ("DroidSansFallback", os.path.join(fd, "truetype/droid/DroidSansFallbackFull.ttf")),
            ])

    registered = []
    for name, path in cjk_candidates:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path))
                registered.append(name)
                print(f"[PDF] 注册 CJK 字体成功: {name} ({path})")
            except Exception as e:
                print(f"[PDF] 注册字体失败 {name}: {e}")

    if not registered:
        print("[PDF] 警告: 未找到任何 CJK 字体，中文可能无法正常显示")

    _CJK_FONT_NAMES = registered
    return registered


def _get_font():
    fonts = _register_cjk_fonts()
    return fonts[0] if fonts else "Helvetica"


def _get_bold_font():
    fonts = _register_cjk_fonts()
    if len(fonts) >= 2:
        return fonts[1]
    return fonts[0] if fonts else "Helvetica-Bold"


COLOR_PRIMARY = HexColor("#4F46E5")
COLOR_PRIMARY_LIGHT = HexColor("#EEF2FF")
COLOR_SECONDARY = HexColor("#0F172A")
COLOR_DANGER = HexColor("#DC2626")
COLOR_DANGER_LIGHT = HexColor("#FEE2E2")
COLOR_WARNING = HexColor("#D97706")
COLOR_WARNING_LIGHT = HexColor("#FEF3C7")
COLOR_SUCCESS = HexColor("#059669")
COLOR_SUCCESS_LIGHT = HexColor("#D1FAE5")
COLOR_TEXT = HexColor("#1E293B")
COLOR_MUTED = HexColor("#64748B")
COLOR_BORDER = HexColor("#E2E8F0")
COLOR_BG_ALT = HexColor("#F8FAFC")


def _risk_color(score_pct):
    if score_pct >= 60:
        return COLOR_DANGER
    elif score_pct >= 30:
        return COLOR_WARNING
    return COLOR_SUCCESS


def _risk_bg_color(score_pct):
    if score_pct >= 60:
        return COLOR_DANGER_LIGHT
    elif score_pct >= 30:
        return COLOR_WARNING_LIGHT
    return COLOR_SUCCESS_LIGHT


def _risk_label(score_pct):
    if score_pct >= 60:
        return "高风险"
    elif score_pct >= 30:
        return "中风险"
    return "低风险"


def _truncate(text, max_len):
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."


def _escape_xml(text):
    if text is None:
        return ""
    return (str(text)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))


class NumberedCanvas:
    def __init__(self, canvas, doc):
        self.canvas = canvas
        self.doc = doc

    def on_page(self, canvas, doc):
        canvas.saveState()
        font = _get_font()

        page_num = canvas.getPageNumber()
        page_w, page_h = A4

        canvas.setStrokeColor(COLOR_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(2 * cm, page_h - 1.8 * cm, page_w - 2 * cm, page_h - 1.8 * cm)

        canvas.setFont(font, 9)
        canvas.setFillColor(COLOR_MUTED)
        canvas.drawString(2 * cm, page_h - 1.5 * cm, "PaperWise AI 学术诚信检测报告")

        logo_text = "PAPERWISE"
        bold_font = _get_bold_font()
        canvas.setFont(bold_font, 10)
        canvas.setFillColor(COLOR_PRIMARY)
        canvas.drawRightString(page_w - 2 * cm, page_h - 1.5 * cm, logo_text)

        canvas.setStrokeColor(COLOR_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(2 * cm, 1.8 * cm, page_w - 2 * cm, 1.8 * cm)

        canvas.setFont(font, 8)
        canvas.setFillColor(COLOR_MUTED)
        canvas.drawString(2 * cm, 1.2 * cm, f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        canvas.drawRightString(page_w - 2 * cm, 1.2 * cm, f"第 {page_num} 页")

        canvas.restoreState()


class CoverCanvas:
    def __init__(self, canvas, doc, cover_data=None):
        self.canvas = canvas
        self.doc = doc
        self.cover_data = cover_data or {}

    def on_page(self, canvas, doc):
        page_w, page_h = A4
        font = _get_font()
        bold_font = _get_bold_font()

        canvas.setFillColor(COLOR_SECONDARY)
        canvas.rect(0, page_h * 0.55, page_w, page_h * 0.45, fill=1, stroke=0)

        canvas.setFillColor(COLOR_PRIMARY)
        canvas.rect(0, page_h * 0.53, page_w, page_h * 0.02, fill=1, stroke=0)

        canvas.setFillColor(COLOR_PRIMARY)
        canvas.circle(page_w / 2, page_h * 0.75, 2.5 * cm, fill=1, stroke=0)

        canvas.setFont(bold_font, 48)
        canvas.setFillColor(white)
        canvas.drawCentredString(page_w / 2, page_h * 0.74, "PW")

        canvas.setFont(bold_font, 14)
        canvas.setFillColor(HexColor("#A5B4FC"))
        canvas.drawCentredString(page_w / 2, page_h * 0.62, "ACADEMIC INTEGRITY REPORT")

        canvas.setFont(font, 12)
        canvas.setFillColor(COLOR_MUTED)
        canvas.drawCentredString(page_w / 2, page_h * 0.58, "PaperWise AI · AIGC 检测与人性化改写系统")

        project_name = self.cover_data.get("project_name", "未命名项目")
        canvas.setFont(bold_font, 28)
        canvas.setFillColor(COLOR_TEXT)
        canvas.drawCentredString(page_w / 2, page_h * 0.42, _escape_xml(project_name))

        canvas.setStrokeColor(COLOR_PRIMARY)
        canvas.setLineWidth(2)
        canvas.line(page_w / 2 - 3 * cm, page_h * 0.39, page_w / 2 + 3 * cm, page_h * 0.39)

        detection_time = self.cover_data.get("detection_time", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        canvas.setFont(font, 12)
        canvas.setFillColor(COLOR_MUTED)
        canvas.drawCentredString(page_w / 2, page_h * 0.34, f"检测时间: {detection_time}")

        ai_score = self.cover_data.get("overall_ai_score", 0)
        score_color = _risk_color(ai_score)

        canvas.setFont(bold_font, 16)
        canvas.setFillColor(COLOR_TEXT)
        canvas.drawCentredString(page_w / 2, page_h * 0.28, "总体 AI 生成率")

        canvas.setFont(bold_font, 72)
        canvas.setFillColor(score_color)
        canvas.drawCentredString(page_w / 2, page_h * 0.20, f"{ai_score:.1f}%")

        label = _risk_label(ai_score)
        canvas.setFont(bold_font, 18)
        canvas.drawCentredString(page_w / 2, page_h * 0.14, label)

        canvas.setFont(font, 10)
        canvas.setFillColor(COLOR_MUTED)
        canvas.drawCentredString(page_w / 2, page_h * 0.08, "本报告由 PaperWise AI 自动生成，仅供参考")


def build_styles():
    base_font = _get_font()
    bold_font = _get_bold_font()

    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="CoverTitle",
        fontName=bold_font,
        fontSize=28,
        leading=34,
        alignment=TA_CENTER,
        textColor=COLOR_TEXT,
    ))

    styles.add(ParagraphStyle(
        name="SectionTitle",
        fontName=bold_font,
        fontSize=18,
        leading=24,
        alignment=TA_LEFT,
        textColor=COLOR_SECONDARY,
        spaceBefore=18,
        spaceAfter=12,
        borderPadding=(0, 0, 6, 0),
    ))

    styles.add(ParagraphStyle(
        name="SubSectionTitle",
        fontName=bold_font,
        fontSize=13,
        leading=18,
        alignment=TA_LEFT,
        textColor=COLOR_PRIMARY,
        spaceBefore=14,
        spaceAfter=8,
    ))

    styles.add(ParagraphStyle(
        name="BodyTextCN",
        fontName=base_font,
        fontSize=10,
        leading=17,
        alignment=TA_JUSTIFY,
        textColor=COLOR_TEXT,
    ))

    styles.add(ParagraphStyle(
        name="BodyTextSmall",
        fontName=base_font,
        fontSize=9,
        leading=15,
        alignment=TA_LEFT,
        textColor=COLOR_MUTED,
    ))

    styles.add(ParagraphStyle(
        name="RiskBadge",
        fontName=bold_font,
        fontSize=9,
        leading=12,
        alignment=TA_CENTER,
    ))

    styles.add(ParagraphStyle(
        name="CompareHeader",
        fontName=bold_font,
        fontSize=11,
        leading=15,
        alignment=TA_CENTER,
        textColor=COLOR_PRIMARY,
    ))

    return styles


def _make_cover_page(cover_data, styles):
    flowables = []
    flowables.append(NextPageTemplate("Normal"))
    flowables.append(PageBreak())
    return flowables


def _make_overview_section(report_data, styles):
    flowables = []

    flowables.append(Paragraph("一、检测概览", styles["SectionTitle"]))

    overall_score = report_data.get("overall_ai_score", 0)
    details = report_data.get("details", [])
    total_chars = sum(len(d.get("text", "")) for d in details)

    risk_counts = {"high": 0, "medium": 0, "low": 0}
    for d in details:
        score_pct = d.get("ai_score", 0)
        if isinstance(score_pct, float) and score_pct <= 1:
            score_pct = score_pct * 100
        if score_pct >= 60:
            risk_counts["high"] += 1
        elif score_pct >= 30:
            risk_counts["medium"] += 1
        else:
            risk_counts["low"] += 1

    font = _get_font()
    header_style = ParagraphStyle("header_cell", fontName=font, fontSize=9, leading=13, textColor=COLOR_MUTED, alignment=TA_LEFT)
    value_style = ParagraphStyle("value_cell", fontName=font, fontSize=14, leading=20, textColor=COLOR_TEXT, alignment=TA_LEFT)
    value_style_bold = ParagraphStyle("value_cell_bold", fontName=_get_bold_font(), fontSize=16, leading=20, textColor=_risk_color(overall_score), alignment=TA_LEFT)

    overview_data = [
        [
            Paragraph("检测时间", header_style),
            Paragraph("段落总数", header_style),
            Paragraph("总字符数", header_style),
            Paragraph("总体 AI 率", header_style),
        ],
        [
            Paragraph(report_data.get("detection_time", "-"), value_style),
            Paragraph(str(len(details)), value_style),
            Paragraph(f"{total_chars:,}", value_style),
            Paragraph(f"{overall_score:.1f}%", value_style_bold),
        ],
        [
            Paragraph("高风险段落", header_style),
            Paragraph("中风险段落", header_style),
            Paragraph("低风险段落", header_style),
            Paragraph("风险等级", header_style),
        ],
        [
            Paragraph(f"<font color='#DC2626'>{risk_counts['high']}</font>", value_style),
            Paragraph(f"<font color='#D97706'>{risk_counts['medium']}</font>", value_style),
            Paragraph(f"<font color='#059669'>{risk_counts['low']}</font>", value_style),
            Paragraph(
                f"<font color='{_risk_color(overall_score).hexval()}'>{_risk_label(overall_score)}</font>",
                value_style
            ),
        ],
    ]

    t = Table(overview_data, colWidths=[4.2 * cm] * 4)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_PRIMARY_LIGHT),
        ("BACKGROUND", (0, 2), (-1, 2), COLOR_BG_ALT),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 1), (-1, 1), 1.5, COLOR_PRIMARY),
    ]))
    flowables.append(t)
    flowables.append(Spacer(1, 12))

    return flowables


def _make_details_section(report_data, styles):
    flowables = []

    flowables.append(Paragraph("二、逐段检测详情", styles["SectionTitle"]))

    details = report_data.get("details", [])
    if not details:
        flowables.append(Paragraph("暂无检测详情。", styles["BodyTextCN"]))
        return flowables

    base_font = _get_font()
    bold_font = _get_bold_font()

    idx_style = ParagraphStyle("idx", fontName=bold_font, fontSize=9, leading=13, textColor=COLOR_PRIMARY, alignment=TA_CENTER)
    text_style = ParagraphStyle("text_cell", fontName=base_font, fontSize=9, leading=14, textColor=COLOR_TEXT, alignment=TA_LEFT)
    text_style_danger = ParagraphStyle("text_cell_danger", fontName=bold_font, fontSize=9, leading=14, textColor=COLOR_DANGER, alignment=TA_LEFT)
    score_style = ParagraphStyle("score_cell", fontName=bold_font, fontSize=10, leading=14, alignment=TA_CENTER)
    badge_style = ParagraphStyle("badge", fontName=bold_font, fontSize=8, leading=11, alignment=TA_CENTER)

    for i, d in enumerate(details):
        text = _escape_xml(d.get("text", ""))
        score_pct = d.get("ai_score", 0)
        if isinstance(score_pct, float) and score_pct <= 1:
            score_pct = score_pct * 100

        is_high_risk = score_pct >= 60
        row_bg = COLOR_DANGER_LIGHT if is_high_risk else (COLOR_BG_ALT if i % 2 == 0 else white)
        score_color = _risk_color(score_pct)
        badge_bg = _risk_bg_color(score_pct)

        display_text = text if len(text) <= 300 else text[:300] + "..."
        text_s = text_style_danger if is_high_risk else text_style

        row_data = [
            [
                Paragraph(f"#{i + 1}", idx_style),
                Paragraph(display_text, text_s),
                Paragraph(f"<font color='{score_color.hexval()}'>{score_pct:.1f}%</font>", score_style),
                Paragraph(
                    f"<font color='{score_color.hexval()}'>{_risk_label(score_pct)}</font>",
                    badge_style
                ),
            ]
        ]

        t = Table(row_data, colWidths=[1 * cm, 10.6 * cm, 2 * cm, 1.8 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), row_bg),
            ("GRID", (0, 0), (-1, -1), 0.4, COLOR_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("BACKGROUND", (2, 0), (3, 0), badge_bg),
        ]))
        flowables.append(t)
        flowables.append(Spacer(1, 4))

    return flowables


def _make_comparison_section(report_data, styles):
    flowables = []

    flowables.append(Paragraph("三、改写前后对比", styles["SectionTitle"]))

    original_text = report_data.get("original_text", "")
    rewritten_text = report_data.get("rewritten_text", "")

    if not original_text or not rewritten_text:
        flowables.append(Paragraph("本次检测未进行改写操作，无对比内容。", styles["BodyTextCN"]))
        return flowables

    base_font = _get_font()
    bold_font = _get_bold_font()

    header_style = ParagraphStyle("cmp_hdr", fontName=bold_font, fontSize=11, leading=15, alignment=TA_CENTER)
    content_style = ParagraphStyle("cmp_txt", fontName=base_font, fontSize=9, leading=15, alignment=TA_JUSTIFY, textColor=COLOR_TEXT)

    header_data = [[
        Paragraph("改写前（原文）", ParagraphStyle("hdr_left", parent=header_style, textColor=COLOR_MUTED)),
        Paragraph("改写后", ParagraphStyle("hdr_right", parent=header_style, textColor=COLOR_PRIMARY)),
    ]]
    header_t = Table(header_data, colWidths=[7.7 * cm, 7.7 * cm])
    header_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_BG_ALT),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    flowables.append(header_t)

    paragraphs_orig = [p.strip() for p in original_text.split("\n\n") if p.strip()]
    paragraphs_new = [p.strip() for p in rewritten_text.split("\n\n") if p.strip()]
    max_paras = max(len(paragraphs_orig), len(paragraphs_new))

    for i in range(max_paras):
        orig_p = paragraphs_orig[i] if i < len(paragraphs_orig) else ""
        new_p = paragraphs_new[i] if i < len(paragraphs_new) else ""

        row_bg = COLOR_BG_ALT if i % 2 == 0 else white

        row_data = [[
            Paragraph(f"<font color='#94A3B8' size='8'>段落 {i + 1}</font><br/>{_escape_xml(orig_p)}", content_style),
            Paragraph(f"<font color='#4F46E5' size='8'>段落 {i + 1}</font><br/>{_escape_xml(new_p)}", content_style),
        ]]
        t = Table(row_data, colWidths=[7.7 * cm, 7.7 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), row_bg),
            ("GRID", (0, 0), (-1, -1), 0.4, COLOR_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#FEFEFE")),
            ("LINEAFTER", (0, 0), (0, -1), 1, COLOR_PRIMARY_LIGHT),
        ]))
        flowables.append(t)
        flowables.append(Spacer(1, 3))

    return flowables


def _make_summary_section(report_data, styles):
    flowables = []

    flowables.append(Paragraph("四、检测参数摘要", styles["SectionTitle"]))

    base_font = _get_font()
    bold_font = _get_bold_font()

    label_style = ParagraphStyle("lbl", fontName=base_font, fontSize=10, leading=16, textColor=COLOR_MUTED)
    val_style = ParagraphStyle("val", fontName=bold_font, fontSize=10, leading=16, textColor=COLOR_TEXT)

    rewrite_level_map = {"low": "轻微改写", "medium": "中度改写", "high": "深度改写"}

    params = [
        ("检测模型", report_data.get("detection_model", "distilbert-base-uncased")),
        ("改写模型", report_data.get("rewrite_model", "llama-3.3-70b-versatile")),
        ("改写级别", rewrite_level_map.get(report_data.get("rewrite_level", "medium"), "中度改写")),
        ("迭代次数", str(report_data.get("iterations", 1)) + " 轮"),
        ("Bootstrap 采样", str(report_data.get("bootstrap_samples", 5)) + " 次"),
        ("模型状态", "降级模式 (模拟数据)" if report_data.get("degraded", False) else "正常运行"),
    ]

    table_data = []
    for i in range(0, len(params), 2):
        row = []
        for j in range(2):
            idx = i + j
            if idx < len(params):
                label, value = params[idx]
                row.append(Paragraph(f"<b>{label}</b><br/><font color='#1E293B'>{_escape_xml(value)}</font>", label_style))
            else:
                row.append("")
        table_data.append(row)

    t = Table(table_data, colWidths=[7.7 * cm, 7.7 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_PRIMARY_LIGHT),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("BACKGROUND", (0, 1), (-1, 1), white),
        ("BACKGROUND", (0, 3), (-1, 3), white),
    ]))
    flowables.append(t)

    flowables.append(Spacer(1, 20))

    disclaimer_style = ParagraphStyle("disc", fontName=base_font, fontSize=9, leading=15, alignment=TA_CENTER, textColor=COLOR_MUTED)
    flowables.append(Paragraph("——— 报告结束 ———", ParagraphStyle("end", fontName=bold_font, fontSize=11, leading=16, alignment=TA_CENTER, textColor=COLOR_PRIMARY)))
    flowables.append(Spacer(1, 10))
    flowables.append(Paragraph(
        "免责声明：本报告由 PaperWise AI 基于统计模型自动生成，检测结果仅供学术诚信参考，不作为任何法律或学术处分的唯一依据。",
        disclaimer_style
    ))

    return flowables


def generate_pdf_report(report_data: dict) -> bytes:
    """
    生成完整的 PDF 检测报告。

    report_data 结构:
    {
        "project_name": str,
        "detection_time": str,
        "overall_ai_score": float (百分比, e.g. 45.2),
        "details": [{"text": str, "ai_score": float (0~1 或 百分比), ...}],
        "original_text": str,
        "rewritten_text": str,
        "detection_model": str,
        "rewrite_model": str,
        "rewrite_level": "low" | "medium" | "high",
        "iterations": int,
        "bootstrap_samples": int,
        "degraded": bool,
    }
    """
    _register_cjk_fonts()
    styles = build_styles()

    buffer = io.BytesIO()

    page_w, page_h = A4
    left_margin = 2 * cm
    right_margin = 2 * cm
    top_margin = 2.3 * cm
    bottom_margin = 2.3 * cm

    cover_frame = Frame(
        left_margin, bottom_margin,
        page_w - left_margin - right_margin,
        page_h - top_margin - bottom_margin,
        id="cover"
    )

    normal_frame = Frame(
        left_margin, bottom_margin,
        page_w - left_margin - right_margin,
        page_h - top_margin - bottom_margin,
        id="normal"
    )

    def _cover_on_page(canvas, doc):
        cv = CoverCanvas(canvas, doc, report_data)
        cv.on_page(canvas, doc)

    def _normal_on_page(canvas, doc):
        nc = NumberedCanvas(canvas, doc)
        nc.on_page(canvas, doc)

    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=left_margin,
        rightMargin=right_margin,
        topMargin=top_margin,
        bottomMargin=bottom_margin,
        title="PaperWise AI 检测报告",
        author="PaperWise AI",
        subject="AIGC 学术诚信检测报告",
    )

    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=_cover_on_page),
        PageTemplate(id="Normal", frames=[normal_frame], onPage=_normal_on_page),
    ])

    flowables = []

    flowables.append(NextPageTemplate("Normal"))
    flowables.append(PageBreak())

    flowables.extend(_make_overview_section(report_data, styles))
    flowables.extend(_make_details_section(report_data, styles))
    flowables.extend(_make_comparison_section(report_data, styles))
    flowables.extend(_make_summary_section(report_data, styles))

    doc.build(flowables)

    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
