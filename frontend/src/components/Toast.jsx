import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const TOAST_ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info
};

const TOAST_STYLES = {
  success: {
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/40',
    icon: 'text-emerald-400',
    title: 'text-emerald-300',
    message: 'text-emerald-200/70'
  },
  warning: {
    bg: 'bg-yellow-500/15',
    border: 'border-yellow-500/40',
    icon: 'text-yellow-400',
    title: 'text-yellow-300',
    message: 'text-yellow-200/70'
  },
  error: {
    bg: 'bg-red-500/15',
    border: 'border-red-500/40',
    icon: 'text-red-400',
    title: 'text-red-300',
    message: 'text-red-200/70'
  },
  info: {
    bg: 'bg-indigo-500/15',
    border: 'border-indigo-500/40',
    icon: 'text-indigo-400',
    title: 'text-indigo-300',
    message: 'text-indigo-200/70'
  }
};

export function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = TOAST_ICONS[toast.type] || TOAST_ICONS.info;
          const styles = TOAST_STYLES[toast.type] || TOAST_STYLES.info;

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`pointer-events-auto ${styles.bg} ${styles.border} border backdrop-blur-xl rounded-xl px-4 py-3 shadow-2xl min-w-[280px] max-w-[360px]`}
            >
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 mt-0.5 ${styles.icon}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${styles.title}`}>
                    {toast.title}
                  </p>
                  {toast.message && (
                    <p className={`text-xs mt-1 leading-relaxed ${styles.message}`}>
                      {toast.message}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onRemove(toast.id)}
                  className="flex-shrink-0 text-slate-500 hover:text-white transition-colors ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
