const recast = require('recast');

const Utils = require('./utils');

const Files = {
  Utils: new Set(),
  Global: new Map(),
  Constants: new Set()
};

const getGlobalFile = () => {
  const getAssignment = ([left, right]) => (
    `Global.${left} = ${right ? `${right}()` : null }`
  )
  
  const variables = Array.from(Files.Global)
    .map(getAssignment)
    .filter(Boolean)
    .join('\n')

  return `
    const Global = {};

    ${variables}
    
    module.exports.Global = Global;
  `
}

module.exports.setNodeItem = (filename, item) => {
  const file = Files[filename] || new Set();
  
  if (filename === 'Global') {
    file.set(...item)
  } else {
    file.add(item)
  }

  Files[filename] = file;
}

module.exports.getFileAST = (filename) => {
  if (filename === 'Global') {
    return [recast.parse(getGlobalFile())];
  }

  return Array.from(Files[filename]);
}

module.exports.getFilenames = () => {
  return Object.keys(Files);
}