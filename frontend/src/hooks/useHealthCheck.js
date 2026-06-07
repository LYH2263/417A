import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API_BASE = "http://localhost:8417/api";
const POLL_INTERVAL = 30000;
const MAX_FAILURES = 3;

export const SERVICE_LABELS = {
  api_connectivity: 'API 服务',
  ai_model: 'AI 检测模型',
  groq_api: 'Groq 改写引擎',
  disk_space: '磁盘空间',
  memory: '内存占用'
};

export const STATUS_META = {
  healthy:   { label: '正常',   color: 'text-emerald-400', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400', border: 'border-emerald-500/30' },
  degraded:  { label: '降级',   color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  dot: 'bg-yellow-400',  border: 'border-yellow-500/30' },
  down:      { label: '离线',   color: 'text-red-400',     bg: 'bg-red-500/10',     dot: 'bg-red-400',     border: 'border-red-500/30' }
};

export function useHealthCheck() {
  const [healthData, setHealthData] = useState(null);
  const [overallStatus, setOverallStatus] = useState('healthy');
  const [isOffline, setIsOffline] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [lastCheck, setLastCheck] = useState(null);
  const [toasts, setToasts] = useState([]);

  const pollTimerRef = useRef(null);
  const prevStatusRef = useRef({});
  const prevOverallRef = useRef('healthy');

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/health`, { timeout: 10000 });
      const data = response.data;

      setHealthData(data);
      setOverallStatus(data.overall_status);
      setLastCheck(Date.now());

      const prevServices = prevStatusRef.current || {};
      const currentServices = data.services || {};

      Object.keys(currentServices).forEach(key => {
        const prev = prevServices[key]?.status;
        const curr = currentServices[key]?.status;
        const label = SERVICE_LABELS[key] || key;

        if (prev && prev !== curr) {
          if (curr === 'healthy') {
            addToast({
              type: 'success',
              title: `${label}已恢复`,
              message: `服务状态：${STATUS_META[curr].label}`
            });
          } else if (curr === 'degraded') {
            addToast({
              type: 'warning',
              title: `${label}性能降级`,
              message: currentServices[key]?.details?.note || currentServices[key]?.details?.error || '请关注服务状态'
            });
          } else if (curr === 'down') {
            addToast({
              type: 'error',
              title: `${label}已离线`,
              message: currentServices[key]?.details?.error || '服务暂时不可用'
            });
          }
        }
      });

      if (prevOverallRef.current !== data.overall_status) {
        if (data.overall_status === 'healthy' && prevOverallRef.current !== 'healthy') {
          addToast({
            type: 'success',
            title: '系统已恢复正常',
            message: '所有服务均运行正常'
          });
        }
      }

      prevStatusRef.current = currentServices;
      prevOverallRef.current = data.overall_status;

      if (consecutiveFailures > 0) {
        if (isOffline) {
          setIsReconnecting(true);
          setTimeout(() => setIsReconnecting(false), 1500);
        }
        setConsecutiveFailures(0);
      }
      setIsOffline(false);

      return data;
    } catch (err) {
      const newFailures = consecutiveFailures + 1;
      setConsecutiveFailures(newFailures);

      if (newFailures >= MAX_FAILURES && !isOffline) {
        setIsOffline(true);
        setOverallStatus('down');
        addToast({
          type: 'error',
          title: '已进入离线模式',
          message: '连续 3 次无法连接后端，需联网的功能已暂时禁用'
        });
      } else if (isOffline) {
        setIsReconnecting(true);
        setTimeout(() => setIsReconnecting(false), 1500);
      }

      return null;
    }
  }, [consecutiveFailures, isOffline, addToast]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }
    pollTimerRef.current = setInterval(checkHealth, POLL_INTERVAL);
  }, [checkHealth]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const forceReconnect = useCallback(() => {
    setIsReconnecting(true);
    checkHealth().finally(() => {
      setTimeout(() => setIsReconnecting(false), 1000);
    });
  }, [checkHealth]);

  useEffect(() => {
    checkHealth();
    startPolling();

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        checkHealth();
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return {
    healthData,
    overallStatus,
    isOffline,
    isReconnecting,
    consecutiveFailures,
    lastCheck,
    toasts,
    removeToast,
    forceReconnect,
    checkHealth
  };
}
