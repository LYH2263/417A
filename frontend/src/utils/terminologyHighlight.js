import React from 'react';

const TERM_CATEGORY_COLORS = {
  "人名": {
    preserved: 'bg-pink-500/20 border-pink-500/50 text-pink-200',
    modified: 'bg-red-500/30 border-red-500/60 text-red-200'
  },
  "机构名": {
    preserved: 'bg-blue-500/20 border-blue-500/50 text-blue-200',
    modified: 'bg-red-500/30 border-red-500/60 text-red-200'
  },
  "专有名词": {
    preserved: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200',
    modified: 'bg-red-500/30 border-red-500/60 text-red-200'
  },
  "公式符号": {
    preserved: 'bg-purple-500/20 border-purple-500/50 text-purple-200',
    modified: 'bg-red-500/30 border-red-500/60 text-red-200'
  },
  "化学术语": {
    preserved: 'bg-green-500/20 border-green-500/50 text-green-200',
    modified: 'bg-red-500/30 border-red-500/60 text-red-200'
  },
  "医学术语": {
    preserved: 'bg-red-400/20 border-red-400/50 text-red-100',
    modified: 'bg-red-500/30 border-red-500/60 text-red-200'
  },
  "法律术语": {
    preserved: 'bg-amber-500/20 border-amber-500/50 text-amber-200',
    modified: 'bg-red-500/30 border-red-500/60 text-red-200'
  },
  "其他": {
    preserved: 'bg-slate-500/20 border-slate-500/50 text-slate-200',
    modified: 'bg-red-500/30 border-red-500/60 text-red-200'
  }
};

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderTextWithTerminologyHighlight(text, terminologyAnalysis, onRevertModified) {
  if (!text) return null;
  if (!terminologyAnalysis) {
    return <span className="whitespace-pre-wrap break-words">{text}</span>;
  }

  const preserved = terminologyAnalysis.preserved || [];
  const modified = terminologyAnalysis.modified || [];

  const segments = [];

  const preservedTerms = preserved.map(t => ({
    term: t.term,
    category: t.category,
    status: 'preserved',
    description: t.description,
    positions: t.rewritten_positions || []
  }));

  const modifiedTerms = modified.map(t => ({
    term: t.term,
    category: t.category,
    status: 'modified',
    description: t.description,
    original_positions: t.original_positions || [],
    original_count: t.original_count || 0,
    rewritten_count: t.rewritten_count || 0
  }));

  const allTerms = [...preservedTerms];

  if (allTerms.length === 0 && modifiedTerms.length === 0) {
    return <span className="whitespace-pre-wrap break-words">{text}</span>;
  }

  const sortedTerms = [...allTerms].sort((a, b) => b.term.length - a.term.length);

  const regex = new RegExp(
    '(' + sortedTerms.map(t => escapeRegExp(t.term)).join('|') + ')',
    'gi'
  );

  const parts = text.split(regex);

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, idx) => {
        if (!part) return null;
        const matched = sortedTerms.find(
          t => t.term.toLowerCase() === part.toLowerCase()
        );
        if (matched) {
          const colors = TERM_CATEGORY_COLORS[matched.category] || TERM_CATEGORY_COLORS["其他"];
          return (
            <span
              key={idx}
              className={`inline px-1 py-0.5 rounded border ${colors.preserved} font-medium`}
              title={`${matched.category}: ${matched.term}${matched.description ? ' - ' + matched.description : ''} (已保护)`}
            >
              {part}
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </span>
  );
}

export function getTerminologyCategoryColors() {
  return TERM_CATEGORY_COLORS;
}
