// src/lib/elements_manager.js

export function mergeElements(currentElements, llmReturnedElements) {
  if (!Array.isArray(llmReturnedElements)) {
    return Array.isArray(currentElements) ? currentElements : [];
  }

  const cleaned = llmReturnedElements
    .map(e => typeof e === 'string' ? e.trim() : '')
    .filter(e => e.length > 0)
    .filter((e, i, arr) => arr.indexOf(e) === i);

  return cleaned;
}

export function extractRealWorldHooks(childText) {
  if (!childText || typeof childText !== 'string') return [];
  const hooks = [];

  const patterns = [
    { regex: /我家(有|养)(一只|一条|一个|个)?([\u4e00-\u9fa5]{1,5})/g,
      template: t => `孩子家有${t[3]}` },
    { regex: /(妈妈|爸爸|奶奶|爷爷|外婆|外公|哥哥|姐姐|弟弟|妹妹)/g,
      template: t => `孩子提到${t[1]}` },
    { regex: /今天(.*?)(很|好|了|啊)/g,
      template: t => `孩子今天${t[1]}` },
    { regex: /昨天(.*?)(很|好|了|啊)/g,
      template: t => `孩子昨天${t[1]}` },
    { regex: /(幼儿园|学校|老师|同学)([\u4e00-\u9fa5]{1,10})/g,
      template: t => `孩子在${t[1]}${t[2]}` },
    { regex: /我(很|最)?喜欢([\u4e00-\u9fa5]{1,8})/g,
      template: t => `孩子喜欢${t[2]}` }
  ];

  for (const { regex, template } of patterns) {
    let match;
    while ((match = regex.exec(childText)) !== null) {
      try { hooks.push(template(match)); } catch (e) { /* skip */ }
    }
  }

  return [...new Set(hooks)];
}
