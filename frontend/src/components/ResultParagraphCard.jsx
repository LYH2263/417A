import React from 'react';
import { motion } from 'framer-motion';
import { Lock, Undo2, Eye } from 'lucide-react';
import { renderTextWithTerminologyHighlight } from '../utils/terminologyHighlight';

export default function ResultParagraphCard({
  para,
  index,
  onRevert,
  showOriginal,
  terminologyAnalysis
}) {
  const isRewritten = para.rewritten && !para.locked;
  const displayText = showOriginal && isRewritten ? para.original_text : para.rewritten_text;
  const showHighlight = isRewritten && !showOriginal && terminologyAnalysis;

  return (
    <motion.div
      layout
      className={`rounded-2xl p-4 border transition-all relative ${
        isRewritten
          ? 'bg-indigo-500/5 border-indigo-500/30'
          : 'bg-slate-900/30 border-slate-800/60'
      }`}
    >
      {isRewritten && (
        <div className="absolute left-0 top-3 bottom-3 w-1 bg-indigo-500 rounded-r-full"></div>
      )}
      {!isRewritten && (
        <div className="absolute left-0 top-3 bottom-3 w-1 bg-slate-700 rounded-r-full"></div>
      )}
      <div className="pl-3">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
              段落 {index + 1}
            </span>
            {isRewritten ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                已改写
              </span>
            ) : para.locked ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> 已锁定
              </span>
            ) : (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-700/40 text-slate-500 border border-slate-600/40">
                未改写
              </span>
            )}
          </div>
          {isRewritten && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onRevert && onRevert(para.id, 'toggle')}
                className={`text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 transition-colors ${
                  showOriginal
                    ? 'bg-slate-700 text-slate-300 border border-slate-600'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300'
                }`}
                title={showOriginal ? '显示改写后' : '查看原文'}
              >
                <Eye className="w-3 h-3" />
                {showOriginal ? '改写后' : '原文'}
              </button>
              <button
                onClick={() => onRevert && onRevert(para.id, 'revert')}
                className="text-[10px] font-bold px-2 py-1 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 flex items-center gap-1 transition-colors"
                title="撤销本段改写"
              >
                <Undo2 className="w-3 h-3" />
                撤销本段
              </button>
            </div>
          )}
        </div>
        <div className={`text-sm leading-relaxed ${
          isRewritten ? 'text-white' : 'text-slate-500'
        }`}>
          {showHighlight
            ? renderTextWithTerminologyHighlight(displayText, terminologyAnalysis)
            : <span className="whitespace-pre-wrap break-words">{displayText}</span>
          }
        </div>
      </div>
    </motion.div>
  );
}
