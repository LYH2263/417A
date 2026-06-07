import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Wifi, WifiOff, Cpu, HardDrive, Activity, Database, ChevronDown, RefreshCw, Clock } from 'lucide-react';
import { SERVICE_LABELS, STATUS_META } from '../hooks/useHealthCheck';

const SERVICE_ICONS = {
  api_connectivity: Server,
  ai_model: Cpu,
  groq_api: Wifi,
  disk_space: HardDrive,
  memory: Database
};

function StatusDot({ status, isReconnecting }) {
  const meta = STATUS_META[status] || STATUS_META.down;
  return (
    <div className="relative">
      <motion.div
        animate={isReconnecting ? { rotate: 360 } : {}}
        transition={isReconnecting ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
        className={`w-3 h-3 rounded-full ${meta.dot} shadow-lg ${
          status === 'healthy' ? 'shadow-emerald-500/50' :
          status === 'degraded' ? 'shadow-yellow-500/50' :
          'shadow-red-500/50'
        }`}
      />
      {status === 'healthy' && !isReconnecting && (
        <motion.div
          className={`absolute inset-0 rounded-full ${meta.dot} opacity-40`}
          animate={{ scale: [1, 2.2], opacity: [0.4, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      {isReconnecting && (
        <RefreshCw className="absolute -inset-0.5 w-4 h-4 text-indigo-400 animate-spin" />
      )}
    </div>
  );
}

function ServiceRow({ serviceKey, serviceData }) {
  const Icon = SERVICE_ICONS[serviceKey] || Activity;
  const meta = STATUS_META[serviceData.status] || STATUS_META.down;
  const label = SERVICE_LABELS[serviceKey] || serviceKey;
  const details = serviceData.details || {};

  const [expanded, setExpanded] = useState(false);

  const renderDetailValue = (key, value) => {
    if (typeof value === 'boolean') {
      return value ? '是' : '否';
    }
    if (typeof value === 'number') {
      if (key.includes('percent') || key.includes('_pct')) {
        return `${value.toFixed(1)}%`;
      }
      if (key.includes('gb')) {
        return `${value.toFixed(2)} GB`;
      }
      if (key.includes('ms')) {
        return `${value} ms`;
      }
      if (key.includes('seconds')) {
        const s = value;
        if (s < 60) return `${Math.round(s)} 秒`;
        if (s < 3600) return `${Math.round(s / 60)} 分钟`;
        return `${(s / 3600).toFixed(1)} 小时`;
      }
      return value.toString();
    }
    return String(value);
  };

  const detailKeys = Object.keys(details).filter(k => !['error', 'note'].includes(k));
  const hasError = details.error;
  const hasNote = details.note;

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        <div className={`w-7 h-7 rounded-lg bg-slate-900/60 flex items-center justify-center ${meta.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{label}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>
              {meta.label}
            </span>
          </div>
          {(hasError || hasNote) && !expanded && (
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {hasError || hasNote}
            </p>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-slate-800/50">
              {hasError && (
                <p className="text-[11px] text-red-400 mb-2 flex items-start gap-1.5">
                  <span className="font-bold">错误：</span>
                  <span className="flex-1">{details.error}</span>
                </p>
              )}
              {hasNote && (
                <p className="text-[11px] text-yellow-300/80 mb-2 flex items-start gap-1.5">
                  <span className="font-bold">提示：</span>
                  <span className="flex-1">{details.note}</span>
                </p>
              )}
              {detailKeys.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5">
                  {detailKeys.map(key => (
                    <div key={key} className="flex justify-between gap-2 text-[11px]">
                      <span className="text-slate-500">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="text-slate-300 font-mono">
                        {renderDetailValue(key, details[key])}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SystemStatusIndicator({
  overallStatus,
  healthData,
  isOffline,
  isReconnecting,
  lastCheck,
  consecutiveFailures,
  onForceReconnect
}) {
  const [panelOpen, setPanelOpen] = useState(false);

  const displayStatus = isOffline ? 'down' : overallStatus;
  const meta = STATUS_META[displayStatus] || STATUS_META.down;

  const formatLastCheck = () => {
    if (!lastCheck) return '从未检查';
    const diff = Math.floor((Date.now() - lastCheck) / 1000);
    if (diff < 5) return '刚刚';
    if (diff < 60) return `${diff} 秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    return `${Math.floor(diff / 3600)} 小时前`;
  };

  const overallLabel = isOffline
    ? '离线模式'
    : displayStatus === 'healthy'
      ? '系统正常'
      : displayStatus === 'degraded'
        ? '部分降级'
        : '系统异常';

  return (
    <>
      {isOffline && (
        <motion.div
          initial={{ y: -60 }}
          animate={{ y: 0 }}
          className="fixed top-0 left-0 right-0 z-[100] bg-red-600/90 backdrop-blur-sm border-b border-red-500/50 px-4 py-2 text-center"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 text-sm">
            <WifiOff className="w-4 h-4 text-white" />
            <span className="font-bold text-white">当前处于离线模式</span>
            <span className="text-red-100/80 text-xs">连续 {consecutiveFailures} 次无法连接后端，检测与改写功能已禁用</span>
            <button
              onClick={onForceReconnect}
              className="ml-2 px-3 py-1 rounded-md bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-colors flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isReconnecting ? 'animate-spin' : ''}`} />
              立即重连
            </button>
          </div>
        </motion.div>
      )}

      <div className="relative">
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all hover:bg-slate-700/50 ${meta.border} ${meta.bg}`}
          title={overallLabel}
        >
          <StatusDot status={displayStatus} isReconnecting={isReconnecting} />
          <span className={`text-xs font-bold ${meta.color}`}>
            {overallLabel}
          </span>
          <ChevronDown className={`w-3 h-3 ${meta.color} transition-transform ${panelOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {panelOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40"
                onClick={() => setPanelOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="absolute right-0 mt-2 w-[340px] bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
              >
                <div className={`px-4 py-3 border-b ${meta.border} ${meta.bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <StatusDot status={displayStatus} isReconnecting={isReconnecting} />
                      <div>
                        <p className="text-sm font-bold text-white">{overallLabel}</p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          上次检查：{formatLastCheck()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onForceReconnect();
                      }}
                      disabled={isReconnecting}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all disabled:opacity-50"
                      title="立即刷新状态"
                    >
                      <RefreshCw className={`w-4 h-4 ${isReconnecting ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="p-3 space-y-2 max-h-[420px] overflow-y-auto">
                  {healthData?.services ? (
                    Object.entries(healthData.services).map(([key, data]) => (
                      <ServiceRow key={key} serviceKey={key} serviceData={data} />
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-xs">暂无健康状态数据</p>
                    </div>
                  )}
                </div>

                <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">
                    每 30 秒自动刷新
                  </span>
                  {consecutiveFailures > 0 && !isOffline && (
                    <span className="text-[10px] text-amber-400 font-bold">
                      连接失败：{consecutiveFailures}/3
                    </span>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
