import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import {
  BarChart3, PieChart as PieIcon, TrendingUp, Calendar, RefreshCw,
  AlertCircle, FileText, ShieldCheck, Zap, X, Clock
} from 'lucide-react';

const API_BASE = "http://localhost:8417/api";

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

const REWRITE_LEVEL_LABELS = {
  low: '轻微改写',
  medium: '中度改写',
  high: '深度改写',
};

const TIME_RANGES = [
  { key: 7, label: '近 7 天' },
  { key: 30, label: '近 30 天' },
  { key: null, label: '全部' },
];

function ChartSkeleton() {
  return (
    <div className="w-full h-[320px] bg-slate-900/40 rounded-2xl border border-slate-800 overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-r from-slate-800/0 via-slate-700/30 to-slate-800/0 animate-pulse" />
      <div className="p-5 h-full flex flex-col">
        <div className="h-4 w-32 bg-slate-700/60 rounded mb-4" />
        <div className="flex-1 flex items-end gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-slate-700/50 rounded-t"
              style={{ height: `${20 + Math.random() * 70}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onGoDetect }) {
  return (
    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
      <div className="w-20 h-20 rounded-3xl bg-slate-800/60 border border-slate-700 flex items-center justify-center mb-6">
        <Clock className="w-10 h-10 text-slate-600" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">暂无检测历史</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-6">
        开始使用检测或改写功能后，这里将展示你的 AI 率变化趋势、改写级别分布与使用统计。
      </p>
      <button
        onClick={onGoDetect}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-500/20"
      >
        <ShieldCheck className="w-4 h-4" />
        立即开始检测
      </button>
    </div>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div className="col-span-full py-16 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-red-400" />
      </div>
      <h3 className="text-lg font-bold text-white mb-1">加载历史数据失败</h3>
      <p className="text-sm text-slate-400 mb-5">网络错误或后端服务异常，请稍后重试。</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium text-sm border border-slate-700 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        重新加载
      </button>
    </div>
  );
}

function formatDateTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${hh}:${mm}`;
  } catch {
    return '';
  }
}

function formatDate(iso) {
  if (!iso) return '';
  return iso;
}

const CustomTooltip = ({ active, payload, label, type }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-slate-950/95 border border-slate-700 rounded-xl px-3 py-2.5 shadow-2xl text-xs backdrop-blur">
      {type === 'trend' && (
        <>
          <p className="text-slate-400 mb-1.5">{formatDateTime(label)}</p>
          {payload.map((p, i) => (
            <p key={i} className="flex items-center gap-2 mb-0.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: p.color }}
              />
              <span className="text-slate-300">{p.name}:</span>
              <span className="text-white font-bold">{p.value?.toFixed?.(1) ?? p.value}%</span>
            </p>
          ))}
        </>
      )}
      {type === 'daily' && (
        <>
          <p className="text-slate-400 mb-1">{formatDate(label)}</p>
          <p className="text-white font-bold">使用 {payload[0]?.value} 次</p>
        </>
      )}
      {type === 'pie' && (
        <>
          <p className="text-white font-bold mb-0.5">
            {REWRITE_LEVEL_LABELS[payload[0]?.name] ?? payload[0]?.name}
          </p>
          <p className="text-slate-300">
            {payload[0]?.value} 次 · {payload[0]?.payload?.percent
              ? `${(payload[0].payload.percent * 100).toFixed(0)}%`
              : ''}
          </p>
        </>
      )}
    </div>
  );
};

export default function HistoryDashboard({ isOpen, onClose, onGoDetect }) {
  const [timeRange, setTimeRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const hasData = stats && (
    (stats.trend && stats.trend.length > 0) ||
    (stats.distribution && stats.distribution.length > 0) ||
    (stats.daily_usage && stats.daily_usage.length > 0)
  );

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = timeRange !== null ? { days: timeRange } : {};
      const res = await axios.get(`${API_BASE}/history/stats`, { params, timeout: 10000 });
      setStats(res.data);
    } catch (err) {
      setError(err.message || '加载失败');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    if (isOpen) {
      fetchStats();
    }
  }, [isOpen, fetchStats]);

  if (!isOpen) return null;

  const trendData = (stats?.trend || []).map((r, i) => ({
    ...r,
    index: i + 1,
    timeLabel: r.created_at || r.timestamp,
  }));

  const pieData = (stats?.distribution || []).map((d, i, arr) => {
    const total = arr.reduce((s, x) => s + (x.count || 0), 0) || 1;
    return {
      name: d.level,
      value: d.count || 0,
      percent: (d.count || 0) / total,
      fill: PIE_COLORS[i % PIE_COLORS.length],
    };
  });

  const dailyData = (stats?.daily_usage || []).map(d => ({
    ...d,
    dateLabel: d.date,
  }));

  const totalOperations = trendData.length;
  const avgOriginalScore = totalOperations > 0
    ? (trendData.reduce((s, r) => s + (r.original_ai_score ?? 0), 0) / totalOperations).toFixed(1)
    : '0.0';
  const avgRewrittenScore = trendData.filter(r => r.rewritten_ai_score !== null && r.rewritten_ai_score !== undefined).length > 0
    ? (trendData
        .filter(r => r.rewritten_ai_score !== null && r.rewritten_ai_score !== undefined)
        .reduce((s, r) => s + r.rewritten_ai_score, 0) /
        trendData.filter(r => r.rewritten_ai_score !== null && r.rewritten_ai_score !== undefined).length
      ).toFixed(1)
    : '0.0';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#0f172a] border border-slate-800 rounded-3xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">我的检测历史</h2>
                <p className="text-xs text-slate-400">AI 率趋势 · 改写偏好 · 使用统计</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                {TIME_RANGES.map(range => (
                  <button
                    key={String(range.key)}
                    onClick={() => setTimeRange(range.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                      timeRange === range.key
                        ? 'bg-indigo-600 text-white shadow shadow-indigo-500/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {range.label}
                  </button>
                ))}
              </div>
              <button
                onClick={fetchStats}
                disabled={loading}
                className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                title="刷新数据"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {!loading && !error && hasData && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    总操作次数
                  </div>
                  <p className="text-2xl font-black text-white">{totalOperations}</p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    平均原文 AI 率
                  </div>
                  <p className="text-2xl font-black text-amber-400">{avgOriginalScore}%</p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    平均改写后 AI 率
                  </div>
                  <p className="text-2xl font-black text-emerald-400">{avgRewrittenScore}%</p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    活跃天数
                  </div>
                  <p className="text-2xl font-black text-indigo-400">{dailyData.length}</p>
                </div>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartSkeleton />
                <ChartSkeleton />
                <ChartSkeleton className="lg:col-span-2" />
              </div>
            ) : error ? (
              <ErrorState onRetry={fetchStats} />
            ) : !hasData ? (
              <EmptyState onGoDetect={() => { onClose(); onGoDetect?.(); }} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">AI 率变化趋势</h3>
                    <span className="ml-auto text-[10px] text-slate-500">按检测顺序</span>
                  </div>
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="timeLabel"
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          tickFormatter={(v) => formatDateTime(v)}
                          interval="preserveStartEnd"
                          stroke="#334155"
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          tickFormatter={(v) => `${v}%`}
                          stroke="#334155"
                        />
                        <Tooltip content={<CustomTooltip type="trend" />} />
                        <Legend
                          iconType="circle"
                          wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }}
                          formatter={(value) => (
                            <span className="text-slate-300">{value}</span>
                          )}
                        />
                        <Line
                          type="monotone"
                          dataKey="original_ai_score"
                          name="原文 AI 率"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: '#f59e0b', stroke: '#0f172a', strokeWidth: 2 }}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="rewritten_ai_score"
                          name="改写后 AI 率"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: '#10b981', stroke: '#0f172a', strokeWidth: 2 }}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <PieIcon className="w-4 h-4 text-purple-400" />
                    <h3 className="text-sm font-bold text-white">改写级别使用分布</h3>
                  </div>
                  {pieData.length > 0 ? (
                    <div className="w-full h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="#0f172a"
                            strokeWidth={3}
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip type="pie" />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-3 justify-center mt-2">
                        {pieData.map((d, i) => (
                          <div key={d.name} className="flex items-center gap-1.5 text-xs">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-slate-300">
                              {REWRITE_LEVEL_LABELS[d.name] ?? d.name}
                            </span>
                            <span className="text-slate-500">({d.value})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-center">
                      <div>
                        <PieIcon className="w-10 h-10 text-slate-700 mx-auto mb-2 opacity-50" />
                        <p className="text-xs text-slate-500">暂无可统计的改写记录</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 lg:col-span-2">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">每日使用次数</h3>
                    <span className="ml-auto text-[10px] text-slate-500">按日期统计</span>
                  </div>
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis
                          dataKey="dateLabel"
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          interval="preserveStartEnd"
                          stroke="#334155"
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          stroke="#334155"
                        />
                        <Tooltip content={<CustomTooltip type="daily" />} cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }} />
                        <Bar
                          dataKey="count"
                          name="使用次数"
                          fill="url(#barGradient)"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={40}
                        />
                        <defs>
                          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="100%" stopColor="#06b6d4" />
                          </linearGradient>
                        </defs>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
