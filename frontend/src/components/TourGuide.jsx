import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, HelpCircle, Sparkles } from 'lucide-react';

const TOUR_STEPS = [
  {
    id: 'input',
    targetId: 'tour-text-input',
    title: '📝 文本输入区',
    description: '在这里粘贴或输入你的学术论文片段。支持直接键入、上传 PDF/DOCX/TXT 文件，也可切换到「逐段模式」精细控制每个段落。',
    placement: 'bottom',
  },
  {
    id: 'level',
    targetId: 'tour-rewrite-level',
    title: '⚙️ 改写级别选择',
    description: '三档改写强度任你选择：「轻微」仅修正表述，「中度」平衡改写幅度与原意，「深度」大幅重写以最大程度降低 AI 率。',
    placement: 'top',
  },
  {
    id: 'detect',
    targetId: 'tour-detect-btn',
    title: '🔍 检测与改写按钮',
    description: '点击「仅检测 AI 率」可先做 AIGC 概率评估；点击「一键人性化改写」则同时完成检测与改写，直接输出降重后的论文。',
    placement: 'top',
  },
  {
    id: 'result',
    targetId: 'tour-result-section',
    title: '📊 结果查看区',
    description: '检测与改写完成后，这里会显示完整分析报告：总体 AI 率、逐段检测详情、改写历史版本对比、章节风险分布等信息。',
    placement: 'top',
  },
  {
    id: 'export',
    targetId: 'tour-export-btn',
    title: '💾 导出功能',
    description: '改写完成后，点击「导出结果」按钮即可将当前版本的文本下载为 TXT 文件。也可在历史版本对比中切换不同版本后导出。',
    placement: 'bottom',
  },
];

function TourGuide({ isOpen, onClose, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlight, setHighlight] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0, width: 0 });
  const scrollRef = useRef(null);

  const step = TOUR_STEPS[currentStep];

  useLayoutEffect(() => {
    if (!isOpen || !step) return;

    const updatePosition = () => {
      const el = document.getElementById(step.targetId);
      if (!el) {
        setHighlight(null);
        setTooltipPos({ top: 200, left: window.innerWidth / 2 - 200, width: 400 });
        return;
      }

      const rect = el.getBoundingClientRect();
      const pad = 6;

      setHighlight({
        top: rect.top - pad + window.scrollY,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        radius: 16,
      });

      const tooltipWidth = 380;
      let top, left;

      if (step.placement === 'bottom') {
        top = rect.bottom + pad + 16 + window.scrollY;
        left = Math.max(
          16,
          Math.min(
            window.innerWidth - tooltipWidth - 16,
            rect.left + rect.width / 2 - tooltipWidth / 2
          )
        );
      } else {
        top = rect.top - pad - 16 - 180 + window.scrollY;
        if (top < window.scrollY + 16) {
          top = rect.bottom + pad + 16 + window.scrollY;
        }
        left = Math.max(
          16,
          Math.min(
            window.innerWidth - tooltipWidth - 16,
            rect.left + rect.width / 2 - tooltipWidth / 2
          )
        );
      }

      setTooltipPos({ top, left, width: tooltipWidth });

      const scrollMargin = 120;
      if (rect.top < scrollMargin || rect.bottom > window.innerHeight - scrollMargin) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    const timer = setTimeout(updatePosition, 300);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      clearTimeout(timer);
    };
  }, [isOpen, currentStep, step]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        handleSkip();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const handleFinish = () => {
    onComplete();
  };

  const isLast = currentStep === TOUR_STEPS.length - 1;
  const isFirst = currentStep === 0;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] pointer-events-auto"
        onClick={handleSkip}
      />

      {highlight && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="absolute pointer-events-none"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            borderRadius: highlight.radius,
            boxShadow:
              '0 0 0 4px rgba(99, 102, 241, 0.6), 0 0 40px rgba(99, 102, 241, 0.4), 0 0 80px rgba(99, 102, 241, 0.15)',
          }}
        />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className="absolute pointer-events-auto"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            width: tooltipPos.width,
          }}
        >
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl shadow-2xl shadow-indigo-500/10 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-white" />
                <span className="text-white text-xs font-bold tracking-wider uppercase">
                  新手引导 · Step {currentStep + 1} / {TOUR_STEPS.length}
                </span>
              </div>
              <button
                onClick={handleSkip}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-400" />
                {step.title}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                {step.description}
              </p>

              <div className="flex items-center justify-between mt-5">
                <div className="flex items-center gap-1.5">
                  {TOUR_STEPS.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-all ${
                        idx === currentStep
                          ? 'w-6 bg-indigo-500'
                          : idx < currentStep
                          ? 'w-1.5 bg-indigo-500/60'
                          : 'w-1.5 bg-slate-700'
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrev}
                    disabled={isFirst}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isFirst
                        ? 'text-slate-600 cursor-not-allowed'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700'
                    }`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    上一步
                  </button>

                  {isLast ? (
                    <button
                      onClick={handleFinish}
                      className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all"
                    >
                      完成 🎉
                    </button>
                  ) : (
                    <button
                      onClick={handleNext}
                      className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all"
                    >
                      下一步
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {!isLast && (
                <button
                  onClick={handleSkip}
                  className="w-full mt-3 text-[11px] text-slate-500 hover:text-slate-400 transition-colors text-center"
                >
                  跳过引导
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default TourGuide;
