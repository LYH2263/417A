import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Upload, ShieldCheck, Zap, FileText, ChevronRight, Sparkles, RefreshCcw, CheckCircle, Download, FileDown, Layers, GitCompare, ArrowLeftRight, Clock, Circle, History, Eye, Gauge, AlertTriangle, Split, Info, Target, Timer, Scale, Lock, Unlock, GripVertical, Undo2, ListChecks, Shuffle, CheckSquare, Square, BookOpen, StopCircle, WifiOff, HelpCircle, ScrollText, BarChart3, Library, X } from 'lucide-react';
import HistoryDashboard from './components/HistoryDashboard';
import TerminologyDictionary from './components/TerminologyDictionary';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { computeWordDiff } from './utils/diff';
import { buildParagraphsFromText, applyRecommendations } from './utils/paragraphUtils';
import SelectiveParagraphCard from './components/SelectiveParagraphCard';
import ResultParagraphCard from './components/ResultParagraphCard';
import VirtualList from './components/VirtualList';
import PaperStructureTree from './components/PaperStructureTree';
import SectionContentViewer from './components/SectionContentViewer';
import { createSSEClient } from './utils/sseClient';
import TourGuide from './components/TourGuide';
import ChangelogModal from './components/ChangelogModal';
import changelogData from './data/changelog.json';
import { useHealthCheck } from './hooks/useHealthCheck';
import { SystemStatusIndicator } from './components/SystemStatusIndicator';
import { ToastContainer } from './components/Toast';
import { renderTextWithTerminologyHighlight } from './utils/terminologyHighlight';

const API_BASE = "http://localhost:8417/api";

const CREDIBILITY_STD_THRESHOLD = {
  high: 0.05,
  medium: 0.12
};

