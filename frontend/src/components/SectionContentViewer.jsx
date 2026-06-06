import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles, RefreshCcw, Eye, EyeOff,
  AlertTriangle, ShieldCheck, FileText
} from 'lucide-react';

function getScoreBadge(score, degraded) {
  if (degraded) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-500 border border-slate-600/40 flex items-center gap-1">
        <AlertTriangle className="w-2.5 h-2.5" />
        模型降级 · {score}%
      </span>
    );
  }
  if (score === undefined || score === null) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-500 border border-slate-600/40">
        未检测
      </span>
    );
  }
  if (score > 60) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
        <AlertTriangle className="w-2.5 h-2.5" />
        高风险 · {score}%
      </span>
    );
  }
  if (score > 20) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 flex items-center gap-1">
        <ShieldCheck className="w-2.5 h-2.5" />
        中风险 · {score}%
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30 flex items-center gap-1">
      <ShieldCheck className="w-2.5 h-2.5" />
      低风险 · {score}%
    </span>
  );
}

export default function SectionContentViewer({
  section,
  showOriginal,
  onToggleOriginal,
  onRewrite,
  isRewriting,
  rewriteLevel,
  hasOriginal
}) {
  const contentRef = useRef(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [section?.id]);

  if (!section) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 h-full flex flex-col items-center justify-center min-h-[400px]">
        <FileText className="w-12 h-12 text-slate-700 mb-4" />
        <p className="text-sm text-slate-500 text-center">从左侧目录选择一个章节</p>
        <p className="text-xs text-slate-600 mt-2 text-center">
          点击左侧结构树中的任意章节查看详情
        </p>
      </div>
    );
  }

  const displayContent = showOriginal && section.original_content
    ? section.original_content
    : section.content;

  const isRewritten = !!section.original_content;

  return (
    <motion.div
      key={section.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden h-full flex flex-col min-h-[400px]"
    >
      <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="text-lg font-bold text-white truncate">
                {section.title}
              </h3>
              {getScoreBadge(section.ai_score, section.degraded)}
              {isRewritten && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  已改写
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              <span>字数: {section.content.length}</span>
              <span>•</span>
              <span>位置: [{section.start_index}, {section.end_index}]</span>
              {section.standard_type && (
                <>
                  <span>•</span>
                  <span className="text-indigo-400">标准章节: {section.standard_type}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hasOriginal && isRewritten && (
              <button
                onClick={onToggleOriginal}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                  showOriginal
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                {showOriginal ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {showOriginal ? '显示改写后' : '查看原文'}
              </button>
            )}
            <button
              onClick={onRewrite}
              disabled={isRewriting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-lg shadow-indigo-500/20 transition-colors"
            >
              {isRewriting ? (
                <>
                  <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                  改写中...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  改写此章节
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto p-5"
      >
        <div className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
          {displayContent || (
            <span className="text-slate-600 italic">此章节暂无内容</span>
          )}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-3 text-slate-500">
          <span>当前改写级别:</span>
          <span className="font-bold text-indigo-400">
            {rewriteLevel === 'low' ? '轻微' : rewriteLevel === 'medium' ? '中度' : '深度'}
          </span>
        </div>
        <div className="text-slate-600">
          {showOriginal && isRewritten ? '当前显示: 原文' : isRewritten ? '当前显示: 改写后' : '当前显示: 原始内容'}
        </div>
      </div>
    </motion.div>
  );
}
