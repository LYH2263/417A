const SHORT_LINE_THRESHOLD = 40;

export function smartSplitParagraphs(text) {
  if (!text) return [];
  const rawLines = text.split('\n');
  const paragraphs = [];
  let currentBuffer = [];

  for (const line of rawLines) {
    const stripped = line.trim();
    if (!stripped) {
      if (currentBuffer.length) {
        paragraphs.push(currentBuffer.join('\n').trim());
        currentBuffer = [];
      }
      continue;
    }
    const isShort = stripped.length < SHORT_LINE_THRESHOLD;
    if (!currentBuffer.length) {
      currentBuffer.push(stripped);
    } else {
      const lastInBuffer = currentBuffer[currentBuffer.length - 1];
      const lastIsShort = lastInBuffer.length < SHORT_LINE_THRESHOLD;
      if (isShort || lastIsShort) {
        currentBuffer.push(stripped);
      } else {
        paragraphs.push(currentBuffer.join('\n').trim());
        currentBuffer = [stripped];
      }
    }
  }
  if (currentBuffer.length) {
    paragraphs.push(currentBuffer.join('\n').trim());
  }
  return paragraphs.filter(p => p && p.trim());
}

export function buildParagraphsFromText(text) {
  const split = smartSplitParagraphs(text);
  return split.map((t, i) => ({
    id: i,
    text: t,
    selected: true,
    locked: false
  }));
}

export function applyRecommendations(detectResult, currentParagraphs) {
  if (!detectResult?.details || !currentParagraphs.length) return currentParagraphs;
  const aiScoresMap = {};
  detectResult.details.forEach((d) => {
    const score = Math.round((d.ai_score ?? d.mean ?? 0) * 100);
    aiScoresMap[d.text] = score;
  });
  return currentParagraphs.map((p) => {
    const score = aiScoresMap[p.text];
    if (score === undefined) return p;
    if (p.locked) return { ...p, _aiScore: score, _recommendation: 'normal' };
    if (score > 60) {
      return { ...p, selected: true, _aiScore: score, _recommendation: 'suggest' };
    } else if (score < 20) {
      return { ...p, selected: false, _aiScore: score, _recommendation: 'safe' };
    }
    return { ...p, _aiScore: score, _recommendation: 'normal' };
  });
}
