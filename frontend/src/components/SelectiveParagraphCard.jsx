import React from 'react';
import { motion } from 'framer-motion';
import { GripVertical, CheckSquare, Square, Lock, Unlock } from 'lucide-react';

export default function SelectiveParagraphCard({
  para,
  index,
  aiScore,
  recommendation,
  isDragging,
  onToggleSelect,
  onToggleLock,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}) {
  let borderClass = 'border-slate-700';
  let bgClass = 'bg-slate-900/50';
  let badge = null;

  if (para.locked) {
    borderClass = 'border-slate-600';
    bgClass = 'bg-slate-900/70';
  } else if (recommendation === 'suggest') {
    borderClass = 'border-orange-500/50';
    bgClass = 'bg-orange-500/5';
    badge = (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
        建议改写
      </span>
    );
  } else if (recommendation === 'safe') {
    borderClass = 'border-emerald-500/50';
    bgClass = 'bg-emerald-500/5';
    badge = (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        安全段落
      </span>
    );
  }

  return (
    <motion.div
      layout
      draggable={!para.locked}
      onDragStart={(e) => onDragStart && onDragStart(e, index)}
      onDragOver={(e) => onDragOver && onDragOver(e, index)}
      onDrop={(e) => onDrop && onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`rounded-2xl p-3 border transition-all relative ${bgClass} ${borderClass} ${
        isDragging ? 'opacity-50 scale-[0.98]' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center gap-2 pt-1">
          <div
            className={`cursor-move text-slate-500 hover:text-slate-300 transition-colors ${
              para.locked ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            title="拖拽排序"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <button
            onClick={() => !para.locked && onToggleSelect && onToggleSelect(index)}
            disabled={para.locked}
            className={`transition-colors ${
              para.locked ? 'opacity-30 cursor-not-allowed text-slate-500'
                : para.selected ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
            }`}
            title={para.selected ? '取消选中' : '选中参与改写'}
          >
            {para.selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onToggleLock && onToggleLock(index)}
            className={`transition-colors ${
              para.locked ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
            }`}
            title={para.locked ? '解锁段落' : '锁定段落（不参与改写）'}
          >
            {para.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                段落 {index + 1}
              </span>
              {badge}
              {aiScore !== undefined && aiScore !== null && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  aiScore > 60 ? 'bg-red-500/10 text-red-400' :
                  aiScore > 20 ? 'bg-yellow-500/10 text-yellow-400' :
                  'bg-emerald-500/10 text-emerald-400'
                }`}>
                  AI率 {aiScore}%
                </span>
              )}
            </div>
          </div>
          <p className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${
            para.locked ? 'text-slate-500' : 'text-slate-300'
          }`}>
            {para.text}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
