// Percentage is a postfix operator: 2 / 50% means 2 / (50 / 100).
// Apply before expanding calculator function tokens; preserve grouping.
window.knoxPercentExpression = function (input) {
  let source = String(input);
  while (source.includes('%')) {
    const end = source.indexOf('%');
    let start = end - 1;
    if (source[start] === ')') {
      let depth = 1;
      while (--start >= 0) {
        if (source[start] === ')') depth++;
        if (source[start] === '(' && --depth === 0) break;
      }
      if (start < 0) throw new Error('Unmatched parentheses');
      // Include a named function or a token that represents its opening paren.
      const fn = source.slice(0, start).match(/(?:Math\.[A-Za-z0-9]+|__[A-Za-z]+)$/);
      if (fn) start -= fn[0].length;
    } else {
      const match = source.slice(0, end).match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$|Math\.(?:PI|E)$|[\u000e\u000f]$/);
      if (!match) throw new Error('Percent requires a value');
      start = end - match[0].length;
    }
    source = source.slice(0, start) + '(' + source.slice(start, end) + '/100)' + source.slice(end + 1);
  }
  return source;
};