const credibilityMeta = {
  high:   { label: '高可信度', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  medium: { label: '中可信度', color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30',  dot: 'bg-yellow-400'  },
  low:    { label: '低可信度', color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     dot: 'bg-red-400'     }
};

const VIRTUAL_LIST_THRESHOLD = 20;
const PARAGRAPH_CARD_HEIGHT = 160;
const VIRTUAL_OVERSCAN = 5;

function TerminologyProtectionStatus({ analysis, source, onRevertModified }) {
  const [showDetails, setShowDetails] = useState(false);
  if (!analysis) return null;
  const preservedCount = (analysis.preserved || []).length;
  const modifiedCount = (analysis.modified || []).length;
  const totalTerms = (analysis.protected_terms || []).length;

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
        analysis.has_modified_terms
          ? 'bg-red-500/10 border-red-500/30'
          : preservedCount > 0
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-slate-800 border-slate-700'
      }`}>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-2 text-xs font-bold"
        >
          {analysis.has_modified_terms ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          ) : preservedCount > 0 ? (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Info className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span className={analysis.has_modified_terms ? 'text-red-400' : preservedCount > 0 ? 'text-emerald-400' : 'text-slate-400'}>
            {analysis.has_modified_terms
              ? `${modifiedCount} 个术语被修改`
              : preservedCount > 0
              ? `${preservedCount}/${totalTerms} 术语已保护`
              : '无受保护术语'}
          </span>
        </button>
      </div>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 top-full mt-2 z-50 w-80 bg-slate-950 border border-slate-700 rounded-xl p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-white">术语保护状态</h4>
              <button
                onClick={() => setShowDetails(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(analysis.preserved || []).length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-400">已保护术语 ({preservedCount})</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {analysis.preserved.slice(0, 20).map((t, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      title={t.category}
                    >
                      {t.term}
                    </span>
                  ))}
                  {analysis.preserved.length > 20 && (
                    <span className="text-[10px] text-slate-500">+{analysis.preserved.length - 20} 更多</span>
                  )}
                </div>
              </div>
            )}

            {(analysis.modified || []).length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs font-bold text-red-400">被修改术语 ({modifiedCount})</span>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {analysis.modified.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/20"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-red-300 truncate">{t.term}</div>
                        <div className="text-[10px] text-slate-500">
                          {t.category} · 原文 {t.original_count} 次 → 改写 {t.rewritten_count} 次
                        </div>
                      </div>
                      <button
                        onClick={() => onRevertModified && onRevertModified(t, source)}
                        className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-md bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors flex items-center gap-1"
                        title="一键回退该术语"
                      >
                        <Undo2 className="w-3 h-3" />
                        回退
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(analysis.preserved || []).length === 0 && (analysis.modified || []).length === 0 && (
              <div className="text-center py-4">
                <Info className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="text-xs text-slate-500">本次改写未检测到受保护术语</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DiffView({ oldText, newText }) {
  const diff = useMemo(() => computeWordDiff(oldText, newText), [oldText, newText]);

  return (
    <div className="text-sm leading-relaxed text-white whitespace-pre-wrap break-words">
      {diff.map((op, idx) => {
        if (op.type === 'equal') {
          return <span key={idx} className="text-slate-300">{op.value}</span>;
        }
        if (op.type === 'insert') {
          return (
            <span key={idx} className="bg-green-500/20 text-green-400 border-b-2 border-green-500 rounded px-0.5">
              {op.value}
            </span>
          );
        }
        if (op.type === 'delete') {
          return (
            <span key={idx} className="bg-red-500/20 text-red-400 line-through border-b-2 border-red-500 rounded px-0.5">
              {op.value}
            </span>
          );
        }
        if (op.type === 'replace') {
          return (
            <span key={idx}>
              <span className="bg-red-500/20 text-red-400 line-through border-b-2 border-red-500 rounded px-0.5">
                {op.oldValue}
              </span>
              <span className="bg-yellow-500/20 text-yellow-300 border-b-2 border-yellow-500 rounded px-0.5 mx-0.5">
                {op.newValue}
              </span>
            </span>
          );
        }
        return null;
      })}
    </div>
  );
}

function TimelineSelector({ history, selectedA, selectedB, onSelectA, onSelectB, viewMode, onChangeViewMode }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-400" />
          <h4 className="text-sm font-bold text-white">改写历史栈</h4>
        </div>
        <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => onChangeViewMode('single')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
              viewMode === 'single'
                ? 'bg-indigo-600 text-white shadow shadow-indigo-500/20'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Eye className="w-3 h-3" /> 单版本
          </button>
          <button
            onClick={() => onChangeViewMode('diff')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
              viewMode === 'diff'
                ? 'bg-indigo-600 text-white shadow shadow-indigo-500/20'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <GitCompare className="w-3 h-3" /> Diff 对比
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-[22px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-indigo-500 via-purple-500 to-cyan-500/50"></div>

        <div className="space-y-2">
          {history.map((item, idx) => {
            const isA = selectedA === item.version;
            const isB = selectedB === item.version;
            const isSelected = viewMode === 'single' ? isA : (isA || isB);

            return (
              <div
                key={item.version}
                className="relative flex items-start gap-4 cursor-pointer group"
                onClick={() => {
                  if (viewMode === 'single') {
                    onSelectA(item.version);
                  } else {
                    if (!isA && !isB) {
                      if (!isA) onSelectA(item.version);
                      else onSelectB(item.version);
                    } else if (isA) {
                      onSelectA(item.version);
                    } else if (isB) {
                      onSelectB(item.version);
                    }
                  }
                }}
              >
                <div className="relative z-10 flex-shrink-0">
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-400 shadow-lg shadow-indigo-500/30 scale-110'
                        : 'bg-slate-900 border-slate-700 group-hover:border-slate-600'
                    }`}
                  >
                    {item.version === 0 ? (
                      <FileText className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                    ) : (
                      <Sparkles className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                    )}
                  </div>
                  {viewMode === 'diff' && isA && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-cyan-500 rounded-full border-2 border-slate-900 flex items-center justify-center text-[8px] font-black text-white">
                      A
                    </div>
                  )}
                  {viewMode === 'diff' && isB && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-purple-500 rounded-full border-2 border-slate-900 flex items-center justify-center text-[8px] font-black text-white">
                      B
                    </div>
                  )}
                </div>

                <div className={`flex-1 rounded-xl p-3 border transition-all ${
                  isSelected
                    ? 'bg-indigo-500/10 border-indigo-500/40'
                    : 'bg-slate-950/50 border-slate-800 group-hover:border-slate-700'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                      {item.label}
                    </span>
                    {item.detection && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        item.detection.overall_ai_score > 50
                          ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                          : item.detection.overall_ai_score > 20
                          ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                          : 'bg-green-500/15 text-green-400 border border-green-500/30'
                      }`}>
                        AI率 {item.detection.overall_ai_score}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {item.text.substring(0, 120)}{item.text.length > 120 ? '...' : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {viewMode === 'diff' && (
        <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
              <span className="text-xs text-slate-400">版本 A (基准)</span>
            </div>
            <ArrowLeftRight className="w-3 h-3 text-slate-600" />
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-purple-500"></div>
              <span className="text-xs text-slate-400">版本 B (对比)</span>
            </div>
          </div>
          {selectedA !== selectedB && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500"></span>新增</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500"></span>删除</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-yellow-500"></span>替换</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorBar({ mean, ciLower, ciUpper, std, disabled }) {
  const pct = (v) => Math.max(0, Math.min(100, v * 100));
  const meanPct = pct(mean);
  const ciLowPct = pct(ciLower);
  const ciHighPct = pct(ciUpper);

  const barColor = disabled
    ? 'bg-slate-600'
    : mean > 0.5 ? 'bg-red-500' : 'bg-emerald-500';
  const ciColor = disabled ? 'bg-slate-500' : 'bg-indigo-400/60';
  const endCapColor = disabled ? 'bg-slate-500' : 'bg-indigo-400';

  return (
    <div className={`w-full h-8 flex items-center relative ${disabled ? 'opacity-40' : ''}`}>
      <div className="absolute inset-x-0 h-1 bg-slate-800 rounded-full top-1/2 -translate-y-1/2">
        <div
          className="absolute h-full bg-slate-700/50 rounded-full"
          style={{ left: `${ciLowPct}%`, width: `${ciHighPct - ciLowPct}%` }}
        />
        <div
          className={`absolute h-full ${ciColor} rounded-full`}
          style={{ left: `${ciLowPct}%`, width: `${ciHighPct - ciLowPct}%`, opacity: disabled ? 0.5 : 0.7 }}
        />
        <div
          className={`absolute -top-1.5 h-4 w-0.5 ${endCapColor}`}
          style={{ left: `${ciLowPct}%` }}
        />
        <div
          className={`absolute -top-1.5 h-4 w-0.5 ${endCapColor}`}
          style={{ left: `${ciHighPct}%` }}
        />
        <div
          className={`absolute -top-2 h-5 w-1.5 rounded-full ${barColor} shadow-lg ring-2 ring-slate-950 z-10`}
          style={{ left: `calc(${meanPct}% - 3px)` }}
        />
      </div>
      <span className="absolute left-0 top-0 text-[9px] text-slate-600 font-bold">0%</span>
      <span className="absolute left-1/2 -translate-x-1/2 top-0 text-[9px] text-slate-600 font-bold">50%</span>
      <span className="absolute right-0 top-0 text-[9px] text-slate-600 font-bold">100%</span>
    </div>
  );
}

function ParagraphCard({ chunk, idx, disabled, onSplitRedetect }) {
  const [hovered, setHovered] = useState(false);
  const scorePct = Math.round(chunk.ai_score * 100);
  const hasStats = chunk.mean !== undefined && chunk.std !== undefined;
  const credibility = chunk.credibility || (hasStats
    ? (chunk.std <= CREDIBILITY_STD_THRESHOLD.high ? 'high'
      : chunk.std <= CREDIBILITY_STD_THRESHOLD.medium ? 'medium' : 'low')
    : null);
  const isUncertain = credibility === 'low' && !disabled;
  const meta = credibility ? credibilityMeta[credibility] : null;

  return (
    <motion.div
      layout
      className={`p-4 rounded-2xl transition-all relative border ${
        isUncertain
          ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50'
          : disabled
          ? 'bg-slate-900/30 border-slate-800/50 opacity-60'
          : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">段落 {idx + 1}</span>
          {meta && !disabled && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${meta.bg} ${meta.color} ${meta.border} border`}>
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}></span>
              {meta.label}
            </span>
          )}
          {disabled && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-700/40 text-slate-500 border border-slate-600/40 flex items-center gap-1">
              <Info className="w-2.5 h-2.5" /> 模型降级中
            </span>
          )}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          disabled ? 'bg-slate-700/40 text-slate-500' :
          chunk.ai_score > 0.5 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'
        }`}>
          {scorePct}%
        </span>
      </div>

      <p className={`text-xs leading-relaxed mb-3 ${disabled ? 'text-slate-500' : 'text-slate-400'}`}>
        {chunk.text}
      </p>

      {hasStats && (
        <div
          className="relative"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <ErrorBar
            mean={chunk.mean}
            ciLower={chunk.ci_lower}
            ciUpper={chunk.ci_upper}
            std={chunk.std}
            disabled={disabled}
          />
          <AnimatePresence>
            {hovered && !disabled && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-50 pointer-events-none"
              >
                <div className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 shadow-2xl whitespace-nowrap text-xs">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-slate-500 text-[10px] block">均值</span>
                      <span className="text-white font-bold">{(chunk.mean * 100).toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">±标准差</span>
                      <span className="text-indigo-400 font-bold">±{(chunk.std * 100).toFixed(2)}%</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">95% CI</span>
                      <span className="text-emerald-400 font-bold">
                        [{(chunk.ci_lower * 100).toFixed(1)}%, {(chunk.ci_upper * 100).toFixed(1)}%]
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">采样次数</span>
                      <span className="text-slate-300 font-bold">{chunk.sample_count}次</span>
                    </div>
                  </div>
                </div>
                <div className="w-2 h-2 bg-slate-950 border-r border-b border-slate-700 rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1"></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {isUncertain && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-3 pt-3 border-t border-amber-500/20"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[11px] text-amber-300 font-medium mb-2">
                结果不确定，建议拆分后重新检测
              </p>
              <button
                onClick={() => onSplitRedetect && onSplitRedetect(idx, chunk)}
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
              >
                <Split className="w-3 h-3" />
                一键拆分重检
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function OverallCredibility({ result, disabled }) {
  if (!result) return null;
  const credibility = result.overall_credibility || (
    result.overall_std !== undefined
      ? (result.overall_std <= CREDIBILITY_STD_THRESHOLD.high ? 'high'
        : result.overall_std <= CREDIBILITY_STD_THRESHOLD.medium ? 'medium' : 'low')
      : null
  );
  if (!credibility) return null;
  const meta = credibilityMeta[credibility];

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border ${
      disabled ? 'bg-slate-800/40 border-slate-700/40 opacity-60' : `${meta.bg} ${meta.border}`
    }`}>
      <Scale className={`w-4 h-4 ${disabled ? 'text-slate-500' : meta.color}`} />
      <div className="flex flex-col">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${disabled ? 'text-slate-500' : meta.color}`}>
          {disabled ? '整体可信度 (模型降级)' : '整体检测可信度'}
        </span>
        <span className={`text-sm font-black ${disabled ? 'text-slate-400' : 'text-white'}`}>
          {disabled ? '不可用' : meta.label}
          {!disabled && result.overall_std !== undefined && (
            <span className={`ml-2 text-[10px] font-normal ${meta.color}`}>
              σ = {(result.overall_std * 100).toFixed(2)}%
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function TimeComparison({ elapsedMs, sampleCount, disabled }) {
  if (elapsedMs === undefined || elapsedMs === null) return null;
  const baselineMs = Math.max(200, elapsedMs / Math.max(1, sampleCount) * 1.2);
  const slowdown = sampleCount > 1 ? (elapsedMs / baselineMs).toFixed(1) : 1;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] ${
      disabled ? 'bg-slate-800/40 border-slate-700/40 text-slate-500 opacity-60'
               : 'bg-slate-800/60 border-slate-700 text-slate-400'
    }`}>
      <Timer className="w-3 h-3" />
      <span className="font-mono font-bold text-slate-200">{elapsedMs}ms</span>
      {sampleCount > 1 && !disabled && (
        <>
          <span className="text-slate-600">|</span>
          <span>
            {sampleCount}次采样 · <span className="text-amber-400 font-bold">{slowdown}x</span> 单次耗时
          </span>
        </>
      )}
    </div>
  );
}

