import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronDown, FileText, AlertTriangle,
  Sparkles, Loader2, Bookmark, Check
} from 'lucide-react';

const STANDARD_SECTION_META = {
  abstract: { label: '摘要', icon: '📋', color: 'text-blue-400' },
  introduction: { label: '引言', icon: '📖', color: 'text-emerald-400' },
  background: { label: '背景/相关工作', icon: '🔬', color: 'text-teal-400' },
  methods: { label: '方法', icon: '⚙️', color: 'text-amber-400' },
  results: { label: '结果', icon: '📊', color: 'text-purple-400' },
  discussion: { label: '讨论', icon: '💬', color: 'text-pink-400' },
  conclusion: { label: '结论', icon: '🏁', color: 'text-cyan-400' },
  acknowledgments: { label: '致谢', icon: '🙏', color: 'text-indigo-400' },
  references: { label: '参考文献', icon: '📚', color: 'text-slate-400' },
  appendix: { label: '附录', icon: '📎', color: 'text-slate-400' },
};

function getScoreColor(score) {
  if (score === undefined || score === null) return { bg: 'bg-slate-600', text: 'text-slate-400', bar: 'bg-slate-500' };
  if (score > 60) return { bg: 'bg-red-500/20', text: 'text-red-400', bar: 'bg-red-500' };
  if (score > 20) return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', bar: 'bg-yellow-500' };
  return { bg: 'bg-green-500/20', text: 'text-green-400', bar: 'bg-green-500' };
}

function SectionNode({
  section, depth, isExpanded, onToggle,
  onSelect, isSelected, onRewrite,
  isRewriting, isHighlighted, showOriginal,
  onToggleOriginal
}) {
  const meta = section.standard_type ? STANDARD_SECTION_META[section.standard_type] : null;
  const scoreColors = getScoreColor(section.ai_score);
  const hasChildren = section._children && section._children.length > 0;

  return (
    <div>
      <motion.div
        layout
        onClick={() => onSelect && onSelect(section)}
        className={`
          group relative flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer
          transition-all border
          ${isSelected
            ? 'bg-indigo-500/15 border-indigo-500/40 shadow-lg shadow-indigo-500/10'
            : isHighlighted
              ? 'bg-cyan-500/10 border-cyan-500/30'
              : 'bg-transparent border-transparent hover:bg-slate-800/60 hover:border-slate-700'
          }
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle && onToggle(section.id); }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex-shrink-0"
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <div className="w-5 h-5 flex-shrink-0" />
        )}

        <span className="text-base flex-shrink-0">
          {meta ? meta.icon : section.level <= 1 ? '📄' : '•'}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium truncate ${meta ? meta.color : 'text-slate-200'}`}>
              {section.title}
            </span>
            {section.degraded && (
              <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden max-w-[120px]">
              <div
                className={`h-full transition-all duration-500 ${scoreColors.bar}`}
                style={{ width: `${section.ai_score ?? 0}%` }}
              />
            </div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${scoreColors.bg} ${scoreColors.text} flex-shrink-0`}>
              {section.ai_score !== undefined && section.ai_score !== null
                ? `${section.ai_score}%`
                : 'N/A'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRewrite && (
            <button
              onClick={(e) => { e.stopPropagation(); onRewrite && onRewrite(section); }}
              disabled={isRewriting}
              className="p-1.5 rounded-md bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30 transition-colors disabled:opacity-50"
              title="改写此章节"
            >
              {isRewriting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {isSelected && (
          <motion.div
            layoutId="section-indicator"
            className="absolute left-0 top-1 bottom-1 w-0.5 bg-indigo-500 rounded-r-full"
          />
        )}
      </motion.div>

      <AnimatePresence>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {section._children.map((child) => (
              <SectionNode
                key={child.id}
                section={child}
                depth={depth + 1}
                isExpanded={isExpanded}
                onToggle={onToggle}
                onSelect={onSelect}
                isSelected={isSelected}
                onRewrite={onRewrite}
                isRewriting={isRewriting}
                isHighlighted={isHighlighted}
                showOriginal={showOriginal}
                onToggleOriginal={onToggleOriginal}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PaperStructureTree({
  structure,
  selectedSectionId,
  onSelectSection,
  onRewriteSection,
  rewritingSectionId,
  formatType,
  fallbackUsed
}) {
  const [expandedIds, setExpandedIds] = useState({});

  const hierarchicalSections = useMemo(() => {
    if (!structure?.sections) return [];
    const sections = structure.sections.map(s => ({ ...s, _children: [] }));
    const root = [];
    const stack = [];

    for (const s of sections) {
      while (stack.length && stack[stack.length - 1].level >= s.level) {
        stack.pop();
      }
      if (stack.length) {
        stack[stack.length - 1]._children.push(s);
      } else {
        root.push(s);
      }
      stack.push(s);
    }
    return root;
  }, [structure]);

  const toggleExpand = (id) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatMeta = {
    standard: { label: '标准论文', color: 'text-emerald-400', icon: '📄' },
    short_note: { label: '短文/笔记', color: 'text-amber-400', icon: '📝' },
    letter: { label: '信件/通讯', color: 'text-blue-400', icon: '✉️' },
  };

  const fmt = formatMeta[formatType] || formatMeta.standard;

  const riskSummary = useMemo(() => {
    if (!structure?.sections) return null;
    const sections = structure.sections;
    const highRisk = sections.filter(s => s.ai_score !== undefined && s.ai_score > 60).length;
    const mediumRisk = sections.filter(s => s.ai_score !== undefined && s.ai_score > 20 && s.ai_score <= 60).length;
    const lowRisk = sections.filter(s => s.ai_score !== undefined && s.ai_score <= 20).length;
    return { highRisk, mediumRisk, lowRisk, total: sections.length };
  }, [structure]);

  if (!structure || !structure.sections?.length) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
        <div className="text-center py-8">
          <FileText className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-500">暂无结构分析数据</p>
          <p className="text-xs text-slate-600 mt-1">请先执行检测以查看论文结构</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">论文结构</h3>
          </div>
          <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 ${fmt.color}`}>
            <span>{fmt.icon}</span>
            <span>{fmt.label}</span>
          </div>
        </div>

        {riskSummary && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="text-center p-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="text-lg font-black text-red-400">{riskSummary.highRisk}</div>
              <div className="text-[9px] text-red-400/70 uppercase font-bold">高风险</div>
            </div>
            <div className="text-center p-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="text-lg font-black text-yellow-400">{riskSummary.mediumRisk}</div>
              <div className="text-[9px] text-yellow-400/70 uppercase font-bold">中风险</div>
            </div>
            <div className="text-center p-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="text-lg font-black text-green-400">{riskSummary.lowRisk}</div>
              <div className="text-[9px] text-green-400/70 uppercase font-bold">低风险</div>
            </div>
          </div>
        )}

        {fallbackUsed && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px]">
            <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <span className="text-amber-400/80">未检测到标准章节结构，已按内容块自动划分</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 max-h-[600px]">
        {hierarchicalSections.map((section) => (
          <SectionNode
            key={section.id}
            section={section}
            depth={0}
            isExpanded={expandedIds[section.id] !== false}
            onToggle={toggleExpand}
            onSelect={onSelectSection}
            isSelected={selectedSectionId === section.id}
            onRewrite={onRewriteSection}
            isRewriting={rewritingSectionId === section.id}
          />
        ))}
      </div>

      <div className="px-3 py-2 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <span>共 {structure.section_count} 个章节</span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>高
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>中
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>低
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
