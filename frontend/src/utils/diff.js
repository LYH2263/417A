function tokenize(text) {
  const tokens = [];
  const regex = /(\s+|[^\s]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

export function computeWordDiff(oldText, newText) {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  const m = oldTokens.length;
  const n = newTokens.length;

  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const operations = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      operations.unshift({ type: 'equal', value: oldTokens[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      operations.unshift({ type: 'insert', value: newTokens[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] > dp[i][j - 1])) {
      operations.unshift({ type: 'delete', value: oldTokens[i - 1] });
      i--;
    }
  }

  const merged = [];
  let idx = 0;
  while (idx < operations.length) {
    const op = operations[idx];
    if (op.type === 'insert' || op.type === 'delete') {
      let deleteBuffer = [];
      let insertBuffer = [];
      while (idx < operations.length && (operations[idx].type === 'insert' || operations[idx].type === 'delete')) {
        if (operations[idx].type === 'delete') {
          deleteBuffer.push(operations[idx].value);
        } else {
          insertBuffer.push(operations[idx].value);
        }
        idx++;
      }
      if (deleteBuffer.length > 0 && insertBuffer.length > 0) {
        merged.push({ type: 'replace', oldValue: deleteBuffer.join(''), newValue: insertBuffer.join('') });
      } else if (deleteBuffer.length > 0) {
        merged.push({ type: 'delete', value: deleteBuffer.join('') });
      } else {
        merged.push({ type: 'insert', value: insertBuffer.join('') });
      }
    } else {
      merged.push(op);
      idx++;
    }
  }

  return merged;
}
