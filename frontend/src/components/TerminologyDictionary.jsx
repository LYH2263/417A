import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Plus, X, Edit2, Trash2, Search, Upload,
  Download, Filter, Save, AlertCircle, CheckCircle, RefreshCw,
  FileText, Tag, Info, ChevronDown
} from 'lucide-react';

const API_BASE = "http://localhost:8417/api";

const CATEGORY_COLORS = {
  "人名": { bg: 'bg-pink-500/15', text: 'text-pink-400', border: 'border-pink-500/30' },
  "机构名": { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  "专有名词": { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  "公式符号": { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  "化学术语": { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/30' },
  "医学术语": { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  "法律术语": { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  "其他": { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
};

const DEFAULT_CATEGORY = "专有名词";

function CategoryBadge({ category }) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS["其他"];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
      <Tag className="w-2.5 h-2.5" />
      {category}
    </span>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center text-center">
      <div className="w-20 h-20 rounded-3xl bg-slate-800/60 border border-slate-700 flex items-center justify-center mb-5">
        <BookOpen className="w-10 h-10 text-slate-600" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">暂无自定义术语</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-5">
        添加需要保护的专业术语和短语，改写时系统将自动保留这些术语不被修改。
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-500/20"
      >
        <Plus className="w-4 h-4" />
        添加第一个术语
      </button>
    </div>
  );
}

function Toast({ type, message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = type === 'success'
    ? { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: CheckCircle }
    : { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: AlertCircle };
  const Icon = colors.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`absolute top-4 right-4 z-50 px-4 py-2.5 rounded-xl ${colors.bg} border ${colors.border} flex items-center gap-2`}
    >
      <Icon className={`w-4 h-4 ${colors.text}`} />
      <span className={`text-sm font-medium ${colors.text}`}>{message}</span>
    </motion.div>
  );
}

export default function TerminologyDictionary({ isOpen, onClose, onTermsChange }) {
  const [terms, setTerms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);
  const [formData, setFormData] = useState({ term: '', category: DEFAULT_CATEGORY, description: '' });
  const [toast, setToast] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const showToast = (type, message) => {
    setToast({ type, message });
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [termsRes, catRes] = await Promise.all([
        axios.get(`${API_BASE}/terminology`, { params: { category: filterCategory, search: searchQuery || undefined } }),
        axios.get(`${API_BASE}/terminology/categories`)
      ]);
      setTerms(termsRes.data.items || []);
      setCategories(catRes.data.categories || []);
    } catch (err) {
      showToast('error', '加载术语列表失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, searchQuery]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const handleOpenAddForm = () => {
    setEditingTerm(null);
    setFormData({ term: '', category: DEFAULT_CATEGORY, description: '' });
    setShowForm(true);
  };

  const handleOpenEditForm = (term) => {
    setEditingTerm(term);
    setFormData({
      term: term.term,
      category: term.category || DEFAULT_CATEGORY,
      description: term.description || ''
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formData.term.trim()) {
      showToast('error', '术语内容不能为空');
      return;
    }
    try {
      if (editingTerm) {
        await axios.put(`${API_BASE}/terminology/${editingTerm.id}`, formData);
        showToast('success', '术语已更新');
      } else {
        await axios.post(`${API_BASE}/terminology`, formData);
        showToast('success', '术语已添加');
      }
      setShowForm(false);
      setEditingTerm(null);
      loadData();
      onTermsChange && onTermsChange();
    } catch (err) {
      showToast('error', err.response?.data?.detail || '操作失败');
    }
  };

  const handleDelete = async (termId) => {
    if (!window.confirm('确定要删除这个术语吗？')) return;
    try {
      await axios.delete(`${API_BASE}/terminology/${termId}`);
      showToast('success', '术语已删除');
      loadData();
      onTermsChange && onTermsChange();
    } catch (err) {
      showToast('error', '删除失败');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result || '';
      setImportText(text);
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) {
      setImportPreview([]);
      return;
    }
    let startIdx = 0;
    if (lines.length > 0) {
      const firstLine = lines[0].toLowerCase();
      if (firstLine.startsWith('term') || firstLine.startsWith('术语') || firstLine.includes('category') || firstLine.includes('类别')) {
        startIdx = 1;
      }
    }
    const preview = [];
    for (let i = startIdx; i < lines.length && preview.length < 50; i++) {
      const line = lines[i];
      const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      if (parts.length > 0 && parts[0]) {
        preview.push({
          term: parts[0] || '',
          category: parts[1] || DEFAULT_CATEGORY,
          description: parts.slice(2).join(',') || ''
        });
      }
    }
    setImportPreview(preview);
  };

  const handleImportConfirm = async () => {
    if (importPreview.length === 0) {
      showToast('error', '没有可导入的数据');
      return;
    }
    try {
      const res = await axios.post(`${API_BASE}/terminology/bulk-import`, { items: importPreview });
      setImportResult({
        created: res.data.created || 0,
        updated: res.data.updated || 0,
        skipped: res.data.skipped || 0,
        errors: res.data.errors || [],
        total: importPreview.length
      });
      showToast('success', `导入完成：新增${res.data.created || 0}个，更新${res.data.updated || 0}个`);
      loadData();
      onTermsChange && onTermsChange();
    } catch (err) {
      setImportResult({
        error: err.response?.data?.detail || err.message || '导入失败',
        total: importPreview.length
      });
      showToast('error', '导入失败');
    }
  };

  const handleExportTemplate = () => {
    const csv = 'term,category,description\n示例术语,专有名词,这是一个示例描述\nJohn Smith,人名,作者姓名\n';
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'terminology_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-5xl max-h-[90vh] bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {toast && (
            <Toast
              type={toast.type}
              message={toast.message}
              onClose={() => setToast(null)}
            />
          )}

          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">我的术语词典</h2>
                <p className="text-xs text-slate-400">管理需要保护的专业术语，改写时将自动锁定</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="搜索术语..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div className="relative">
              <select
                value={filterCategory || ''}
                onChange={(e) => setFilterCategory(e.target.value || null)}
                className="appearance-none pl-10 pr-8 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none cursor-pointer"
              >
                <option value="">全部类别</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
            <div className="flex-1" />
            <span className="text-xs text-slate-400">
              共 <span className="text-white font-bold">{terms.length}</span> 个术语
            </span>
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium border border-slate-700 transition-all"
            >
              <Upload className="w-4 h-4" />
              批量导入
            </button>
            <button
              onClick={handleOpenAddForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              添加术语
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 bg-slate-800/40 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : terms.length === 0 ? (
              <EmptyState onAdd={handleOpenAddForm} />
            ) : (
              <div className="space-y-2">
                {terms.map((term) => (
                  <motion.div
                    key={term.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group flex items-start gap-4 p-4 bg-slate-900/60 border border-slate-800 rounded-2xl hover:border-indigo-500/30 hover:bg-slate-900/80 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                        <span className="text-base font-bold text-white">{term.term}</span>
                        <CategoryBadge category={term.category} />
                      </div>
                      {term.description && (
                        <p className="text-xs text-slate-400 leading-relaxed">{term.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpenEditForm(term)}
                        className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-indigo-600/20 border border-slate-700 hover:border-indigo-500/40 flex items-center justify-center text-slate-400 hover:text-indigo-400 transition-all"
                        title="编辑"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(term.id)}
                        className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-red-600/20 border border-slate-700 hover:border-red-500/40 flex items-center justify-center text-slate-400 hover:text-red-400 transition-all"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-20 overflow-y-auto"
                onClick={() => { setShowForm(false); setEditingTerm(null); }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-6 my-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-white">
                      {editingTerm ? '编辑术语' : '添加术语'}
                    </h3>
                    <button
                      onClick={() => { setShowForm(false); setEditingTerm(null); }}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        术语内容 <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.term}
                        onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                        placeholder="例如：Transformer、John Smith、E=mc²"
                        className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        类别
                      </label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      >
                        {categories.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        描述（可选）
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="对术语的简短说明..."
                        rows={3}
                        className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => { setShowForm(false); setEditingTerm(null); }}
                      className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium border border-slate-700 transition-all"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSubmit}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all"
                    >
                      <Save className="w-4 h-4" />
                      {editingTerm ? '保存修改' : '添加'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showImport && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-20 overflow-y-auto"
                onClick={() => { setShowImport(false); setImportPreview([]); setImportText(''); setImportResult(null); }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-2xl bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-6 my-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-white">批量导入术语</h3>
                    <button
                      onClick={() => { setShowImport(false); setImportPreview([]); setImportText(''); setImportResult(null); }}
                      className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {importResult ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        <div className={`p-5 rounded-2xl border ${
                          importResult.error
                            ? 'bg-red-500/5 border-red-500/30'
                            : 'bg-emerald-500/5 border-emerald-500/30'
                        }`}>
                          <div className="flex items-center gap-3 mb-4">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                              importResult.error ? 'bg-red-500/20' : 'bg-emerald-500/20'
                            }`}>
                              {importResult.error ? (
                                <AlertCircle className="w-5 h-5 text-red-400" />
                              ) : (
                                <CheckCircle className="w-5 h-5 text-emerald-400" />
                              )}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white">
                                {importResult.error ? '导入失败' : '导入完成'}
                              </h4>
                              <p className="text-xs text-slate-400">
                                {importResult.error ? importResult.error : `共处理 ${importResult.total} 条数据`}
                              </p>
                            </div>
                          </div>

                          {!importResult.error && (
                            <div className="grid grid-cols-3 gap-3">
                              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-center">
                                <p className="text-2xl font-black text-emerald-400 mb-0.5">{importResult.created}</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider">新增</p>
                              </div>
                              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-center">
                                <p className="text-2xl font-black text-indigo-400 mb-0.5">{importResult.updated}</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider">更新</p>
                              </div>
                              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-center">
                                <p className="text-2xl font-black text-slate-400 mb-0.5">{importResult.skipped}</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider">跳过</p>
                              </div>
                            </div>
                          )}

                          {importResult.errors && importResult.errors.length > 0 && (
                            <div className="mt-4">
                              <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2">错误详情（{importResult.errors.length}）</p>
                              <div className="max-h-24 overflow-y-auto space-y-1">
                                {importResult.errors.slice(0, 5).map((err, i) => (
                                  <p key={i} className="text-[11px] text-red-300/80">· {err}</p>
                                ))}
                                {importResult.errors.length > 5 && (
                                  <p className="text-[11px] text-slate-500">...还有 {importResult.errors.length - 5} 条错误</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ) : (
                      <>
                        <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                            <div className="text-xs text-slate-300 space-y-1">
                              <p>支持 CSV 格式，每行格式：<code className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300">术语,类别,描述</code></p>
                              <p>类别可选值：人名、机构名、专有名词、公式符号、化学术语、医学术语、法律术语、其他</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={handleExportTemplate}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium border border-slate-700 transition-all"
                          >
                            <Download className="w-4 h-4" />
                            下载模板
                          </button>
                          <div className="relative flex-1">
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept=".csv"
                              onChange={handleFileSelect}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <button className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/20 transition-all">
                              <Upload className="w-4 h-4" />
                              选择 CSV 文件
                            </button>
                          </div>
                        </div>

                        {importPreview.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                预览（{importPreview.length} 条）
                              </span>
                            </div>
                            <div className="max-h-60 overflow-y-auto border border-slate-700 rounded-xl divide-y divide-slate-800">
                              {importPreview.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-3 bg-slate-900/60">
                                  <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-white truncate">{item.term}</span>
                                      <CategoryBadge category={item.category} />
                                    </div>
                                    {item.description && (
                                      <p className="text-xs text-slate-500 truncate">{item.description}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex gap-3 mt-6">
                    {importResult ? (
                      <>
                        <button
                          onClick={() => {
                            setImportResult(null);
                            setImportPreview([]);
                            setImportText('');
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium border border-slate-700 transition-all"
                        >
                          继续导入
                        </button>
                        <button
                          onClick={() => { setShowImport(false); setImportPreview([]); setImportText(''); setImportResult(null); }}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all"
                        >
                          <CheckCircle className="w-4 h-4" />
                          完成
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setShowImport(false); setImportPreview([]); setImportText(''); setImportResult(null); }}
                          className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium border border-slate-700 transition-all"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleImportConfirm}
                          disabled={importPreview.length === 0}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 disabled:shadow-none transition-all"
                        >
                          <Upload className="w-4 h-4" />
                          确认导入
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
