import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Check, Zap, ArrowUp, Wrench } from 'lucide-react';
import changelogData from '../data/changelog.json';

const TYPE_META = {
  new: {
    icon: Sparkles,
    label: '新功能',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  improvement: {
    icon: ArrowUp,
    label: '优化',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
  },
  fix: {
    icon: Wrench,
    label: '修复',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
};

function ChangelogModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const latest = changelogData[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.25 }}
            className="relative w-full max-w-2xl max-h-[85vh] bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 px-6 py-5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    功能更新日志
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30">
                      v{latest.version}
                    </span>
                  </h2>
                  <p className="text-xs text-white/70">
                    {latest.date} · {latest.title}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/90 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6 pr-2">
              {changelogData.map((release, releaseIdx) => {
                const isLatest = releaseIdx === 0;
                return (
                  <div
                    key={release.version}
                    className={`relative ${
                      releaseIdx < changelogData.length - 1
                        ? 'pb-6 border-b border-slate-800'
                        : ''
                    }`}
                  >
                    {isLatest && (
                      <div className="absolute -left-2 -top-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-[9px] font-black text-white uppercase tracking-wider shadow-lg shadow-indigo-500/30">
                        NEW
                      </div>
                    )}

                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                        <span className="text-xs font-black text-indigo-400">
                          {release.version.split('.')[0]}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          v{release.version}
                          <span className="text-[10px] font-medium text-slate-500">
                            {release.date}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400">{release.title}</p>
                      </div>
                    </div>

                    <ul className="space-y-2 ml-12">
                      {release.changes.map((change, changeIdx) => {
                        const meta = TYPE_META[change.type] || TYPE_META.new;
                        const Icon = meta.icon;
                        return (
                          <li
                            key={changeIdx}
                            className="flex items-start gap-2.5"
                          >
                            <span
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${meta.bg} ${meta.border} border flex-shrink-0 mt-0.5`}
                            >
                              <Icon
                                className={`w-2.5 h-2.5 ${meta.color}`}
                              />
                              <span
                                className={`text-[8px] font-black uppercase ${meta.color}`}
                              >
                                {meta.label}
                              </span>
                            </span>
                            <span className="text-xs text-slate-300 leading-relaxed">
                              {change.text}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="flex-shrink-0 border-t border-slate-800 px-6 py-4 bg-slate-950/50 flex items-center justify-between">
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Check className="w-3 h-3 text-emerald-500" />
                感谢你的持续支持！
              </p>
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all"
              >
                开始使用
                <Zap className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ChangelogModal;