function App() {
  const {
    healthData,
    overallStatus,
    isOffline,
    isReconnecting,
    consecutiveFailures,
    lastCheck,
    toasts,
    addToast,
    removeToast,
    forceReconnect
  } = useHealthCheck();

  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [result, setResult] = useState(null);
  const [rewriteLevel, setRewriteLevel] = useState("medium");
  const [rewriteResult, setRewriteResult] = useState(null);
  const [quota, setQuota] = useState(10);
  const [selectedVersionA, setSelectedVersionA] = useState(null);
  const [selectedVersionB, setSelectedVersionB] = useState(null);
  const [viewMode, setViewMode] = useState('single');
  const [precisionMode, setPrecisionMode] = useState('accurate');

  const [paragraphMode, setParagraphMode] = useState(false);
  const [paragraphs, setParagraphs] = useState([]);
  const [selectiveRewriteResult, setSelectiveRewriteResult] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [showOriginalForParagraph, setShowOriginalForParagraph] = useState({});

  const [structureMode, setStructureMode] = useState(false);
  const [structureResult, setStructureResult] = useState(null);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [rewritingSectionId, setRewritingSectionId] = useState(null);
  const [showSectionOriginal, setShowSectionOriginal] = useState({});
  const [analyzingStructure, setAnalyzingStructure] = useState(false);

  const [generatingReport, setGeneratingReport] = useState(false);

  const [tourOpen, setTourOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [terminologyOpen, setTerminologyOpen] = useState(false);
  const [terminologyAnalysis, setTerminologyAnalysis] = useState(null);
  const [selectiveTerminologyAnalysis, setSelectiveTerminologyAnalysis] = useState(null);

  useEffect(() => {
    const tourSeen = localStorage.getItem('paperwise_tour_seen');
    if (!tourSeen) {
      const t = setTimeout(() => setTourOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const lastSeenVersion = localStorage.getItem('paperwise_last_changelog_version');
    const currentVersion = changelogData[0]?.version;
    if (currentVersion && lastSeenVersion !== currentVersion) {
      const t = setTimeout(() => {
        setChangelogOpen(true);
        localStorage.setItem('paperwise_last_changelog_version', currentVersion);
      }, 1200);
      return () => clearTimeout(t);
    }
  }, []);

  const handleTourComplete = () => {
    localStorage.setItem('paperwise_tour_seen', 'true');
    setTourOpen(false);
  };

  const handleTourClose = () => {
    localStorage.setItem('paperwise_tour_seen', 'true');
    setTourOpen(false);
  };

  // 流式改写相关状态
  const sseClientRef = useRef(null);
  const [streamingText, setStreamingText] = useState("");
  const [streamingProgress, setStreamingProgress] = useState({ generated: 0, estimated: 0 });
  const [streamingStatus, setStreamingStatus] = useState(null); // 'streaming' | 'reconnecting' | null
  const [streamingError, setStreamingError] = useState(null);
  // 逐段流式状态
  const [streamingParagraphs, setStreamingParagraphs] = useState([]);
  const [currentStreamingParaIdx, setCurrentStreamingParaIdx] = useState(null);

  const bootstrapSamples = precisionMode === 'accurate' ? 10 : 3;
  const isDegraded = !!result?.degraded;
  const useVirtualList = paragraphs.length > VIRTUAL_LIST_THRESHOLD;

  const scrollToInput = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetAll = () => {
    setResult(null);
    setRewriteResult(null);
    setSelectiveRewriteResult(null);
    setText("");
    setFile(null);
    setSelectedVersionA(null);
    setSelectedVersionB(null);
    setParagraphs([]);
    setParagraphMode(false);
    setShowOriginalForParagraph({});
    setStructureResult(null);
    setStructureMode(false);
    setSelectedSectionId(null);
    setRewritingSectionId(null);
    setShowSectionOriginal({});
    setTerminologyAnalysis(null);
    setSelectiveTerminologyAnalysis(null);
    scrollToInput();
  };

  const toggleStructureMode = () => {
    if (!structureMode && !text.trim()) {
      alert("请先输入文本内容或上传文件");
      return;
    }
    if (!structureMode && !structureResult) {
      handleAnalyzeStructure();
    }
    setStructureMode(!structureMode);
    setParagraphMode(false);
  };

  const handleAnalyzeStructure = async () => {
    if (!text.trim()) {
      alert("请先输入文本内容");
      return;
    }
    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }
    setAnalyzingStructure(true);
    try {
      const response = await axios.post(`${API_BASE}/analyze-structure`, { text });
      setStructureResult(response.data);
      if (response.data.sections?.length > 0 && !selectedSectionId) {
        setSelectedSectionId(response.data.sections[0].id);
      }
      decreaseQuota();
    } catch (err) {
      alert("结构分析失败: " + err.message);
    } finally {
      setAnalyzingStructure(false);
    }
  };

  const handleSelectSection = (section) => {
    setSelectedSectionId(section.id);
    if (section.start_index !== undefined && section.end_index !== undefined) {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(section.start_index, section.end_index);
      }
    }
  };

  const handleRewriteSection = async (section) => {
    if (isOffline) {
      alert("离线模式下无法执行改写操作，请先恢复网络连接");
      return;
    }
    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }
    if (!section || !section.content) {
      alert("章节内容为空，无法改写");
      return;
    }
    setRewritingSectionId(section.id);
    try {
      const response = await axios.post(`${API_BASE}/rewrite-chapter`, {
        full_text: text,
        section: section,
        level: rewriteLevel
      });

      const { new_full_text, updated_section, section_detection_after, index_offset } = response.data;

      setText(new_full_text);

      if (structureResult) {
        const updatedSections = structureResult.sections.map(s => {
          if (s.id === section.id) {
            return {
              ...s,
              ...updated_section,
              original_content: section.content,
              ai_score: section_detection_after?.overall_ai_score ?? s.ai_score,
              degraded: section_detection_after?.degraded ?? s.degraded,
              details: section_detection_after?.details ?? s.details
            };
          }
          if (index_offset !== 0 && s.start_index > section.end_index) {
            return {
              ...s,
              start_index: s.start_index + index_offset,
              end_index: s.end_index + index_offset
            };
          }
          return s;
        });

        const overallScore = updatedSections.reduce((acc, s) => {
          if (s.ai_score !== undefined && s.ai_score !== null) {
            const w = Math.max(1, s.content.length);
            return { sum: acc.sum + s.ai_score * w, weight: acc.weight + w };
          }
          return acc;
        }, { sum: 0, weight: 0 });

        setStructureResult({
          ...structureResult,
          sections: updatedSections,
          overall_ai_score: overallScore.weight > 0
            ? Math.round((overallScore.sum / overallScore.weight) * 100) / 100
            : structureResult.overall_ai_score
        });
      }

      setShowSectionOriginal(prev => ({ ...prev, [section.id]: false }));
      decreaseQuota();
    } catch (err) {
      alert("章节改写失败: " + err.message);
    } finally {
      setRewritingSectionId(null);
    }
  };

  const selectedSection = useMemo(() => {
    if (!structureResult?.sections || !selectedSectionId) return null;
    return structureResult.sections.find(s => s.id === selectedSectionId);
  }, [structureResult, selectedSectionId]);

  const decreaseQuota = () => {
    if (quota > 0) {
      setQuota(prev => prev - 1);
    }
  };

  const handleRevertModifiedTerm = (modifiedTerm, source) => {
    const term = modifiedTerm.term;
    if (source === 'rewrite' && rewriteResult) {
      const currentText = rewriteResult.history.find(h => h.version === selectedVersionA)?.text || '';
      const originalText = rewriteResult.original_text || text;
      const revertedText = currentText.replace(new RegExp(term, 'gi'), (match) => {
        const idx = originalText.toLowerCase().indexOf(term.toLowerCase());
        if (idx !== -1) {
          return originalText.substring(idx, idx + term.length);
        }
        return term;
      });
      const updatedHistory = rewriteResult.history.map(h =>
        h.version === selectedVersionA ? { ...h, text: revertedText } : h
      );
      setRewriteResult({ ...rewriteResult, history: updatedHistory });
      if (terminologyAnalysis) {
        const newPreserved = [...(terminologyAnalysis.preserved || []), {
          id: modifiedTerm.id,
          term: term,
          category: modifiedTerm.category,
          description: modifiedTerm.description,
          preserved_manually: true
        }];
        const newModified = (terminologyAnalysis.modified || []).filter(m => m.id !== modifiedTerm.id);
        setTerminologyAnalysis({
          ...terminologyAnalysis,
          preserved: newPreserved,
          modified: newModified,
          has_modified_terms: newModified.length > 0
        });
      }
      addToast({ type: 'success', title: `已恢复术语: ${term}` });
    } else if (source === 'selective' && selectiveRewriteResult) {
      const updatedParagraphs = selectiveRewriteResult.paragraphs.map(p => {
        const newText = p.rewritten_text.replace(new RegExp(term, 'gi'), (match) => {
          const idx = (p.original_text || '').toLowerCase().indexOf(term.toLowerCase());
          if (idx !== -1) {
            return (p.original_text || '').substring(idx, idx + term.length);
          }
          return term;
        });
        return { ...p, rewritten_text: newText };
      });
      const combinedText = [...updatedParagraphs].sort((a, b) => a.id - b.id).map(p => p.rewritten_text).join('\n\n');
      setSelectiveRewriteResult({ ...selectiveRewriteResult, paragraphs: updatedParagraphs, combined_text: combinedText });
      if (selectiveTerminologyAnalysis) {
        const newPreserved = [...(selectiveTerminologyAnalysis.preserved || []), {
          id: modifiedTerm.id,
          term: term,
          category: modifiedTerm.category,
          description: modifiedTerm.description,
          preserved_manually: true
        }];
        const newModified = (selectiveTerminologyAnalysis.modified || []).filter(m => m.id !== modifiedTerm.id);
        setSelectiveTerminologyAnalysis({
          ...selectiveTerminologyAnalysis,
          preserved: newPreserved,
          modified: newModified,
          has_modified_terms: newModified.length > 0
        });
      }
      addToast({ type: 'success', title: `已恢复术语: ${term}` });
    }
  };

  const _cleanupStreaming = () => {
    if (sseClientRef.current) {
      try {
        sseClientRef.current.abort();
      } catch (e) { /* ignore */ }
      sseClientRef.current = null;
    }
    setStreamingStatus(null);
  };

  const handleStopRewrite = async () => {
    if (!sseClientRef.current) return;
    const streamId = sseClientRef.current.getStreamId();
    if (streamId) {
      try {
        await axios.post(`${API_BASE}/rewrite-abort`, { stream_id: streamId });
      } catch (e) { /* ignore */ }
    }
    _cleanupStreaming();
    setRewriting(false);
  };

  // 组件卸载时清理 SSE
  useEffect(() => {
    return () => _cleanupStreaming();
  }, []);

  const toggleParagraphMode = () => {
    if (!paragraphMode) {
      if (!text.trim()) {
        alert("请先输入文本内容");
        return;
      }
      let paras = buildParagraphsFromText(text);
      if (result) {
        paras = applyRecommendations(result, paras);
      }
      setParagraphs(paras);
    }
    setParagraphMode(!paragraphMode);
  };

  const handleTextChange = (val) => {
    setText(val);
    if (paragraphMode) {
      let paras = buildParagraphsFromText(val);
      if (result) {
        paras = applyRecommendations(result, paras);
      }
      setParagraphs(paras);
    }
  };

  const toggleParagraphSelect = (index) => {
    setParagraphs(prev => {
      const next = [...prev];
      if (!next[index].locked) {
        next[index] = { ...next[index], selected: !next[index].selected };
      }
      return next;
    });
  };

  const toggleParagraphLock = (index) => {
    setParagraphs(prev => {
      const next = [...prev];
      const locked = !next[index].locked;
      next[index] = { ...next[index], locked, selected: locked ? false : next[index].selected };
      return next;
    });
  };

  const selectAllParagraphs = () => {
    setParagraphs(prev => prev.map(p => p.locked ? p : { ...p, selected: true }));
  };

  const deselectAllParagraphs = () => {
    setParagraphs(prev => prev.map(p => p.locked ? p : { ...p, selected: false }));
  };

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setParagraphs(prev => {
      const next = [...prev];
      const [removed] = next.splice(dragIndex, 1);
      next.splice(index, 0, removed);
      return next;
    });
    setDragIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const handleSelectiveRewrite = async () => {
    if (!paragraphs.length) return;
    const hasSelected = paragraphs.some(p => p.selected && !p.locked);
    if (!hasSelected) {
      alert("请至少选择一个段落进行改写");
      return;
    }
    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }
    setRewriting(true);
    setRewriteResult(null);
    setSelectiveRewriteResult(null);
    setStreamingError(null);
    setStreamingParagraphs(paragraphs.map(p => ({ ...p, rewritten_text: p.text, rewritten: false, _streaming: false })));
    setCurrentStreamingParaIdx(null);
    setStreamingStatus('streaming');
    setTimeout(() => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }), 200);

    const payload = {
      paragraphs: paragraphs.map((p) => ({
        id: p.id,
        text: p.text,
        should_rewrite: p.selected && !p.locked,
        locked: p.locked
      })),
      level: rewriteLevel
    };

    const client = createSSEClient({
      url: `${API_BASE}/rewrite-selective-stream`,
      payload,
      onEvent: (eventType, data) => {
        if (eventType === 'paragraph_start') {
          setCurrentStreamingParaIdx(data.paragraph_index);
          setStreamingParagraphs(prev => prev.map((p, idx) =>
            idx === data.paragraph_index ? { ...p, _streaming: true, rewritten_text: '' } : p
          ));
        } else if (eventType === 'token') {
          setStreamingParagraphs(prev => prev.map((p, idx) =>
            idx === data.paragraph_index ? { ...p, rewritten_text: data.paragraph_text } : p
          ));
          setStreamingProgress({
            generated: data.generated_chars,
            estimated: data.estimated_paragraph_chars || 0
          });
        } else if (eventType === 'paragraph_done') {
          setStreamingParagraphs(prev => prev.map((p, idx) =>
            idx === data.paragraph_index
              ? { ...p, rewritten_text: data.rewritten_text, rewritten: data.rewritten, locked: data.locked, _streaming: false }
              : p
          ));
        } else if (eventType === 'done') {
          setSelectiveRewriteResult({
            paragraphs: data.paragraphs,
            combined_text: data.combined_text,
            detection_after: data.detection_after
          });
          if (data.terminology_analysis) {
            setSelectiveTerminologyAnalysis(data.terminology_analysis);
            if (data.terminology_analysis.has_modified_terms) {
              addToast({ type: 'warning', title: `检测到 ${data.terminology_analysis.modified.length} 个术语被意外修改`, message: '请点击术语保护状态查看详情并一键回退' });
            }
          }
          setCurrentStreamingParaIdx(null);
          setShowOriginalForParagraph({});
          _cleanupStreaming();
          setRewriting(false);
          decreaseQuota();
        } else if (eventType === 'aborted') {
          setSelectiveRewriteResult({
            paragraphs: data.partial_results || [],
            combined_text: data.combined_text || ''
          });
          setCurrentStreamingParaIdx(null);
          _cleanupStreaming();
          setRewriting(false);
        } else if (eventType === 'error') {
          setStreamingError(data.message || '未知错误');
          setCurrentStreamingParaIdx(null);
          _cleanupStreaming();
          setRewriting(false);
        } else if (eventType === 'reconnecting') {
          setStreamingStatus('reconnecting');
        }
      },
      onError: (err) => {
        setStreamingError(err.message || '连接错误');
        setCurrentStreamingParaIdx(null);
        _cleanupStreaming();
        setRewriting(false);
      },
    });
    sseClientRef.current = client;
  };

  const handleParagraphAction = (paraId, action) => {
    if (action === 'revert') {
      setSelectiveRewriteResult(prev => {
        if (!prev) return prev;
        const resultById = {};
        prev.paragraphs.forEach(p => { resultById[p.id] = p; });
        const target = resultById[paraId];
        if (target) {
          target.rewritten_text = target.original_text;
          target.rewritten = false;
          target._reverted = true;
        }
        const combinedText = paragraphs
          .map(srcPara => (resultById[srcPara.id] || srcPara).rewritten_text || srcPara.text)
          .join('\n\n');
        return { ...prev, paragraphs: prev.paragraphs, combined_text: combinedText };
      });
    } else if (action === 'toggle') {
      setShowOriginalForParagraph(prev => ({
        ...prev,
        [paraId]: !prev[paraId]
      }));
    }
  };

  const handleExportSelective = () => {
    if (!selectiveRewriteResult) return;
    const blob = new Blob([selectiveRewriteResult.combined_text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rewritten_selective_result.txt`;
    a.click();
  };

  const handleBatchClick = () => {
    alert("批量处理功能正在内测中。如需大批量处理，请通过 API 接入或联系学术客服。");
  };

  const handleSplitRedetect = async (idx, chunk) => {
    if (!chunk.text) return;

    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }

    setLoading(true);
    try {
      const splitResp = await axios.post(`${API_BASE}/split-sentences`, { text: chunk.text });
      const { sentences, can_split } = splitResp.data;
      if (!can_split || sentences.length < 2) {
        alert("该段落内容较短，无法进一步拆分。请手动编辑后重试。");
        setLoading(false);
        return;
      }

      const detectResp = await axios.post(`${API_BASE}/detect-text-advanced`, {
        text: sentences.join('\n\n'),
        bootstrap_samples: bootstrapSamples
      });
      const newDetection = detectResp.data;
      const currentDetails = result.details || [];
      const newDetails = [
        ...currentDetails.slice(0, idx),
        ...newDetection.details,
        ...currentDetails.slice(idx + 1)
      ];

      const recomputeResp = await axios.post(`${API_BASE}/recompute-stats`, { details: newDetails });
      const newOverallStats = recomputeResp.data;

      setResult({
        ...result,
        details: newDetails,
        overall_ai_score: newOverallStats.overall_ai_score,
        overall_mean: newOverallStats.overall_mean,
        overall_std: newOverallStats.overall_std,
        overall_ci_lower: newOverallStats.overall_ci_lower,
        overall_ci_upper: newOverallStats.overall_ci_upper,
        overall_credibility: newOverallStats.overall_credibility,
      });
      decreaseQuota();
    } catch (err) {
      alert("拆分重检失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }

    setLoading(true);
    setAnalyzingStructure(true);
    setRewriteResult(null);
    setSelectiveRewriteResult(null);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const structureResponse = await axios.post(`${API_BASE}/analyze-file-structure`, formData);
      setResult(structureResponse.data.overall_detection || { overall_ai_score: structureResponse.data.structure?.overall_ai_score, details: [], degraded: false });
      if (structureResponse.data.text) {
        setText(structureResponse.data.text);
        if (paragraphMode) {
          let paras = buildParagraphsFromText(structureResponse.data.text);
          if (structureResponse.data.overall_detection) {
            paras = applyRecommendations(structureResponse.data.overall_detection, paras);
          }
          setParagraphs(paras);
        }
      }
      setStructureResult(structureResponse.data.structure);
      if (structureResponse.data.structure?.sections?.length > 0) {
        setSelectedSectionId(structureResponse.data.structure.sections[0].id);
      }
      decreaseQuota();
      setTimeout(() => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }), 500);
    } catch (err) {
      alert("Error uploading file: " + err.message);
    } finally {
      setLoading(false);
      setAnalyzingStructure(false);
    }
  };

  const handleDetectText = async () => {
    if (!text.trim()) return;

    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }

    setLoading(true);
    setAnalyzingStructure(true);
    setRewriteResult(null);
    setSelectiveRewriteResult(null);
    try {
      const [detectResponse, structureResponse] = await Promise.all([
        axios.post(`${API_BASE}/detect-text-advanced`, {
          text,
          bootstrap_samples: bootstrapSamples
        }),
        axios.post(`${API_BASE}/analyze-structure`, { text })
      ]);
      setResult(detectResponse.data);
      setStructureResult(structureResponse.data);
      if (structureResponse.data.sections?.length > 0 && !selectedSectionId) {
        setSelectedSectionId(structureResponse.data.sections[0].id);
      }
      if (paragraphMode) {
        setParagraphs(prev => applyRecommendations(detectResponse.data, prev));
      }
      decreaseQuota();
      setTimeout(() => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }), 500);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
      setAnalyzingStructure(false);
    }
  };

  const handleRewrite = async () => {
    if (!text.trim()) return;

    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }

    setRewriting(true);
    setSelectiveRewriteResult(null);
    setRewriteResult(null);
    setStreamingError(null);
    setStreamingText("");
    setStreamingProgress({ generated: 0, estimated: 0 });
    setStreamingStatus('streaming');
    setTimeout(() => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }), 200);

    const originalText = text;
    const client = createSSEClient({
      url: `${API_BASE}/rewrite-stream`,
      payload: { text: originalText, level: rewriteLevel },
      onEvent: (eventType, data) => {
        if (eventType === 'start') {
          setStreamingProgress({ generated: 0, estimated: data.estimated_total_chars });
        } else if (eventType === 'token') {
          setStreamingText(data.text);
          setStreamingProgress({
            generated: data.generated_chars,
            estimated: data.estimated_total_chars
          });
        } else if (eventType === 'done') {
          const finalText = data.final_text;
          setStreamingText(finalText);
          setRewriteResult({
            original_text: originalText,
            rewritten_text: finalText,
            detection_after: data.detection_after,
            iterations: 1,
            history: [
              { version: 0, label: '原文', text: originalText, detection: null },
              { version: 1, label: '改写结果', text: finalText, detection: data.detection_after }
            ]
          });
          if (data.terminology_analysis) {
            setTerminologyAnalysis(data.terminology_analysis);
            if (data.terminology_analysis.has_modified_terms) {
              addToast({ type: 'warning', title: `检测到 ${data.terminology_analysis.modified.length} 个术语被意外修改`, message: '请点击术语保护状态查看详情并一键回退' });
            }
          }
          setSelectedVersionA(1);
          setSelectedVersionB(0);
          _cleanupStreaming();
          setRewriting(false);
          decreaseQuota();
        } else if (eventType === 'aborted') {
          const partialText = data.partial_text || streamingText;
          setStreamingText(partialText);
          _cleanupStreaming();
          setRewriting(false);
        } else if (eventType === 'error') {
          setStreamingError(data.message || '未知错误');
          _cleanupStreaming();
          setRewriting(false);
        } else if (eventType === 'reconnecting') {
          setStreamingStatus('reconnecting');
        }
      },
      onError: (err) => {
        setStreamingError(err.message || '连接错误');
        _cleanupStreaming();
        setRewriting(false);
      },
    });
    sseClientRef.current = client;
  };

  const getVersionText = (version) => {
    if (!rewriteResult?.history) return '';
    const item = rewriteResult.history.find(h => h.version === version);
    return item ? item.text : '';
  };

  const getVersionLabel = (version) => {
    if (!rewriteResult?.history) return '';
    const item = rewriteResult.history.find(h => h.version === version);
    return item ? item.label : '';
  };

  const getSelectedExportText = () => {
    if (!rewriteResult?.history) return '';
    return getVersionText(selectedVersionA);
  };

  const handleExport = () => {
    const exportText = getSelectedExportText();
    const versionLabel = getVersionLabel(selectedVersionA);
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rewritten_${versionLabel || 'result'}.txt`;
    a.click();
  };

  const handleGenerateReport = async (source) => {
    if (generatingReport) return;

    let original_text = '';
    let rewritten_text = '';
    let report_details = [];
    let overall_score = 0;
    let degraded = false;
    let iterations = 1;

    if (source === 'selective' && selectiveRewriteResult) {
      original_text = selectiveRewriteResult.paragraphs
        ? [...selectiveRewriteResult.paragraphs].sort((a, b) => a.id - b.id).map(p => p.original_text).join('\n\n')
        : text;
      rewritten_text = selectiveRewriteResult.combined_text || '';
      if (selectiveRewriteResult.detection_after) {
        overall_score = selectiveRewriteResult.detection_after.overall_ai_score || 0;
        report_details = selectiveRewriteResult.detection_after.details || [];
        degraded = selectiveRewriteResult.detection_after.degraded || false;
      } else if (result) {
        overall_score = result.overall_ai_score || 0;
        report_details = result.details || [];
        degraded = result.degraded || false;
      }
    } else if (source === 'rewrite' && rewriteResult) {
      original_text = rewriteResult.original_text || text;
      rewritten_text = rewriteResult.rewritten_text || '';
      iterations = rewriteResult.iterations || 1;
      if (rewriteResult.detection_after) {
        overall_score = rewriteResult.detection_after.overall_ai_score || 0;
        report_details = rewriteResult.detection_after.details || [];
        degraded = rewriteResult.detection_after.degraded || false;
      } else if (result) {
        overall_score = result.overall_ai_score || 0;
        report_details = result.details || [];
        degraded = result.degraded || false;
      }
    } else {
      if (!result) {
        alert('请先执行检测后再生成报告');
        return;
      }
      original_text = text;
      rewritten_text = '';
      overall_score = result.overall_ai_score || 0;
      report_details = result.details || [];
      degraded = result.degraded || false;
    }

    if (!report_details || report_details.length === 0) {
      report_details = [{ text: original_text.substring(0, 500), ai_score: overall_score / 100 }];
    }

    setGeneratingReport(true);
    try {
      const payload = {
        project_name: '学术论文 AIGC 检测报告',
        detection_time: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        overall_ai_score: overall_score,
        details: report_details,
        original_text: original_text,
        rewritten_text: rewritten_text,
        detection_model: 'distilbert-base-uncased',
        rewrite_model: 'llama-3.3-70b-versatile',
        rewrite_level: rewriteLevel,
        iterations: iterations,
        bootstrap_samples: bootstrapSamples,
        degraded: degraded,
      };

      const response = await axios.post(`${API_BASE}/generate-report`, payload, {
        responseType: 'blob',
        timeout: 60000,
      });

      const disposition = response.headers['content-disposition'] || response.headers['x-suggested-filename'];
      let filename = `PaperWise_Report_${Date.now()}.pdf`;
      if (disposition) {
        const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\s]+)["']?/i);
        if (match && match[1]) {
          filename = decodeURIComponent(match[1]);
        }
      }

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('PDF report generation failed:', err);
      let msg = '报告生成失败';
      if (err.response?.data instanceof Blob) {
        try {
          const txt = await err.response.data.text();
          const parsed = JSON.parse(txt);
          msg = parsed.detail || msg;
        } catch (_) {}
      } else if (err.message) {
        msg = err.message;
      }
      alert(msg);
    } finally {
      setGeneratingReport(false);
    }
  };

  const hasAdvancedStats = result && result.details && result.details[0] && result.details[0].mean !== undefined;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans selection:bg-indigo-500/30 pb-20">
      <nav className={`border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky z-50 ${isOffline ? 'top-10' : 'top-0'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={resetAll}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white italic">Paper<span className="text-indigo-500 font-black">Wise</span></span>
          </div>
          <div className="flex items-center gap-4">
            <SystemStatusIndicator
              overallStatus={overallStatus}
              healthData={healthData}
              isOffline={isOffline}
              isReconnecting={isReconnecting}
              lastCheck={lastCheck}
              consecutiveFailures={consecutiveFailures}
              onForceReconnect={forceReconnect}
            />
            <div className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
              今日额度: <span className={quota > 3 ? "text-indigo-400" : "text-red-400"}>{quota}/10</span>
            </div>
            <button
              onClick={() => setTerminologyOpen(true)}
              className="px-3 h-8 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/30 hover:border-amber-500/50 flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-all text-xs font-bold"
              title="我的术语词典"
            >
              <Library className="w-3.5 h-3.5" />
              术语词典
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-all"
              title="我的检测历史"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChangelogOpen(true)}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-all"
              title="更新日志"
            >
              <ScrollText className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTourOpen(true)}
              className="w-8 h-8 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 hover:border-indigo-500/50 flex items-center justify-center text-indigo-400 hover:text-indigo-300 transition-all"
              title="使用帮助"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-bold mb-6"
          >
            <Sparkles className="w-3 h-3" />
            全新 Llama 3 改写引擎 · 支持 Bootstrap 置信度检测 & 逐段选择性改写
          </motion.div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 tracking-tight">
            让 AI 充满 <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">学术人味</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            一站式学术论文工具：深度 AIGC 检测 + 逐段选择性人性化改写。
            <br />支持段落锁定、拖拽排序、智能推荐改写与独立撤销。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          <div className="lg:col-span-12">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 pointer-events-none"></div>

              <div className="relative mb-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                      <button
                        onClick={() => { setParagraphMode(false); setStructureMode(false); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                          !paragraphMode && !structureMode
                            ? 'bg-slate-800 text-white border border-slate-700'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        文本模式
                      </button>
                      <button
                        onClick={toggleParagraphMode}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                          paragraphMode
                            ? 'bg-indigo-600 text-white shadow shadow-indigo-500/20'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        disabled={!text.trim() && !paragraphs.length}
                      >
                        <ListChecks className="w-4 h-4" />
                        逐段模式
                      </button>
                      <button
                        onClick={toggleStructureMode}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                          structureMode
                            ? 'bg-purple-600 text-white shadow shadow-purple-500/20'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        disabled={!text.trim() && !structureResult}
                      >
                        <BookOpen className="w-4 h-4" />
                        结构模式
                      </button>
                    </div>
                    <div className="relative group">
                      <button
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                          (loading || isOffline)
                            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                            : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                        disabled={loading || isOffline}
                      >
                        {loading ? (
                          <>
                            <RefreshCcw className="w-4 h-4 animate-spin" />
                            上传中...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            上传文件
                          </>
                        )}
                        {isOffline && !loading && (
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-950 text-red-400 text-[10px] px-2 py-1 rounded border border-red-500/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            离线模式下不可用
                          </span>
                        )}
                      </button>
                      <input
                        type="file"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        onChange={handleFileUpload}
                        accept=".pdf,.docx,.txt"
                        disabled={loading || isOffline}
                      />
                    </div>
                    <div className="flex items-center gap-2 pl-2 ml-2 border-l border-slate-700">
                      <Target className="w-3.5 h-3.5 text-slate-500" />
                      <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                        <button
                          onClick={() => setPrecisionMode('fast')}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                            precisionMode === 'fast'
                              ? 'bg-emerald-600 text-white shadow shadow-emerald-500/20'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          <Zap className="w-3 h-3" /> 快速模式 (3次)
                        </button>
                        <button
                          onClick={() => setPrecisionMode('accurate')}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                            precisionMode === 'accurate'
                              ? 'bg-indigo-600 text-white shadow shadow-indigo-500/20'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          <Gauge className="w-3 h-3" /> 精确模式 (10次)
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    当前字数: {text.length} / 5000
                  </div>
                </div>

                {!paragraphMode && !structureMode ? (
                  <textarea
                    id="tour-text-input"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-6 text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[300px] transition-all text-sm leading-relaxed"
                    placeholder="在此输入您的学术论文片段，或上传附件...（切换到「逐段模式」可精细控制每个段落的改写，「结构模式」可按章节分析与改写）"
                    value={text}
                    onChange={(e) => handleTextChange(e.target.value)}
                  ></textarea>
                ) : structureMode ? (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[400px]">
                    <div className="lg:col-span-4">
                      <PaperStructureTree
                        structure={structureResult}
                        selectedSectionId={selectedSectionId}
                        onSelectSection={handleSelectSection}
                        onRewriteSection={handleRewriteSection}
                        rewritingSectionId={rewritingSectionId}
                        formatType={structureResult?.format_type}
                        fallbackUsed={structureResult?.fallback_used}
                      />
                    </div>
                    <div className="lg:col-span-8">
                      <SectionContentViewer
                        section={selectedSection}
                        showOriginal={!!showSectionOriginal[selectedSectionId]}
                        onToggleOriginal={() => setShowSectionOriginal(prev => ({
                          ...prev,
                          [selectedSectionId]: !prev[selectedSectionId]
                        }))}
                        onRewrite={() => selectedSection && handleRewriteSection(selectedSection)}
                        isRewriting={rewritingSectionId === selectedSectionId}
                        rewriteLevel={rewriteLevel}
                        hasOriginal={selectedSection?.original_content}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0">
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <ListChecks className="w-3.5 h-3.5" />
                          共 {paragraphs.length} 个段落
                          {paragraphs.some(p => p.selected && !p.locked) && (
                            <span className="ml-1 text-indigo-400">
                              · 已选 {paragraphs.filter(p => p.selected && !p.locked).length} 段参与改写
                            </span>
                          )}
                        </span>
                        {useVirtualList && (
                          <span className="text-[10px] text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-700">
                            虚拟滚动已启用
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={selectAllParagraphs}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 flex items-center gap-1 transition-colors"
                        >
                          <CheckSquare className="w-3 h-3" /> 全选
                        </button>
                        <button
                          onClick={deselectAllParagraphs}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 flex items-center gap-1 transition-colors"
                        >
                          <Square className="w-3 h-3" /> 全不选
                        </button>
                        <button
                          onClick={() => {
                            const newText = paragraphs.map(p => p.text).join('\n\n');
                            setText(newText);
                          }}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 flex items-center gap-1 transition-colors"
                          title="用当前段落内容更新原文"
                        >
                          <RefreshCcw className="w-3 h-3" /> 同步到原文
                        </button>
                      </div>
                    </div>
                    <div className="min-h-[300px] max-h-[600px]">
                      {useVirtualList ? (
                        <VirtualList
                          items={paragraphs}
                          itemHeight={PARAGRAPH_CARD_HEIGHT}
                          overscan={VIRTUAL_OVERSCAN}
                          renderItem={(para, idx) => (
                            <div className="mb-3 pr-2">
                              <SelectiveParagraphCard
                                para={para}
                                index={idx}
                                aiScore={para._aiScore}
                                recommendation={para._recommendation}
                                isDragging={dragIndex === idx}
                                onToggleSelect={toggleParagraphSelect}
                                onToggleLock={toggleParagraphLock}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                              />
                            </div>
                          )}
                        />
                      ) : (
                        <div className="overflow-y-auto max-h-[600px] pr-2 space-y-3">
                          {paragraphs.map((p, i) => (
                            <SelectiveParagraphCard
                              key={p.id ?? i}
                              para={p}
                              index={i}
                              aiScore={p._aiScore}
                              recommendation={p._recommendation}
                              isDragging={dragIndex === i}
                              onToggleSelect={toggleParagraphSelect}
                              onToggleLock={toggleParagraphLock}
                              onDragStart={handleDragStart}
                              onDragEnd={handleDragEnd}
                              onDragOver={handleDragOver}
                              onDrop={handleDrop}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div id="tour-rewrite-level" className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    {['low', 'medium', 'high'].map(l => (
                      <button
                        key={l}
                        onClick={() => setRewriteLevel(l)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${rewriteLevel === l ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        {l === 'low' ? '轻微' : l === 'medium' ? '中度' : '深度'}改写
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Layers className="w-4 h-4" />
                    <button
                      onClick={() => setTerminologyOpen(true)}
                      className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                      title="点击管理术语词典"
                    >
                      <Library className="w-3.5 h-3.5" />
                      术语保护已启用
                    </button>
                  </div>
                  {paragraphMode && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Shuffle className="w-3 h-3" />
                      <span>拖拽卡片可调整顺序</span>
                    </div>
                  )}
                </div>

                <div id="tour-detect-btn" className="flex gap-3 flex-wrap items-center">
                  <button
                    onClick={handleDetectText}
                    disabled={loading || !text.trim() || rewriting || isOffline}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all border border-slate-700 disabled:cursor-not-allowed relative group"
                  >
                    {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    仅检测 AI 率
                    {isOffline && (
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-950 text-red-400 text-[10px] px-2 py-1 rounded border border-red-500/30 opacity-0 group-hover:opacity-100 transition-opacity">
                        离线模式下不可用
                      </span>
                    )}
                  </button>
                  {!rewriting ? (
                    paragraphMode ? (
                      <button
                        onClick={handleSelectiveRewrite}
                        disabled={rewriting || !paragraphs.some(p => p.selected && !p.locked) || isOffline}
                        className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-500/20 disabled:cursor-not-allowed relative group"
                      >
                        <Zap className="w-4 h-4" />
                        逐段选择性改写
                        {isOffline && (
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-950 text-red-400 text-[10px] px-2 py-1 rounded border border-red-500/30 opacity-0 group-hover:opacity-100 transition-opacity">
                            离线模式下不可用
                          </span>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={handleRewrite}
                        disabled={rewriting || !text.trim() || isOffline}
                        className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-500/20 disabled:cursor-not-allowed relative group"
                      >
                        <Zap className="w-4 h-4" />
                        一键人性化改写
                        {isOffline && (
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-950 text-red-400 text-[10px] px-2 py-1 rounded border border-red-500/30 opacity-0 group-hover:opacity-100 transition-opacity">
                            离线模式下不可用
                          </span>
                        )}
                      </button>
                    )
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
                        {streamingStatus === 'reconnecting' ? (
                          <>
                            <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
                            <span className="text-xs font-bold text-amber-400">连接恢复中...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCcw className="w-4 h-4 text-indigo-400 animate-spin" />
                            <span className="text-xs font-bold text-indigo-400">
                              正在生成 · {streamingProgress.generated}/{streamingProgress.estimated || '?'}
                            </span>
                          </>
                        )}
                      </div>
                      <button
                        onClick={handleStopRewrite}
                        className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-xl shadow-red-500/20"
                      >
                        <StopCircle className="w-4 h-4" />
                        停止生成
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {(result || rewriteResult || selectiveRewriteResult || (rewriting && (streamingText.length > 0 || streamingParagraphs.length > 0))) && (
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                id="results-section"
                className="lg:col-span-12 space-y-8"
              >
                <div id="tour-result-section" className="bg-slate-900 border border-slate-800 rounded-3xl p-8 overflow-hidden relative">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-2">分析报告</h2>
                      <p className="text-slate-400 text-sm">基于 RoBERTa 及语义突发性检测引擎 · Bootstrap 置信区间</p>
                    </div>
                    {(terminologyAnalysis || selectiveTerminologyAnalysis) && (
                      <div className="flex items-center gap-2">
                        <TerminologyProtectionStatus
                          analysis={terminologyAnalysis || selectiveTerminologyAnalysis}
                          source={terminologyAnalysis ? 'rewrite' : 'selective'}
                          onRevertModified={handleRevertModifiedTerm}
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-6 flex-wrap">
                      <button
                        onClick={() => handleGenerateReport(rewriteResult ? 'rewrite' : (selectiveRewriteResult ? 'selective' : 'detect'))}
                        disabled={generatingReport}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:shadow-none border border-indigo-500/30 disabled:border-slate-600"
                      >
                        {generatingReport ? (
                          <>
                            <RefreshCcw className="w-4 h-4 animate-spin" />
                            <span className="text-sm">生成中...</span>
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4" />
                            <span className="text-sm">生成完整检测报告 (PDF)</span>
                          </>
                        )}
                      </button>
                      <OverallCredibility result={result} disabled={isDegraded} />
                      {hasAdvancedStats && (
                        <TimeComparison
                          elapsedMs={result.elapsed_ms}
                          sampleCount={result.bootstrap_samples || bootstrapSamples}
                          disabled={isDegraded}
                        />
                      )}
                      <div className="text-center">
                        <p className="text-xs text-slate-500 uppercase font-bold mb-1">原文 AI 率</p>
                        <p className={`text-3xl font-black ${isDegraded ? 'text-slate-500' : result?.overall_ai_score > 50 ? 'text-red-500' : 'text-green-500'}`}>
                          {result?.overall_ai_score}%
                        </p>
                      </div>
                      {rewriteResult && (
                        <div className="flex items-center gap-6 pl-6 border-l border-slate-800">
                          <ChevronRight className="text-slate-700" />
                          <div className="text-center">
                            <p className="text-xs text-indigo-400 uppercase font-bold mb-1">改写后 AI 率</p>
                            <p className="text-3xl font-black text-indigo-400">
                              {rewriteResult.detection_after?.overall_ai_score}%
                            </p>
                          </div>
                        </div>
                      )}
                      {selectiveRewriteResult && (
                        <div className="flex items-center gap-6 pl-6 border-l border-slate-800">
                          <ChevronRight className="text-slate-700" />
                          <div className="text-center">
                            <p className="text-xs text-cyan-400 uppercase font-bold mb-1">逐段改写后 AI 率</p>
                            <p className="text-3xl font-black text-cyan-400">
                              {selectiveRewriteResult.detection_after?.overall_ai_score}%
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`h-3 w-full bg-slate-950 rounded-full overflow-hidden flex ${isDegraded ? 'opacity-50' : ''}`}>
                    <div
                      className={`h-full transition-all duration-1000 ${isDegraded ? 'bg-slate-600' : result?.overall_ai_score > 50 ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ width: `${result?.overall_ai_score}%` }}
                    ></div>
                    {rewriteResult && (
                      <div
                        className="h-full bg-indigo-500 transition-all duration-1000 border-l-2 border-slate-900"
                        style={{ width: `${rewriteResult.detection_after?.overall_ai_score}%` }}
                      ></div>
                    )}
                    {selectiveRewriteResult && (
                      <div
                        className="h-full bg-cyan-500 transition-all duration-1000 border-l-2 border-slate-900"
                        style={{ width: `${selectiveRewriteResult.detection_after?.overall_ai_score}%` }}
                      ></div>
                    )}
                  </div>

                  {hasAdvancedStats && !isDegraded && result.overall_ci_lower !== undefined && (
                    <div className="mt-4 flex items-center justify-center gap-3 text-[11px] text-slate-500">
                      <span>95% 置信区间:</span>
                      <span className="font-mono font-bold text-indigo-400">
                        [{(result.overall_ci_lower * 100).toFixed(1)}%, {(result.overall_ci_upper * 100).toFixed(1)}%]
                      </span>
                      <span className="text-slate-700">|</span>
                      <span>标准差 σ:</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {(result.overall_std * 100).toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {isDegraded && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-500">
                      <AlertTriangle className="w-3 h-3" />
                      <span>模型处于降级状态，置信区间功能已禁用</span>
                    </div>
                  )}

                  {structureResult?.sections?.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-slate-800">
                      <div className="flex items-center gap-2 mb-4">
                        <BookOpen className="w-4 h-4 text-purple-400" />
                        <h3 className="text-sm font-bold text-white">章节风险分布</h3>
                        <span className="text-[10px] text-slate-500">· 共 {structureResult.section_count} 个章节</span>
                        {structureResult.fallback_used && (
                          <span className="text-[10px] text-amber-400 ml-auto">自动分块</span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {structureResult.sections.slice(0, 9).map((section, idx) => {
                          const riskColor = section.ai_score === undefined || section.ai_score === null
                            ? { bar: 'bg-slate-500' }
                            : section.ai_score > 60
                              ? { bar: 'bg-red-500' }
                              : section.ai_score > 20
                                ? { bar: 'bg-yellow-500' }
                                : { bar: 'bg-green-500' };
                          return (
                            <motion.div
                              key={section.id}
                              onClick={() => {
                                setSelectedSectionId(section.id);
                                setStructureMode(true);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 cursor-pointer hover:border-purple-500/40 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-slate-200 truncate pr-2" title={section.title}>
                                  {section.title}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                                  section.ai_score > 60 ? 'bg-red-500/15 text-red-400' : section.ai_score > 20 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-green-500/15 text-green-400'
                                }`}>
                                  {section.ai_score !== undefined && section.ai_score !== null ? `${section.ai_score}%` : 'N/A'}
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 rounded-full ${riskColor.bar}`}
                                  style={{ width: `${section.ai_score ?? 0}%` }}
                                />
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {rewriting && streamingText && !paragraphMode && !rewriteResult && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-12">
                      <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl shadow-indigo-500/5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            正在流式改写（打字机效果）
                            {streamingStatus === 'reconnecting' && (
                              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                <WifiOff className="w-3 h-3" /> 连接恢复中...
                              </span>
                            )}
                          </h3>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-mono text-slate-400">
                              {streamingProgress.generated} / {streamingProgress.estimated || '?'} 字
                            </span>
                            <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
                                style={{
                                  width: streamingProgress.estimated
                                    ? `${Math.min(100, (streamingProgress.generated / streamingProgress.estimated) * 100)}%`
                                    : '10%'
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="text-sm leading-relaxed h-[460px] overflow-y-auto pr-4 text-white font-medium whitespace-pre-wrap break-words">
                          {streamingText}
                          <span className="inline-block w-2 h-5 bg-indigo-400 ml-0.5 animate-pulse align-middle"></span>
                        </div>
                        {streamingError && (
                          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
                            ⚠️ 错误: {streamingError}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {rewriting && paragraphMode && streamingParagraphs.length > 0 && !selectiveRewriteResult && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                        <ListChecks className="w-4 h-4" />
                        逐段流式改写中
                        {currentStreamingParaIdx !== null && (
                          <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                            第 {currentStreamingParaIdx + 1} / {streamingParagraphs.length} 段
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-slate-400">
                          {streamingProgress.generated}/{streamingProgress.estimated || '?'}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-3 max-h-[640px] overflow-y-auto pr-2">
                      {streamingParagraphs.map((para, idx) => (
                        <div
                          key={idx}
                          className={`p-4 rounded-2xl border transition-all ${
                            para._streaming
                              ? 'bg-indigo-500/5 border-indigo-500/40 shadow-lg shadow-indigo-500/10'
                              : para.rewritten
                              ? 'bg-slate-900/60 border-cyan-500/30 border-l-4 border-l-cyan-500'
                              : 'bg-slate-900/30 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                              段落 {idx + 1}
                            </span>
                            {para._streaming ? (
                              <span className="text-[10px] flex items-center gap-1 text-indigo-400">
                                <RefreshCcw className="w-3 h-3 animate-spin" />
                                生成中
                              </span>
                            ) : para.rewritten ? (
                              <span className="text-[10px] text-cyan-400">已改写</span>
                            ) : para.locked ? (
                              <span className="text-[10px] text-slate-500">已锁定</span>
                            ) : (
                              <span className="text-[10px] text-slate-500">未改写</span>
                            )}
                          </div>
                          <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
                            {para.rewritten_text || para.text}
                            {para._streaming && (
                              <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle"></span>
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                    {streamingError && (
                      <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
                        ⚠️ 错误: {streamingError}
                      </div>
                    )}
                  </div>
                )}

                {rewriteResult && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4">
                      <TimelineSelector
                        history={rewriteResult.history}
                        selectedA={selectedVersionA}
                        selectedB={selectedVersionB}
                        onSelectA={setSelectedVersionA}
                        onSelectB={(v) => {
                          if (v !== selectedVersionA) setSelectedVersionB(v);
                          else {
                            const other = rewriteResult.history.find(h => h.version !== v);
                            if (other) setSelectedVersionB(other.version);
                          }
                        }}
                        viewMode={viewMode}
                        onChangeViewMode={setViewMode}
                      />
                    </div>

                    <div className="lg:col-span-8">
                      <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl shadow-indigo-500/5 h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                            {viewMode === 'single' ? (
                              <>
                                <Sparkles className="w-4 h-4" />
                                {getVersionLabel(selectedVersionA)}
                              </>
                            ) : (
                              <>
                                <GitCompare className="w-4 h-4" />
                                {getVersionLabel(selectedVersionA)} ↔ {getVersionLabel(selectedVersionB)} Diff 对比
                              </>
                            )}
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              id="tour-export-btn"
                              onClick={handleExport}
                              className="text-xs flex items-center gap-1 text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600"
                            >
                              <FileDown className="w-3 h-3" />
                              导出 [{getVersionLabel(selectedVersionA)}]
                            </button>
                            <button
                              onClick={() => handleGenerateReport('rewrite')}
                              disabled={generatingReport}
                              className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-50 bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 hover:border-indigo-500/60 disabled:bg-slate-700/40 disabled:border-slate-600 disabled:text-slate-500"
                            >
                              {generatingReport ? (
                                <>
                                  <RefreshCcw className="w-3 h-3 animate-spin" />
                                  生成中
                                </>
                              ) : (
                                <>
                                  <FileText className="w-3 h-3" />
                                  PDF 报告
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="text-sm leading-relaxed h-[460px] overflow-y-auto pr-4 flex-1">
                          {viewMode === 'single' ? (
                            <div className="text-white font-medium">
                              {renderTextWithTerminologyHighlight(
                                getVersionText(selectedVersionA),
                                (selectedVersionA === 1 || rewriteResult.history.find(h => h.version === selectedVersionA)?.label === '改写结果')
                                  ? terminologyAnalysis
                                  : null
                              )}
                            </div>
                          ) : selectedVersionA === selectedVersionB ? (
                            <div className="text-slate-500 text-center py-20">
                              <GitCompare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                              <p>请选择两个不同版本进行 Diff 对比</p>
                            </div>
                          ) : (
                            <DiffView
                              oldText={getVersionText(selectedVersionB)}
                              newText={getVersionText(selectedVersionA)}
                            />
                          )}
                        </div>

                        {viewMode === 'diff' && selectedVersionA !== selectedVersionB && (
                          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-4 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-3 rounded-sm bg-green-500/30 border-b-2 border-green-500"></span>
                              <span className="text-slate-400">新增内容</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-3 rounded-sm bg-red-500/30 border-b-2 border-red-500 line-through"></span>
                              <span className="text-slate-400">删除内容</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-3 rounded-sm bg-yellow-500/30 border-b-2 border-yellow-500"></span>
                              <span className="text-slate-400">替换内容</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {selectiveRewriteResult && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                        <ListChecks className="w-4 h-4" />
                        逐段改写结果
                        <span className="text-[10px] font-normal text-slate-500">
                          · 蓝色边线=已改写，灰色边线=未改写
                        </span>
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleExportSelective}
                          className="text-xs flex items-center gap-1 text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600"
                        >
                          <FileDown className="w-3 h-3" />
                          导出结果
                        </button>
                        <button
                          onClick={() => handleGenerateReport('selective')}
                          disabled={generatingReport}
                          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-50 bg-cyan-600/20 border-cyan-500/40 text-cyan-300 hover:bg-cyan-600/30 hover:border-cyan-500/60 disabled:bg-slate-700/40 disabled:border-slate-600 disabled:text-slate-500"
                        >
                          {generatingReport ? (
                            <>
                              <RefreshCcw className="w-3 h-3 animate-spin" />
                              生成中
                            </>
                          ) : (
                            <>
                              <FileText className="w-3 h-3" />
                              PDF 报告
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3 max-h-[640px] overflow-y-auto pr-2">
                      {(() => {
                        const resultById = {};
                        selectiveRewriteResult.paragraphs.forEach(p => { resultById[p.id] = p; });
                        return paragraphs.map((srcPara, idx) => {
                          const para = resultById[srcPara.id];
                          if (!para) return null;
                          return (
                            <ResultParagraphCard
                              key={para.id}
                              para={para}
                              index={idx}
                              showOriginal={!!showOriginalForParagraph[para.id]}
                              onRevert={handleParagraphAction}
                              terminologyAnalysis={selectiveTerminologyAnalysis}
                            />
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {!rewriteResult && !selectiveRewriteResult && result?.details && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {result.details.map((chunk, idx) => (
                      <ParagraphCard
                        key={idx}
                        chunk={chunk}
                        idx={idx}
                        disabled={isDegraded}
                        onSplitRedetect={handleSplitRedetect}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {!result && !rewriteResult && !selectiveRewriteResult && (
        <div className="max-w-4xl mx-auto px-4 mt-20 opacity-30 grayscale contrast-125">
          <div className="flex flex-wrap justify-center gap-12 items-center">
            <div className="text-xl font-bold italic">IEEE</div>
            <div className="text-xl font-bold italic">Springer</div>
            <div className="text-xl font-bold italic">Nature</div>
            <div className="text-xl font-bold italic">Elsevier</div>
            <div className="text-xl font-bold italic">ACM</div>
          </div>
        </div>
      )}

      <footer className="mt-12 border-t border-slate-800 py-8 text-center text-slate-500 text-sm">
        <p>© 2026 PaperWise AI. 专业级学术诚信守护者。</p>
      </footer>

      <TourGuide
        isOpen={tourOpen}
        onClose={handleTourClose}
        onComplete={handleTourComplete}
      />
      <ChangelogModal
        isOpen={changelogOpen}
        onClose={() => setChangelogOpen(false)}
      />
      <HistoryDashboard
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onGoDetect={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      />
      <TerminologyDictionary
        isOpen={terminologyOpen}
        onClose={() => setTerminologyOpen(false)}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default App;
